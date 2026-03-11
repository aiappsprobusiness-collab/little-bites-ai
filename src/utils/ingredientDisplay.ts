/**
 * Единообразное отображение названий ингредиентов: «С большой буквы».
 * Первая буква — верхний регистр, остальные — нижний (для русского и латиницы).
 */

export function capitalizeIngredientName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  const s = name.trim();
  if (s === "") return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Единицы для отображения: как в карточке рецепта (г/мл), и исправление опечатки «д». */
export function normalizeUnitForDisplay(unit: string | null | undefined): string | null {
  const u = unit?.trim();
  if (u == null || u === "") return null;
  if (u === "д" || u === "g") return "г";
  if (u === "ml") return "мл";
  return u;
}
