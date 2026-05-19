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
 * В БД `meal_plans.meal_type` для прикорма фиксированно: «новый продукт» → breakfast, «уже знакомое» → lunch.
 * Смысл UI — две роли `newRecipe` / `familiarRecipe`, не завтрак/обед.
 */
export const INFANT_PLAN_SLOT_NEW_PRODUCT = "breakfast" as const;
export const INFANT_PLAN_SLOT_FAMILIAR = "lunch" as const;

export function isInfantNewRecipePlanSlot(slotId: string): boolean {
  return slotId === INFANT_PLAN_SLOT_NEW_PRODUCT;
}

export function isInfantFamiliarRecipePlanSlot(slotId: string): boolean {
  return slotId === INFANT_PLAN_SLOT_FAMILIAR;
}

/**
 * Три UX-группы прикорма на клиенте (age_months < 12). Логику подбора на Edge не меняет.
 */
export type InfantComplementaryAgeBandU12 = "4_6" | "7_8" | "9_11";

export function getInfantComplementaryAgeBandU12(ageMonths: number | null): InfantComplementaryAgeBandU12 | null {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return null;
  const m = Math.max(0, Math.round(ageMonths));
  if (m <= 6) return "4_6";
  if (m <= 8) return "7_8";
  return "9_11";
}

/** Янтарное предупреждение в hero info-блоке плана прикорма (0–5 мес); с 6 мес — без него. */
export type InfantPlanHeroNoticeKind = "too_early" | "doctor";

export const INFANT_PLAN_HERO_NOTICE_TOO_EARLY =
  "До 4 месяцев прикорм обычно не начинают. Сейчас основное питание — грудное молоко или адаптированная смесь. Сроки ввода обсудите с педиатром.";

export const INFANT_PLAN_HERO_NOTICE_DOCTOR =
  "В 4–5 месяцев прикорм вводят только по согласованию с врачом.";

export const INFANT_PLAN_HERO_BODY_BEFORE_COMPLEMENTARY =
  "Основное питание — грудное молоко или смесь. Прикорм обычно начинают ближе к 4–6 месяцам.";

export const INFANT_PLAN_HERO_BODY_COMPLEMENTARY_ACTIVE =
  "Основное питание — грудное молоко или смесь. Прикорм вводится постепенно, обычно 1–2 раза в день.";

export function getInfantPlanHeroNoticeKind(ageMonths: number | null): InfantPlanHeroNoticeKind | null {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return null;
  const m = Math.max(0, Math.round(ageMonths));
  if (m < 4) return "too_early";
  if (m <= 5) return "doctor";
  return null;
}

export function getInfantPlanHeroBodyParagraph(ageMonths: number | null): string {
  const kind = getInfantPlanHeroNoticeKind(ageMonths);
  if (kind === "too_early") return INFANT_PLAN_HERO_BODY_BEFORE_COMPLEMENTARY;
  return INFANT_PLAN_HERO_BODY_COMPLEMENTARY_ACTIVE;
}

export function getInfantPlanHeroNoticeText(kind: InfantPlanHeroNoticeKind): string {
  return kind === "too_early" ? INFANT_PLAN_HERO_NOTICE_TOO_EARLY : INFANT_PLAN_HERO_NOTICE_DOCTOR;
}
