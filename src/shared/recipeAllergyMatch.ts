/**
 * Единое правило матча токена аллергии по тексту рецепта (план, чат).
 * Подстрока + исключение nut/нут. Синхронизируется в Edge: _shared/recipeAllergyMatch.ts (npm run sync:allergens).
 */

/** Chickpea (нут) — не орех. */
const CHICKPEA_CYRILLIC = "\u043d\u0443\u0442"; // нут

/** Как preferenceRules / pool: lower, пунктуация → пробел, схлопнуть пробелы. */
export function normalizeRecipeTextForPreferenceMatch(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Текст уже нормализован через normalizeRecipeTextForPreferenceMatch
 * (или эквивалент: нижний регистр, без «ломающих» подстроку символов).
 */
export function allergyTokenMatchesInPreferenceText(normalizedText: string, token: string): boolean {
  if (!token || token.length < 2) return false;
  if (!normalizedText.includes(token)) return false;
  if (token === "nut" && normalizedText.includes(CHICKPEA_CYRILLIC)) return false;
  return true;
}

export type RecipeFieldsForAllergyExplain = {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  recipe_ingredients?: Array<{ name?: string | null; display_text?: string | null }> | null;
};

export type AllergyFieldHitDetail = {
  field: string;
  token: string;
  /** Укороченный фрагмент поля для лога */
  snippet: string;
};

function snippet(raw: string, max = 80): string {
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Все срабатывания токенов по полям (для аудита). Порядок: title, description, tags, ингредиенты.
 */
export function listAllergyTokenHitsInRecipeFields(
  recipe: RecipeFieldsForAllergyExplain,
  tokens: string[],
  options?: { includeIngredients?: boolean; includeTags?: boolean },
): AllergyFieldHitDetail[] {
  const includeIngredients = options?.includeIngredients !== false;
  const includeTags = options?.includeTags === true;
  const uniq = [...new Set(tokens.filter((t) => t && t.length >= 2))];
  const hits: AllergyFieldHitDetail[] = [];

  const scan = (field: string, raw: string) => {
    const norm = normalizeRecipeTextForPreferenceMatch(raw);
    if (!norm) return;
    for (const t of uniq) {
      if (allergyTokenMatchesInPreferenceText(norm, t)) {
        hits.push({ field, token: t, snippet: snippet(raw) });
      }
    }
  };

  scan("title", recipe.title ?? "");
  scan("description", recipe.description ?? "");
  if (includeTags) {
    scan("tags", (recipe.tags ?? []).join(" "));
  }
  if (includeIngredients) {
    (recipe.recipe_ingredients ?? []).forEach((ri, i) => {
      scan(`ingredient[${i}].name`, ri.name ?? "");
      scan(`ingredient[${i}].display_text`, ri.display_text ?? "");
    });
  }
  return hits;
}
