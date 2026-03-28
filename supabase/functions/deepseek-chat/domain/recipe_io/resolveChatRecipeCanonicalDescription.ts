/**
 * Пайплайн канонического description для chat_ai: сырой LLM → гейт → repair (один вызов) → аварийный fallback.
 */

import { textContainsRequestContextLeak } from "../../../_shared/requestContextLeakGuard.ts";
import { repairChatRecipeDescription } from "./chatDescriptionRepair.ts";
import { buildEmergencyChatRecipeDescription } from "./chatEmergencyDescription.ts";
import {
  DESCRIPTION_MAX_LENGTH,
  explainCanonicalDescriptionRejection,
  normalizeSpaces,
  passesDescriptionQualityGate,
} from "./sanitizeAndRepair.ts";

export type ChatCanonicalDescriptionSource = "llm_raw" | "llm_repair" | "emergency_fallback";

export type ResolveChatRecipeDescriptionResult = {
  description: string;
  source: ChatCanonicalDescriptionSource;
  rejectionReasonRaw: string | null;
  rejectionReasonAfterRepair: string | null;
};

function acceptsLlmDescription(text: string, title: string): boolean {
  const t = normalizeSpaces(text);
  return (
    t.length > 0 &&
    !textContainsRequestContextLeak(t) &&
    passesDescriptionQualityGate(t, { title })
  );
}

/**
 * @param log — опционально JSON-строка для safeLog/console (теги DESCRIPTION_PIPELINE_*).
 */
export async function resolveChatRecipeCanonicalDescription(input: {
  sanitizedLlmDescription: string;
  title: string;
  ingredientNames: string[];
  apiKey: string | null | undefined;
  requestId?: string;
  log?: (line: string) => void;
}): Promise<ResolveChatRecipeDescriptionResult> {
  const title = (input.title ?? "").trim();
  const t0 = normalizeSpaces(input.sanitizedLlmDescription);
  const emergency = buildEmergencyChatRecipeDescription({
    title,
    ingredients: input.ingredientNames,
    recipeIdSeed: input.requestId ?? title,
  });

  const log = input.log ?? (() => {});
  const base = { request_id: input.requestId, title_len: title.length };

  if (acceptsLlmDescription(t0, title)) {
    log(
      JSON.stringify({
        tag: "DESCRIPTION_PIPELINE_RAW_ACCEPTED",
        ...base,
      }),
    );
    return {
      description: t0.slice(0, DESCRIPTION_MAX_LENGTH),
      source: "llm_raw",
      rejectionReasonRaw: null,
      rejectionReasonAfterRepair: null,
    };
  }

  const rejectionReasonRaw = explainCanonicalDescriptionRejection(t0, { title });
  const apiKey = input.apiKey?.trim() ?? "";

  if (!apiKey) {
    log(
      JSON.stringify({
        tag: "DESCRIPTION_PIPELINE_FALLBACK_USED",
        ...base,
        reason: "no_api_key_for_repair",
        rejection_reason_raw: rejectionReasonRaw,
      }),
    );
    return {
      description: emergency,
      source: "emergency_fallback",
      rejectionReasonRaw,
      rejectionReasonAfterRepair: null,
    };
  }

  log(
    JSON.stringify({
      tag: "DESCRIPTION_PIPELINE_REPAIR_ATTEMPT",
      ...base,
      rejection_reason_raw: rejectionReasonRaw,
    }),
  );

  const repaired = await repairChatRecipeDescription(t0, apiKey, {
    title,
    ingredients: input.ingredientNames,
  });
  const t1 = normalizeSpaces(repaired ?? "");

  if (repaired && acceptsLlmDescription(t1, title)) {
    log(
      JSON.stringify({
        tag: "DESCRIPTION_PIPELINE_REPAIR_ACCEPTED",
        ...base,
        rejection_reason_raw: rejectionReasonRaw,
      }),
    );
    return {
      description: t1.slice(0, DESCRIPTION_MAX_LENGTH),
      source: "llm_repair",
      rejectionReasonRaw,
      rejectionReasonAfterRepair: null,
    };
  }

  const rejectionReasonAfterRepair = repaired
    ? explainCanonicalDescriptionRejection(t1, { title })
    : "repair_failed_or_empty";

  log(
    JSON.stringify({
      tag: "DESCRIPTION_PIPELINE_FALLBACK_USED",
      ...base,
      rejection_reason_raw: rejectionReasonRaw,
      rejection_reason_after_repair: rejectionReasonAfterRepair,
    }),
  );

  return {
    description: emergency,
    source: "emergency_fallback",
    rejectionReasonRaw,
    rejectionReasonAfterRepair,
  };
}
