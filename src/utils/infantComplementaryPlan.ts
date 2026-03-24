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

/** Вторая фраза в hero после «грудное молоко или смесь». */
export function infantComplementaryIntroSecondLineText(band: InfantComplementaryAgeBandU12 | null): string {
  if (band === "4_6") return "Прикорм вводится постепенно, обычно 1–2 раза в день.";
  if (band === "9_11") return "Рацион становится разнообразнее, обычно 1–2 раза в день.";
  return "Рацион постепенно расширяется, обычно 1–2 раза в день.";
}

/** Строка после «Сегодня мы подобрали…» — про выбранное блюдо. */
export function infantComplementaryPickQualificationText(band: InfantComplementaryAgeBandU12 | null): string {
  if (band === "4_6") return "Это мягкий и безопасный вариант для начала прикорма";
  if (band === "9_11") return "Подходит для текущего этапа питания малыша";
  return "Это мягкий и понятный вариант, который хорошо подходит на этапе расширения прикорма";
}

/** Доп. строка под слотами прикорма (не hero, не про наблюдение за реакцией). */
export function infantComplementaryGuidanceExtraText(band: InfantComplementaryAgeBandU12 | null): string {
  if (band === "4_6") return "В начале прикорма достаточно одного нового блюда в день.";
  if (band === "9_11") return "Рацион становится разнообразнее, можно предлагать 1–2 блюда в день.";
  return "Если малыш уже привык к прикорму, можно предложить ещё одно блюдо позже.";
}
