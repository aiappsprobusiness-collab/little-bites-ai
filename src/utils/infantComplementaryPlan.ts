/**
 * Режим «прикорм» на вкладке План: один профиль ребёнка с age_months < 12,
 * без режима «Семья». Используется для UX и согласованности с Edge generate-plan.
 */

export function isInfantComplementaryPlanContext(params: {
  memberId: string | null | undefined;
  isFamilyMode: boolean;
  ageMonths: number | null | undefined;
}): boolean {
  if (params.isFamilyMode) return false;
  if (params.memberId == null || params.memberId === "") return false;
  const age = params.ageMonths;
  if (age == null || !Number.isFinite(age)) return false;
  return Math.max(0, Math.round(age)) < 12;
}

/**
 * Три UX-группы прикорма на клиенте (age_months < 12). Логику подбора на Edge не меняет.
 * 0–6 мес — как 4–6 (один слот в UI); 7–8; 9–11.
 */
export type InfantComplementaryAgeBandU12 = "4_6" | "7_8" | "9_11";

export function getInfantComplementaryAgeBandU12(ageMonths: number | null): InfantComplementaryAgeBandU12 | null {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return null;
  const m = Math.max(0, Math.round(ageMonths));
  if (m <= 6) return "4_6";
  if (m <= 8) return "7_8";
  return "9_11";
}

/** Тексты hero прикорма задаются в `MealPlanPage` (единый короткий блок для всех возрастов &lt;12 мес). */
