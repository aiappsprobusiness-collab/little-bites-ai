/**
 * Post-generation проверка рецепта чата на аллергии: те же поля и матч, что в плане (recipeAllergyMatch).
 * Синхронизируется в Edge: supabase/functions/_shared/chatRecipeAllergySafety.ts (npm run sync:allergens).
 */

import type { AllergyFieldHitDetail, RecipeFieldsForAllergyExplain } from "./recipeAllergyMatch.ts";
import {
  listAllergyTokenHitsInChatIngredientNames,
  listAllergyTokenHitsInRecipeFields,
} from "./recipeAllergyMatch.ts";

export type AllergyTokenGroup = { profileAllergy: string; tokens: string[] };

/** JSON рецепта чата → поля для listAllergyTokenHitsInRecipeFields (ingredients: name, display_text / displayText). */
export function chatRecipeRecordToAllergyFields(recipe: Record<string, unknown>): RecipeFieldsForAllergyExplain {
  const title = typeof recipe.title === "string" ? recipe.title : "";
  const description = typeof recipe.description === "string" ? recipe.description : "";
  const tags = Array.isArray(recipe.tags)
    ? (recipe.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : null;
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const recipe_ingredients = ings.map((raw) => {
    if (typeof raw === "string") {
      const name = raw.trim();
      return { name, display_text: "" };
    }
    if (!raw || typeof raw !== "object") return { name: "", display_text: "" };
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const display_text =
      typeof o.display_text === "string"
        ? o.display_text
        : typeof o.displayText === "string"
          ? o.displayText
          : "";
    return { name, display_text };
  });
  return { title, description, tags, recipe_ingredients };
}

/**
 * Первая аллергия профиля (порядок списка), по токенам которой есть попадание в рецепт.
 * По умолчанию без tags — как preferenceRules / план (title, description, ингредиенты).
 * @deprecated для post-check чата используйте findFirstAllergyConflictInChatRecipeIngredients.
 */
export function findFirstAllergyConflictInRecipeFields(
  recipe: RecipeFieldsForAllergyExplain,
  groups: AllergyTokenGroup[],
  options?: { includeTags?: boolean },
): { profileAllergy: string; detail: AllergyFieldHitDetail } | null {
  const includeTags = options?.includeTags === true;
  for (const g of groups) {
    if (!g.tokens.length) continue;
    const hits = listAllergyTokenHitsInRecipeFields(recipe, g.tokens, {
      includeIngredients: true,
      includeTags,
    });
    if (hits.length > 0) {
      return { profileAllergy: g.profileAllergy, detail: hits[0]! };
    }
  }
  return null;
}

/**
 * Post-check чата: только ingredients[].name, правило prefix/suffix (без title/description/display_text).
 */
export function findFirstAllergyConflictInChatRecipeIngredients(
  recipe: RecipeFieldsForAllergyExplain,
  groups: AllergyTokenGroup[],
): { profileAllergy: string; detail: AllergyFieldHitDetail } | null {
  for (const g of groups) {
    if (!g.tokens.length) continue;
    const hits = listAllergyTokenHitsInChatIngredientNames(recipe, g.tokens);
    if (hits.length > 0) {
      return { profileAllergy: g.profileAllergy, detail: hits[0]! };
    }
  }
  return null;
}
