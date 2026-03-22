/**
 * Единый словарь reason_code для infant path и severity.
 * Новые коды не добавлять без обновления docs/architecture/chat_recipe_generation.md.
 */

export type InfantValidatorSeverity = "soft" | "hard" | "technical";

/** Для API/клиента: technical отображается как hard. */
export function outwardInfantSeverity(s: InfantValidatorSeverity): "soft" | "hard" {
  return s === "technical" ? "hard" : s;
}

/** Hard: сразу reject, без второго LLM. */
export const INFANT_REASON_HARD_REJECT = [
  "invalid_age_range",
  "too_many_ingredients_for_stage",
  "too_complex_for_stage",
  "invalid_texture_for_stage",
  "adult_style_dish",
  "unsafe_serving_format",
  "stage_incompatible_recipe",
] as const;

/**
 * Soft: одна повторная генерация с уточняющим suffix в промпте.
 * `ambiguous_serving_guidance` и `insufficient_stage_adaptation` — валидные канонические коды для retry-политики;
 * эвристики в `infantSafetyValidator` могут быть добавлены позже без смены имён кодов.
 */
export const INFANT_REASON_SOFT_RETRY = [
  "too_many_new_elements_at_once",
  "ambiguous_texture_description",
  "ambiguous_serving_guidance",
  "insufficient_stage_adaptation",
] as const;

/** Technical: подробные логи; наружу severity как hard; retry только для parse/contract (см. infantRecipe.ts). */
export const INFANT_REASON_TECHNICAL = [
  "infant_prompt_contract_violation",
  "infant_recipe_parse_failed",
  "infant_validator_internal_error",
] as const;

export type InfantHardRejectReasonCode = (typeof INFANT_REASON_HARD_REJECT)[number];
export type InfantSoftRetryReasonCode = (typeof INFANT_REASON_SOFT_RETRY)[number];
export type InfantTechnicalReasonCode = (typeof INFANT_REASON_TECHNICAL)[number];
export type InfantValidatorReasonCode =
  | InfantHardRejectReasonCode
  | InfantSoftRetryReasonCode
  | InfantTechnicalReasonCode
  | "ok";

export function isInfantSoftRetryReason(code: string): code is InfantSoftRetryReasonCode {
  return (INFANT_REASON_SOFT_RETRY as readonly string[]).includes(code);
}

export function isInfantHardRejectReason(code: string): code is InfantHardRejectReasonCode {
  return (INFANT_REASON_HARD_REJECT as readonly string[]).includes(code);
}

export function isInfantTechnicalReason(code: string): code is InfantTechnicalReasonCode {
  return (INFANT_REASON_TECHNICAL as readonly string[]).includes(code);
}

/** Blocking code для 0–5 мес (не validator infant-рецепта). */
export const UNDER_6_RECIPE_BLOCK_REASON_CODE = "under_6_recipe_block" as const;
