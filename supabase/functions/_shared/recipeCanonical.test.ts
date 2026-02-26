/**
 * Tests for recipe canonical payload (meal_type, is_soup for lunch slot).
 * Run: deno test recipeCanonical.test.ts --allow-read
 *
 * Invariant: assign_recipe_to_plan_slot does NOT update recipes.meal_type or recipes.is_soup
 * (only meal_plans_v2.meals); see docs/MEAL_TYPE_AND_LUNCH_SOUP.md and RPC body.
 */
import { canonicalizeRecipePayload } from "./recipeCanonical.ts";

const minimalInput = {
  user_id: "00000000-0000-0000-0000-000000000001",
  source: "chat_ai",
  title: "Тест",
  steps: [{ instruction: "Шаг 1", step_number: 1 }],
  ingredients: [
    { name: "А", display_text: "А — 100 г" },
    { name: "Б", display_text: "Б — 2 шт." },
    { name: "В", display_text: "В — 1 ст.л." },
  ],
};

Deno.test("canonicalizeRecipePayload: contextMealType lunch => is_soup true", () => {
  const payload = canonicalizeRecipePayload({
    ...minimalInput,
    contextMealType: "lunch",
    sourceTag: "week_ai",
  });
  if ((payload as { meal_type?: string }).meal_type !== "lunch") throw new Error("meal_type should be lunch");
  if ((payload as { is_soup?: boolean }).is_soup !== true) throw new Error("lunch must have is_soup true");
});

Deno.test("canonicalizeRecipePayload: mealType lunch => is_soup true", () => {
  const payload = canonicalizeRecipePayload({
    ...minimalInput,
    mealType: "lunch",
  });
  if ((payload as { is_soup?: boolean }).is_soup !== true) throw new Error("mealType lunch => is_soup true");
});

Deno.test("canonicalizeRecipePayload: dinner => is_soup false unless provided", () => {
  const payload = canonicalizeRecipePayload({
    ...minimalInput,
    contextMealType: "dinner",
  });
  if ((payload as { meal_type?: string }).meal_type !== "dinner") throw new Error("meal_type dinner");
  if ((payload as { is_soup?: boolean }).is_soup !== false) throw new Error("dinner default is_soup false");
});

Deno.test("canonicalizeRecipePayload: lunch with explicit is_soup false still yields is_soup true (lunch rule)", () => {
  const payload = canonicalizeRecipePayload({
    ...minimalInput,
    contextMealType: "lunch",
    is_soup: false,
  });
  if ((payload as { is_soup?: boolean }).is_soup !== true) throw new Error("lunch slot overrides: is_soup true");
});
