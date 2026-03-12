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

/**
 * Капитализация строки «название — количество»: только название с заглавной буквы.
 */
export function capitalizeIngredientDisplay(displayText: string | null | undefined): string {
  if (displayText == null || typeof displayText !== "string") return "";
  const s = displayText.trim();
  if (s === "") return "";
  const sep = " — ";
  const idx = s.lastIndexOf(sep);
  if (idx === -1) return capitalizeIngredientName(s);
  const name = s.slice(0, idx).trim();
  const amount = s.slice(idx + sep.length).trim();
  return amount ? `${capitalizeIngredientName(name)}${sep}${amount}` : capitalizeIngredientName(name);
}

/**
 * Безопасное сокращение слишком длинных названий ингредиентов для UI.
 * Только известные паттерны, без изменения структуры данных.
 */
export function shortenIngredientName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  let s = name.trim();
  if (s === "") return "";
  // Убрать скобки с перечислением для «Смесь замороженных ягод (клубника, малина, черника)»
  const paren = s.indexOf(" (");
  if (paren > 0) s = s.slice(0, paren).trim();
  // Известные длинные суффиксы — сократить для читаемости
  if (s.toLowerCase().endsWith(" быстрого приготовления")) {
    s = s.slice(0, -" быстрого приготовления".length).trim();
  }
  if (s.toLowerCase().endsWith(" быстрого варения")) {
    s = s.slice(0, -" быстрого варения".length).trim();
  }
  // «Смесь замороженных ягод» → «Смесь ягод»
  if (/^смесь замороженных ягод$/i.test(s)) s = "Смесь ягод";
  return s;
}

/** Единицы для отображения: как в карточке рецепта (г/мл), и исправление опечатки «д». */
export function normalizeUnitForDisplay(unit: string | null | undefined): string | null {
  const u = unit?.trim();
  if (u == null || u === "") return null;
  if (u === "д" || u === "g") return "г";
  if (u === "ml") return "мл";
  return u;
}
