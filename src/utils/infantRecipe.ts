export type InfantRecipeAgeRangeLike = {
  min_age_months?: number | null;
  max_age_months?: number | null;
  // Иногда в коде встречается camelCase.
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
};

const INFANT_MAX_AGE_MONTHS_EXCLUSIVE = 12;

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Infant recipe: безопасный канонический критерий по данным `max_age_months < 12`. */
export function isInfantRecipe(recipe: InfantRecipeAgeRangeLike | null | undefined): boolean {
  const max = recipe?.max_age_months ?? recipe?.maxAgeMonths ?? null;
  const maxNum = toFiniteNumber(max);
  if (maxNum == null) return false;
  return maxNum < INFANT_MAX_AGE_MONTHS_EXCLUSIVE;
}

export const CHEF_ADVICE_TITLE = "Совет от шефа";
export const MOM_ADVICE_TITLE = "Подсказка для мамы";

export function getAdviceSectionTitle(params: {
  recipe: InfantRecipeAgeRangeLike | null | undefined;
  /** "chef" = chef_advice, "mini" = advice */
  kind: "chef" | "mini";
}): string {
  if (isInfantRecipe(params.recipe)) return MOM_ADVICE_TITLE;
  return params.kind === "chef" ? CHEF_ADVICE_TITLE : "Мини-совет";
}

export function getChefAdviceCardPresentation(params: {
  recipe: InfantRecipeAgeRangeLike | null | undefined;
  /** Текущее значение isChefTip по источнику текста */
  isChefTip: boolean;
}): { title: string; isChefTip: boolean } {
  const infant = isInfantRecipe(params.recipe);
  return {
    title: infant ? MOM_ADVICE_TITLE : CHEF_ADVICE_TITLE,
    // В infant UX не хотим показывать "шефский" паттерн (иконка/фон) даже если текст пришёл из chef_advice.
    isChefTip: infant ? false : params.isChefTip,
  };
}

export function getShareDescriptionHeading(params: { recipe: InfantRecipeAgeRangeLike | null | undefined }): string {
  return isInfantRecipe(params.recipe) ? "💚 Текстура и этап прикорма:" : "💚 Почему это полезно:";
}

