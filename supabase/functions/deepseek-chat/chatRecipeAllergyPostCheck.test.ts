/**
 * Post-recipe allergy safety (chat): только ingredients[].name.
 * deno test deepseek-chat/chatRecipeAllergyPostCheck.test.ts --allow-read
 */
import { expandAllergiesToCanonicalBlockedGroups } from "../_shared/allergyAliases.ts";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInChatRecipeIngredients,
} from "../_shared/chatRecipeAllergySafety.ts";

Deno.test("post-check chat: мясо + курица в ингредиентах — конфликт", () => {
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
  const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
  if (!c) throw new Error("expected conflict");
  if (c.profileAllergy !== "мясо") throw new Error("expected profile allergy мясо");
});

Deno.test("post-check chat: мясо + куриные яйца — без конфликта", () => {
  const recipe = {
    title: "Омлет",
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
  const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
  if (c !== null) throw new Error(`expected no conflict, got ${JSON.stringify(c)}`);
});

Deno.test("post-check chat: только овощи — без конфликта", () => {
  const recipe = {
    title: "Овощной суп",
    ingredients: [{ name: "морковь", display_text: "1 шт." }],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
  if (c !== null) throw new Error(`expected no conflict, got ${JSON.stringify(c)}`);
});

Deno.test("post-check chat: курица только в description — без конфликта (ingredients-only)", () => {
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
  const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
  if (c !== null) throw new Error(`expected no conflict (description ignored), got ${JSON.stringify(c)}`);
});

Deno.test("post-check chat: творожная запеканка + глютен/орехи — без ложного конфликта", () => {
  const recipe = {
    title: "Творожная запеканка",
    description: "Завтрак с кальцием",
    ingredients: [
      { name: "творог", display_text: "150 г" },
      { name: "банан", display_text: "1 шт" },
    ],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  for (const allergy of ["глютен", "орехи"]) {
    const groups = expandAllergiesToCanonicalBlockedGroups([allergy]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
    if (c !== null) {
      throw new Error(`false positive for ${allergy}: ${JSON.stringify(c)}`);
    }
  }
});

Deno.test("post-check chat: пастеризованное молоко + глютен — без ложного «паста»", () => {
  const recipe = {
    title: "Каша",
    ingredients: [{ name: "молоко пастеризованное", display_text: "200 мл" }],
  };
  const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
  const groups = expandAllergiesToCanonicalBlockedGroups(["глютен"]).map((g) => ({
    profileAllergy: g.allergy,
    tokens: g.tokens,
  }));
  const c = findFirstAllergyConflictInChatRecipeIngredients(fields, groups);
  if (c !== null) throw new Error(`expected no false positive, got ${JSON.stringify(c)}`);
});
