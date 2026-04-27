import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normalizeRecipeTextForPreferenceMatch } from "./recipeAllergyMatch.ts";
import {
  buildDislikeExpandedSubstringTokens,
  normalizedTextMatchesLegumeDislike,
  normalizedTextMatchesSoupDislike,
} from "./dislikeExpansion.ts";

Deno.test("normalizedTextMatchesSoupDislike: не цепляет «супер»", () => {
  const t = normalizeRecipeTextForPreferenceMatch("Суперсытный завтрак для ребёнка");
  assertEquals(normalizedTextMatchesSoupDislike(t), false);
});

Deno.test("normalizedTextMatchesSoupDislike: куриный суп", () => {
  const t = normalizeRecipeTextForPreferenceMatch("Куриный суп с лапшой");
  assertEquals(normalizedTextMatchesSoupDislike(t), true);
});

Deno.test("normalizedTextMatchesLegumeDislike: «минут» не триггерит бобовые", () => {
  const t = normalizeRecipeTextForPreferenceMatch("Готовить пять минут");
  assertEquals(normalizedTextMatchesLegumeDislike(t), false);
});

Deno.test("normalizedTextMatchesLegumeDislike: нут как слово", () => {
  const t = normalizeRecipeTextForPreferenceMatch("Салат с нутом и овощами");
  assertEquals(normalizedTextMatchesLegumeDislike(t), true);
});

Deno.test("buildDislikeExpandedSubstringTokens merges meat umbrella", () => {
  const tok = buildDislikeExpandedSubstringTokens(["мясо"]);
  assertEquals(tok.includes("куриц"), true);
});
