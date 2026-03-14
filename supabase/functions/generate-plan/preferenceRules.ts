import { getBlockedTokensFromAllergies } from "../_shared/allergens.ts";

export type PreferenceMemberData = {
  allergies?: string[] | null;
  dislikes?: string[] | null;
  likes?: string[] | null;
};

export type PreferenceRecipe = {
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
};

export type LikeMode = "favor" | "avoid" | "neutral";

function normalizePreferenceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chickpea (нут) — не орех; не матчить токен "nut" по подстроке в слове "нут". */
const CHICKPEA_CYRILLIC = "\u043d\u0443\u0442"; // нут

/**
 * Strict allergy match: substring in title+description+ingredients.
 * Uses substring (not word boundary) so "орехами", "ореховый" are blocked by token "орех".
 * Excludes false positive: token "nut" must not match Cyrillic "нут" (chickpea).
 */
function textContainsAllergyToken(text: string, token: string): boolean {
  if (!token || token.length < 2) return false;
  const lower = text.toLowerCase();
  if (!lower.includes(token)) return false;
  if (token === "nut" && lower.includes(CHICKPEA_CYRILLIC)) return false;
  return true;
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

function tokenizeList(list: string[] | null | undefined, withStem = false): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const tokens = new Set<string>();
  for (const item of list) {
    const normalized = normalizePreferenceText(String(item ?? ""));
    if (!normalized) continue;
    for (const token of normalized.split(/\s+/)) {
      if (token.length < 2) continue;
      tokens.add(token);
      if (withStem && token.length >= 4) tokens.add(token.slice(0, -1));
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

export function buildLikeTokens(memberData: PreferenceMemberData | null | undefined): string[] {
  return tokenizeList(memberData?.likes, false);
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

export function passesPreferenceFilters(recipe: PreferenceRecipe, memberData: PreferenceMemberData | null | undefined): boolean {
  const allergyTokens = getBlockedTokensFromAllergies(memberData?.allergies);
  if (recipeMatchesAllergyTokens(recipe, allergyTokens, true)) return false;

  const dislikeTokens = buildDislikeTokens(memberData);
  if (recipeMatchesTokens(recipe, dislikeTokens, true)) return false;

  return true;
}

export function hasLikeMatch(recipe: PreferenceRecipe, likeTokens: string[]): boolean {
  return recipeMatchesTokens(recipe, likeTokens, true);
}

export function hasLikedTitlesMatch(titles: string[], likeTokens: string[]): boolean {
  if (titles.length === 0 || likeTokens.length === 0) return false;
  const text = normalizePreferenceText(titles.join(" "));
  return countMatchedPreferenceTokens(text, likeTokens) > 0;
}

export function scoreLikeSignal(recipe: PreferenceRecipe, likeTokens: string[], mode: LikeMode): number {
  if (likeTokens.length === 0 || mode === "neutral") return 0;
  const text = buildRecipePreferenceText(recipe, true);
  const hits = Math.min(countMatchedPreferenceTokens(text, likeTokens), 3);
  if (hits === 0) return 0;
  if (mode === "favor") return hits * 5;
  return hits * -3;
}
