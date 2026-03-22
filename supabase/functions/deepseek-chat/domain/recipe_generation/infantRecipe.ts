/**
 * Изолированный LLM-поток для infant recipe (6–11 мес).
 * Standard recipe prompt и общий оркестратор не меняются; вызывается только из recipe path.
 */
import type { MemberData } from "../../buildPrompt.ts";
import type { RecipeJson } from "../../recipeSchema.ts";
import {
  parseAndValidateRecipeJsonFromString,
  ingredientsNeedAmountRetry,
  applyIngredientsFallbackHeuristic,
} from "../../recipeSchema.ts";
import { validateRecipe } from "../recipe_io/index.ts";
import { buildInfantRecipeSystemPrompt, resolveInfantStage, type InfantRecipePromptOptions } from "./infantRecipePrompt.ts";
import { validateInfantRecipe, type InfantRecipeValidationResult } from "./infantSafetyValidator.ts";
import {
  outwardInfantSeverity,
  isInfantSoftRetryReason,
  type InfantValidatorSeverity,
} from "./infantReasonCodes.ts";

const RECIPE_MAX_TOKENS = 1600;
const INFANT_LLM_TIMEOUT_MS = 25000;

export interface InfantRecipeGenerationParams extends InfantRecipePromptOptions {
  apiKey: string;
  userMessage: string;
  member: MemberData;
  requestId: string;
}

export type InfantRecipeGenerationResult =
  | { ok: true; recipe: RecipeJson; usage: unknown; retryCount: number; lastValidation: InfantRecipeValidationResult }
  | {
    ok: false;
    userMessage: string;
    reason_code: string;
    retryCount: number;
    usage: unknown;
    lastValidation?: InfantRecipeValidationResult;
    /** technical внутри → всегда hard */
    severity_outward: "soft" | "hard";
  };

async function callDeepSeekJson(args: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  requestId: string;
  attempt: number;
}): Promise<{ content: string; usage: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INFANT_LLM_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userMessage },
        ],
        stream: false,
        max_tokens: RECIPE_MAX_TOKENS,
        temperature: 0.35,
        top_p: 0.85,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DeepSeek HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    console.log(JSON.stringify({
      tag: "recipe_infant_path",
      requestId: args.requestId,
      attempt: args.attempt,
      response_chars: content.length,
    }));
    return { content, usage: data.usage ?? null };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

const REJECT_USER_MESSAGE =
  "Не удалось подобрать подходящее простое блюдо для этого возраста. Попробуйте переформулировать запрос (один продукт или одно блюдо) или обратитесь к педиатру по схеме прикорма.";

function logValidator(
  requestId: string,
  attempt: number,
  v: InfantRecipeValidationResult,
): void {
  const outward = outwardInfantSeverity(v.severity);
  console.log(JSON.stringify({
    tag: "recipe_infant_validator",
    requestId,
    attempt,
    ok: v.ok,
    severity: v.severity,
    severity_outward: outward,
    reason_code: v.reason_code,
    explanation: v.explanation,
  }));
}

function failResult(
  reason_code: string,
  attempt: number,
  usage: unknown,
  lastValidation: InfantRecipeValidationResult | undefined,
  severity: InfantValidatorSeverity = "technical",
): InfantRecipeGenerationResult {
  return {
    ok: false,
    userMessage: REJECT_USER_MESSAGE,
    reason_code,
    retryCount: attempt,
    usage,
    lastValidation,
    severity_outward: outwardInfantSeverity(severity),
  };
}

