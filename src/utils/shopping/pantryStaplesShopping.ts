/**
 * Ингредиенты «базового запаса дома» не попадают в список покупок (карточка рецепта + сборка из плана).
 * Правила консервативны: при сомнении позицию оставляем в списке.
 *
 * Важно: в JS `\b` границы слова для кириллицы не надёжны — используем includes / явные паттерны.
 *
 * Расширять: новые проверки здесь + кейсы в pantryStaplesShopping.test.ts.
 */

export type PantryStapleIngredientProbe = {
  name: string | null | undefined;
  display_text: string | null | undefined;
};

/**
 * Короткая подсказка для UI: что не попадает в список покупок.
 * Держать в согласованности с `isPantryStapleExcludedFromShopping`.
 */
export const PANTRY_ASSUMPTION_USER_HINT_RU =
  "В покупки не добавляются вода, соль, типичные растительные масла (оливковое, подсолнечное и др.), молотый или чёрный перец и строки с пометкой «по вкусу». Болгарский перец, чили и сливочное масло при необходимости остаются в списке.";

/** Масла для жарки/заправки (сливочное / узкоспециализированные не скрываем). */
const COOKING_OIL_PHRASE =
  /(оливковое|подсолнечное|растительное|рафинированное)\s+масло|масло\s+(оливковое|подсолнечное|растительное|рафинированное)/i;

function lower(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function displayHead(displayText: string): string {
  const parts = displayText.split(/\s*[—\-]\s*/);
  return (parts[0] ?? "").trim().toLowerCase();
}

function isBellPepperContext(combined: string): boolean {
  return /перец\s*\(?болгарск|перец\s*сладк|перец\s*чили|болгарск.*перец|сладк[^я]*перец|чили/i.test(combined);
}

function isGroundBlackPepperContext(combined: string): boolean {
  return (
    /перец\s+(черн|чёрн|молот|душист)/i.test(combined) ||
    /черн(?:ый)?\s+перец/i.test(combined) ||
    /чёрн(?:ый)?\s+перец/i.test(combined) ||
    /молот(?:ый)?\s+перец/i.test(combined) ||
    /душист(?:ый)?\s+перец/i.test(combined)
  );
}

/**
 * true — не включать в список покупок.
 */
export function isPantryStapleExcludedFromShopping(probe: PantryStapleIngredientProbe): boolean {
  const name = lower(probe.name);
  const dt = lower(probe.display_text);
  const combined = `${name} ${dt}`;
  const head = displayHead(dt);

  if (dt.includes("по вкусу")) return true;

  if (name.startsWith("вода") || head.startsWith("вода")) return true;

  if (name.startsWith("соль") || head.startsWith("соль")) return true;

  if (COOKING_OIL_PHRASE.test(combined)) return true;

  if (name.includes("перец") || dt.includes("перец")) {
    if (isBellPepperContext(combined)) return false;
    if (isGroundBlackPepperContext(combined)) return true;
    if (name === "перец" || /^перец\s*$/i.test(name.trim())) return true;
  }

  return false;
}
