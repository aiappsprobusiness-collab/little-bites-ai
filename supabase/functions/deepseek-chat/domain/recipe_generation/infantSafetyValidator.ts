/**
 * Пост-LLM проверки для infant recipe path (продуктовые правила, не мед. гарантии).
 * reason_code — только из infantReasonCodes.ts (канонический словарь).
 */
import type { RecipeJson } from "../../recipeSchema.ts";
import type { InfantStage } from "./infantRecipePrompt.ts";
import type { InfantValidatorReasonCode, InfantValidatorSeverity } from "./infantReasonCodes.ts";

export type { InfantValidatorSeverity } from "./infantReasonCodes.ts";

export interface InfantRecipeValidationResult {
  ok: boolean;
  severity: InfantValidatorSeverity;
  reason_code: InfantValidatorReasonCode;
  explanation?: string;
}

const ADULT_DISH_RE = /жарен|жарка|гриль|копчён|копчен|маринад|фарширован|фастфуд|острый соус|консервированн/i;
const CHUNKY_TEXTURE_RE = /кубик(ами)?|соломк|крупн(ый|ых)\s+кус|целые\s+котлет|отбивн|стейк/i;
const UNSAFE_SERVE_RE = /бутерброд|канапе|шпажк|барн|фуршет|банкет/i;
const EARLY_CHUNK_RE = /нарежьте|нарезать|кусочк/i;
const COMPLEX_DISH_RE = /многослойн|запеканк|лазань|торт|фарширован|рулет|енчилад/i;
const STAGE_CONFLICT_RE = /цельн(ый|ая|ое)\s+(кусок|стейк|котлет)/i;

const MAX_INGREDIENTS_BY_STAGE: Record<InfantStage, number> = {
  "6_7": 5,
  "8_9": 7,
  "10_11": 8,
};

const MAX_STEPS_BY_STAGE: Record<InfantStage, number> = {
  "6_7": 6,
  "8_9": 7,
  "10_11": 8,
};

function joinRecipeText(recipe: RecipeJson): string {
  const parts: string[] = [];
  if (recipe.title) parts.push(String(recipe.title));
  if (recipe.description) parts.push(String(recipe.description));
  if (Array.isArray(recipe.steps)) parts.push(recipe.steps.filter((s) => typeof s === "string").join(" "));
  return parts.join(" \n ");
}

/**
 * ctx.ageMonths — для защиты от ошибочного routing (ожидается 6–11).
 */
export function validateInfantRecipe(
  recipe: RecipeJson,
  ctx: { stage: InfantStage; ageMonths: number },
): InfantRecipeValidationResult {
  const { stage, ageMonths } = ctx;
  if (ageMonths < 6 || ageMonths > 11) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "invalid_age_range",
      explanation: `ageMonths=${ageMonths}, expected 6–11`,
    };
  }

  const ingCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
  const stepCount = Array.isArray(recipe.steps) ? recipe.steps.filter((s) => typeof s === "string" && s.trim()).length : 0;

  const maxIng = MAX_INGREDIENTS_BY_STAGE[stage];
  if (ingCount > maxIng) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "too_many_ingredients_for_stage",
      explanation: `ingredients=${ingCount}, max=${maxIng} for stage ${stage}`,
    };
  }

  const maxSteps = MAX_STEPS_BY_STAGE[stage];
  if (stepCount > maxSteps) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "too_complex_for_stage",
      explanation: `steps=${stepCount}, max=${maxSteps}`,
    };
  }

  const blob = joinRecipeText(recipe);

  if (COMPLEX_DISH_RE.test(blob) && stage === "6_7") {
    return {
      ok: false,
      severity: "hard",
      reason_code: "too_complex_for_stage",
      explanation: "Слишком сложная комбинация / блюдо для этапа 6–7 мес.",
    };
  }

  if (ADULT_DISH_RE.test(blob)) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "adult_style_dish",
      explanation: "Жарка/гриль/копчение и т.п. не подходят для infant path.",
    };
  }

  if (UNSAFE_SERVE_RE.test(blob)) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "unsafe_serving_format",
      explanation: "Подача не для прикорма (бутерброды, канапе…).",
    };
  }

  if (STAGE_CONFLICT_RE.test(blob) && (stage === "6_7" || stage === "8_9")) {
    return {
      ok: false,
      severity: "hard",
      reason_code: "stage_incompatible_recipe",
      explanation: "Крупные цельные куски не соответствуют этапу.",
    };
  }

  if (stage === "6_7") {
    if (CHUNKY_TEXTURE_RE.test(blob) || EARLY_CHUNK_RE.test(blob)) {
      return {
        ok: false,
        severity: "hard",
        reason_code: "invalid_texture_for_stage",
        explanation: "Для 6–7 мес ожидается однородное/очень мягкое пюре без кусочков.",
      };
    }
  }

  if (stage === "8_9" && CHUNKY_TEXTURE_RE.test(blob)) {
    return {
      ok: false,
      severity: "soft",
      reason_code: "ambiguous_texture_description",
      explanation: "Возможны слишком жёсткие формулировки для 8–9 мес — уточнить консистенцию.",
    };
  }

  /** Верхняя граница числа ингредиентов — мягкий сигнал на retry (не hard). */
  if (ingCount === maxIng && maxIng >= 4) {
    return {
      ok: false,
      severity: "soft",
      reason_code: "too_many_new_elements_at_once",
      explanation: `Число ингредиентов на максимуме для этапа ${stage} (${ingCount}).`,
    };
  }

  return { ok: true, severity: "soft", reason_code: "ok" };
}
