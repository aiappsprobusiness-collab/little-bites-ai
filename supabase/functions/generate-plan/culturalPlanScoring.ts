/**
 * Stage 4.4.2: мягкий cultural scoring по `recipes.familiarity` в generate-plan.
 * Без locale как proxy для кухни; без LLM. Только небольшие поправки к скору.
 */

/** Небольшой буст для широко понятных рецептов (см. progress doc Stage 4.4). */
export const CULTURAL_CLASSIC_BONUS = 0.75;
/** Нейтрально для «адаптированных» и для NULL/неизвестного (как safe default adapted). */
export const CULTURAL_ADAPTED_BONUS = 0;
/**
 * Величина вычитается для `specific` (мягкий штраф, не exclusion).
 * Используется как положительное число: бонус = -CULTURAL_SPECIFIC_PENALTY.
 */
export const CULTURAL_SPECIFIC_PENALTY = 0.75;

export type CulturalFamiliarityCountKey = "classic" | "adapted" | "specific" | "other";

/** Группировка для логов и агрегатов (NULL / прочее → other). */
export function culturalFamiliarityCountKey(familiarity: string | null | undefined): CulturalFamiliarityCountKey {
  const v = (familiarity ?? "").trim().toLowerCase();
  if (v === "classic") return "classic";
  if (v === "adapted") return "adapted";
  if (v === "specific") return "specific";
  return "other";
}

/** MVP: только familiarity; `other` ведёт себя как adapted (нейтрально). */
export function computeCulturalFamiliarityBonus(familiarity: string | null | undefined): number {
  const v = (familiarity ?? "").trim().toLowerCase();
  if (v === "classic") return CULTURAL_CLASSIC_BONUS;
  if (v === "specific") return -CULTURAL_SPECIFIC_PENALTY;
  if (v === "adapted" || v === "") return CULTURAL_ADAPTED_BONUS;
  return CULTURAL_ADAPTED_BONUS;
}

export function countCulturalFamiliarityInRecipes(
  rows: Array<{ familiarity?: string | null }>,
): Record<CulturalFamiliarityCountKey, number> {
  const out: Record<CulturalFamiliarityCountKey, number> = { classic: 0, adapted: 0, specific: 0, other: 0 };
  for (const r of rows) {
    out[culturalFamiliarityCountKey(r.familiarity)]++;
  }
  return out;
}
