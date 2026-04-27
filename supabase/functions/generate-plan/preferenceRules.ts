import { getBlockedTokensFromAllergies } from "../_shared/allergens.ts";
import {
  buildDislikeExpandedSubstringTokens,
  recipeTextMatchesChipSpecificDislikes,
  getDislikeIngredientCategoriesToBlock,
} from "../_shared/dislikeExpansion.ts";
import {
  allergyTokenMatchesInPreferenceText,
  normalizeRecipeTextForPreferenceMatch,
} from "../_shared/recipeAllergyMatch.ts";

export type PreferenceMemberData = {
  allergies?: string[] | null;
  dislikes?: string[] | null;
};

export type PreferenceRecipe = {
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string; category?: string | null }> | null;
};

function normalizePreferenceText(text: string): string {
  return normalizeRecipeTextForPreferenceMatch(text);
}

function textContainsAllergyToken(normalizedRecipeText: string, token: string): boolean {
  return allergyTokenMatchesInPreferenceText(normalizedRecipeText, token);
}

export function recipeMatchesAllergyTokens(recipe: PreferenceRecipe, tokens: string[], includeIngredients = true): boolean {
  if (tokens.length === 0) return false;
  const text = buildRecipePreferenceText(recipe, includeIngredients);
  return tokens.some((t) => textContainsAllergyToken(text, t));
}

function includesTokenSoft(text: string, token: string): boolean {
  if (!token || token.length < 4) return text.includes(token);
  const space = " ";
  if (text.includes(space + token + space)) return true;
  if (text.startsWith(token + space)) return true;
  if (text.endsWith(space + token)) return true;
  if (text === token) return true;
  return false;
}

/** Стемы, которые дают ложные срабатывания при dislike (например «супы» → «суп» в «супер»). */
const DISLIKE_STEM_SUPPRESS = new Set(["суп"]);

function tokenizeList(list: string[] | null | undefined, withStem = false): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const tokens = new Set<string>();
  for (const item of list) {
    const normalized = normalizePreferenceText(String(item ?? ""));
    if (!normalized) continue;
    for (const token of normalized.split(/\s+/)) {
      if (token.length < 2) continue;
      tokens.add(token);
      if (withStem && token.length >= 4) {
        const stem = token.slice(0, -1);
        if (stem.length >= 2 && !DISLIKE_STEM_SUPPRESS.has(stem)) tokens.add(stem);
      }
    }
  }
  return [...tokens];
}

export function buildRecipePreferenceText(recipe: PreferenceRecipe, includeIngredients = true): string {
  const parts = [
    recipe.title ?? "",
    recipe.description ?? "",
  ];
  if (includeIngredients) {
    parts.push((recipe.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" "));
  }
  return normalizePreferenceText(parts.join(" "));
}

export function buildDislikeTokens(memberData: PreferenceMemberData | null | undefined): string[] {
  return tokenizeList(memberData?.dislikes, true);
}

export function countMatchedPreferenceTokens(text: string, tokens: string[]): number {
  if (!text || tokens.length === 0) return 0;
  const uniqueTokens = [...new Set(tokens)];
  let hits = 0;
  for (const token of uniqueTokens) {
    if (token.length >= 2 && includesTokenSoft(text, token)) hits++;
  }
  return hits;
}

export function recipeMatchesTokens(recipe: PreferenceRecipe, tokens: string[], includeIngredients = true): boolean {
  if (tokens.length === 0) return false;
  const text = buildRecipePreferenceText(recipe, includeIngredients);
  return countMatchedPreferenceTokens(text, tokens) > 0;
}

function recipeViolatesDislikeIngredientCategories(
  recipe: PreferenceRecipe,
  dislikes: string[] | null | undefined,
): boolean {
  const cats = getDislikeIngredientCategoriesToBlock(dislikes);
  if (cats.size === 0) return false;
  for (const ing of recipe.recipe_ingredients ?? []) {
    const raw = ing.category;
    if (typeof raw !== "string") continue;
    const c = raw.trim().toLowerCase();
    if (c && cats.has(c)) return true;
  }
  return false;
}

export function passesPreferenceFilters(recipe: PreferenceRecipe, memberData: PreferenceMemberData | null | undefined): boolean {
  const allergyTokens = getBlockedTokensFromAllergies(memberData?.allergies);
  if (recipeMatchesAllergyTokens(recipe, allergyTokens, true)) return false;

  const dislikes = memberData?.dislikes;
  const prefText = buildRecipePreferenceText(recipe, true);
  const dislikeExpanded = buildDislikeExpandedSubstringTokens(dislikes);
  if (dislikeExpanded.length > 0 && recipeMatchesAllergyTokens(recipe, dislikeExpanded, true)) return false;
  if (recipeTextMatchesChipSpecificDislikes(prefText, dislikes)) return false;
  if (recipeViolatesDislikeIngredientCategories(recipe, dislikes)) return false;

  const dislikeTokens = buildDislikeTokens(memberData);
  if (recipeMatchesTokens(recipe, dislikeTokens, true)) return false;

  return true;
}

