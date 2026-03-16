/**
 * Stage 2.2: consistency guard между title и ingredients.
 * Если в title есть явный high-signal ингредиент, а в ingredients его нет — считаем несоответствием.
 * Без сложной NLP: простой список ключевых слов и проверка вхождений.
 */

/** High-signal ингредиенты: подстрока для поиска в title и в name ингредиента. */
const TITLE_INGREDIENT_SIGNALS: Array<{ titleKey: string; ingKey: string }> = [
  { titleKey: "картофел", ingKey: "картофел" },
  { titleKey: "цветн", ingKey: "цветн" }, // цветная капуста
  { titleKey: "брокколи", ingKey: "брокколи" },
  { titleKey: "кабачок", ingKey: "кабачок" },
  { titleKey: "цукини", ingKey: "цукини" },
  { titleKey: "морков", ingKey: "морков" },
  { titleKey: "яблок", ingKey: "яблок" },
  { titleKey: "банан", ingKey: "банан" },
  { titleKey: "творог", ingKey: "творог" },
  { titleKey: "индейк", ingKey: "индейк" },
  { titleKey: "куриц", ingKey: "куриц" },
  { titleKey: "треск", ingKey: "треск" },
  { titleKey: "лосос", ingKey: "лосос" },
  { titleKey: "гречк", ingKey: "гречк" },
  { titleKey: "овсянк", ingKey: "овсянк" },
  { titleKey: "рис", ingKey: "рис" },
  { titleKey: "тыкв", ingKey: "тыкв" },
  { titleKey: "фасол", ingKey: "фасол" },
  { titleKey: "сыр", ingKey: "сыр" },
  { titleKey: "яйц", ingKey: "яйц" },
  { titleKey: "томат", ingKey: "томат" },
  { titleKey: "помидор", ingKey: "помидор" },
];

function normalizeForMatch(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Проверяет, есть ли в тексте ингредиентов вхождение ключа (подстрока). */
function ingredientsContain(ingredientNames: string[], ingKey: string): boolean {
  const key = ingKey.toLowerCase();
  const normalized = ingredientNames.map((n) => normalizeForMatch(n));
  return normalized.some((n) => n.includes(key));
}

/** Проверяет, есть ли в title вхождение ключа (подстрока). */
function titleContains(title: string, titleKey: string): boolean {
  const t = normalizeForMatch(title);
  const key = titleKey.toLowerCase().replace(/\s+/g, " ");
  return t.includes(key);
}

export interface TitleIngredientConsistencyResult {
  triggered: boolean;
  mismatchKeys: string[];
  suggestedTitle?: string;
}

/**
 * Проверяет согласованность title и ingredients. Если в title упомянут high-signal продукт,
 * а в ingredients его нет — добавляет в mismatchKeys.
 * suggestedTitle заполняется только в безопасных случаях (например, убрать «картофельное» при отсутствии картофеля).
 */
export function checkTitleIngredientConsistency(
  title: string,
  ingredientNames: string[]
): TitleIngredientConsistencyResult {
  const t = normalizeForMatch(title);
  const ingList = Array.isArray(ingredientNames) ? ingredientNames : [];
  const mismatchKeys: string[] = [];

  for (const { titleKey, ingKey } of TITLE_INGREDIENT_SIGNALS) {
    const keyNorm = titleKey.replace(/\s+/g, " ");
    if (!titleContains(t, keyNorm)) continue;
    if (ingredientsContain(ingList, ingKey)) continue;
    mismatchKeys.push(titleKey);
  }

  let suggestedTitle: string | undefined;
  if (mismatchKeys.length > 0) {
    suggestedTitle = suggestTitleFix(title, mismatchKeys);
  }

  return {
    triggered: mismatchKeys.length > 0,
    mismatchKeys,
    ...(suggestedTitle != null && suggestedTitle !== title ? { suggestedTitle } : {}),
  };
}

/** Безопасная правка title: убрать явно лишнее упоминание продукта, которого нет в ingredients. */
function suggestTitleFix(title: string, mismatchKeys: string[]): string | undefined {
  let out = title.trim();

  if (mismatchKeys.some((k) => k.includes("картофел"))) {
    const patterns = [
      /\s*картофельн(ое|ого|ый|ая)\s+/gi,
      /\s+с\s+картофел(ем|ем)\s+/gi,
      /\s+из\s+картофел(я|я)\s+/gi,
      /\s*картофел(ь|я|ем)\s*/gi,
    ];
    for (const re of patterns) {
      out = out.replace(re, " ").replace(/\s+/g, " ").trim();
    }
    if (out.length >= 3) return out;
  }

  return undefined;
}
