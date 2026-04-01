/**
 * Post-recipe allergy safety: те же поля/токены, что план (recipeAllergyMatch).
 * deno test deepseek-chat/chatRecipeAllergyPostCheck.test.ts --allow-read
 */
import { expandAllergiesToCanonicalBlockedGroups } from "../_shared/allergyAliases.ts";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInRecipeFields,
} from "../_shared/chatRecipeAllergySafety.ts";

Deno.test("post-check: мясо + рецепт с курицей в ингредиентах — конфликт", () => {
  const recipe = {
    title: "Овощной суп",
    description: "Лёгкий ужин",
    ingredients: [{ name: "куриное филе", display_text: "200 г" }],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInRecipeFields(fields, groups);
  if (!c) throw new Error("expected conflict");
  if (c.profileAllergy !== "мясо") throw new Error("expected profile allergy мясо");
});

Deno.test("post-check: мясо + куриные яйца в ингредиентах — без конфликта (не мясо)", () => {
  const recipe = {
    title: "Омлет",
    description: "Быстрый завтрак",
    ingredients: [
      { name: "яйца куриные", display_text: "2 шт." },
      { name: "молоко", display_text: "40 мл" },
    ],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInRecipeFields(fields, groups);
  if (c !== null) throw new Error(`expected no conflict, got ${JSON.stringify(c)}`);
});

Deno.test("post-check: мясо + только овощи — без конфликта", () => {
  const recipe = {
    title: "Овощной суп",
    description: "Морковь и картофель",
    ingredients: [{ name: "морковь", display_text: "1 шт." }],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInRecipeFields(fields, groups);
  if (c !== null) throw new Error(`expected no conflict, got ${JSON.stringify(c)}`);
});

Deno.test("post-check: курица в description ловится", () => {
  const recipe = {
    title: "Салат",
    description: "С запечённой курицей",
    ingredients: [{ name: "огурец", display_text: "1 шт." }],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInRecipeFields(fields, groups);
  if (!c) throw new Error("expected conflict from description");
});