export async function runInfantRecipeGeneration(params: InfantRecipeGenerationParams): Promise<InfantRecipeGenerationResult> {
  const ageRaw = params.member.age_months ?? params.member.ageMonths;
  const ageMonths = typeof ageRaw === "number" && !Number.isNaN(ageRaw) ? Math.max(0, Math.floor(ageRaw)) : 0;
  const stage = resolveInfantStage(ageMonths);

  console.log(JSON.stringify({
    tag: "recipe_infant_path",
    requestId: params.requestId,
    age_months: ageMonths,
    infant_stage: stage,
    phase: "start",
  }));

  let basePrompt = buildInfantRecipeSystemPrompt(params.member, ageMonths, params);
  let lastUsage: unknown = null;
  let lastValidation: InfantRecipeValidationResult | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string;
    try {
      const r = await callDeepSeekJson({
        apiKey: params.apiKey,
        systemPrompt: basePrompt,
        userMessage: params.userMessage,
        requestId: params.requestId,
        attempt,
      });
      content = r.content;
      lastUsage = r.usage;
    } catch (e) {
      console.log(JSON.stringify({
        tag: "recipe_infant_path",
        requestId: params.requestId,
        phase: "llm_error",
        attempt,
        reason_code: "infant_validator_internal_error",
        severity: "technical",
        severity_outward: "hard",
        error: e instanceof Error ? e.message : String(e),
      }));
      return failResult("infant_validator_internal_error", attempt, lastUsage, lastValidation, "technical");
    }

    if (!content) {
      console.log(JSON.stringify({
        tag: "recipe_infant_path",
        requestId: params.requestId,
        phase: "empty_response",
        attempt,
        reason_code: "infant_prompt_contract_violation",
        severity: "technical",
        severity_outward: "hard",
      }));
      if (attempt === 0) {
        basePrompt += "\n\nПредыдущий ответ был пустым. Верни один полный JSON-объект рецепта.";
        continue;
      }
      return failResult("infant_prompt_contract_violation", attempt, lastUsage, lastValidation, "technical");
    }

    const parseLog = (msg: string, meta?: Record<string, unknown>) =>
      console.log(JSON.stringify({ tag: "RECIPE_PARSE_INFANT", requestId: params.requestId, attempt, ...meta, msg }));

    const parsed = validateRecipe(content, parseAndValidateRecipeJsonFromString);
    if (parsed.stage !== "ok" || !parsed.valid) {
      console.log(JSON.stringify({
        tag: "recipe_infant_path",
        requestId: params.requestId,
        phase: "parse_failed",
        attempt,
        parse_stage: parsed.stage,
        reason_code: "infant_recipe_parse_failed",
        severity: "technical",
        severity_outward: "hard",
        error: "error" in parsed ? parsed.error : undefined,
      }));
      if (attempt === 0) {
        basePrompt +=
          "\n\nПредыдущий ответ не прошёл схему JSON рецепта. Верни один корректный JSON-объект рецепта без markdown и без текста до/после.";
        continue;
      }
      return failResult("infant_recipe_parse_failed", attempt, lastUsage, lastValidation, "technical");
    }

    let recipe = parsed.valid;
    if (ingredientsNeedAmountRetry(recipe.ingredients)) {
      applyIngredientsFallbackHeuristic(
        recipe.ingredients as Array<
          Record<string, unknown> & {
            name?: string;
            amount?: string;
            displayText?: string;
            canonical?: { amount: number; unit: string } | null;
          }
        >,
      );
    }

    const v = validateInfantRecipe(recipe, { stage, ageMonths });
    lastValidation = v;
    logValidator(params.requestId, attempt, v);

    if (v.ok) {
      return { ok: true, recipe, usage: lastUsage, retryCount: attempt, lastValidation: v };
    }

    if (v.severity === "hard" || v.severity === "technical") {
      return failResult(v.reason_code, attempt, lastUsage, v, v.severity);
    }

    if (isInfantSoftRetryReason(v.reason_code)) {
      if (attempt === 0) {
        basePrompt += "\n\nПредыдущий рецепт отклонён проверкой: " + v.reason_code +
          (v.explanation ? " (" + v.explanation + ")" : "") +
          ". Упрости: меньше новых компонентов, явная текстура и подача для этапа прикорма.";
        continue;
      }
      return failResult(v.reason_code, attempt, lastUsage, v, "soft");
    }

    return failResult(v.reason_code, attempt, lastUsage, v, v.severity);
  }

  return failResult("infant_recipe_parse_failed", 2, lastUsage, lastValidation, "technical");
}
