/**
 * Thin wrapper над общим словарём аллергенов (allergensDictionary.ts).
 * Единый источник истины: src/shared/allergensDictionary.ts, в Edge копируется через scripts/sync-allergens-dict.mjs.
 */

import {
  buildBlockedTokens,
  containsAnyToken as containsAnyTokenShared,
} from "./allergensDictionary.ts";

export interface AllergenSet {
  blockedTokens: string[];
}

/**
 * Строит набор запрещённых токенов по списку аллергий профиля (или всех членов семьи).
 */
export function buildAllergenSet(
  allergies: string[] | null | undefined
): AllergenSet {
  return { blockedTokens: buildBlockedTokens(allergies) };
}

/** Для совместимости с generate-plan и deepseek-chat: boolean. */
export function containsAnyToken(haystack: string, tokens: string[]): boolean {
  return containsAnyTokenShared(haystack, tokens).hit;
}

export interface RecipeForAllergenCheck {
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
}

/**
 * Проверяет рецепт на запрещённые аллергены. Не использует recipe_ingredients.category.
 */
export function isRecipeAllowedByAllergens(
  recipe: RecipeForAllergenCheck,
  allergenSet: AllergenSet
): { allowed: boolean; reason?: string; foundTokens?: string[] } {
  const { blockedTokens } = allergenSet;
  if (blockedTokens.length === 0) return { allowed: true };

  const title = (recipe.title ?? "").toLowerCase();
  const description = (recipe.description ?? "").toLowerCase();
  const ingredientsText = (recipe.recipe_ingredients ?? [])
    .map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" "))
    .join(" ")
    .toLowerCase();
  const fullText = [title, description, ingredientsText].join(" ");

  const { hit, found } = containsAnyTokenShared(fullText, blockedTokens);
  if (!hit) return { allowed: true };
  return {
    allowed: false,
    reason: "allergy",
    foundTokens: found,
  };
}

/**
 * Для совместимости с generate-plan: возвращает массив токенов так же, как старый getAllergyTokens(memberData).
 */
export function getBlockedTokensFromAllergies(
  allergies: string[] | null | undefined
): string[] {
  return buildBlockedTokens(allergies);
}
