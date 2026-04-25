import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickDbSlots } from "./slotDb.ts";
import type { RecipeRowPool } from "./types.ts";

const baseIng = [{ name: "вода", display_text: "вода" }];

function row(
  id: string,
  title: string,
  meal_type: string,
  opts?: Partial<RecipeRowPool>,
): RecipeRowPool {
  return {
    id,
    title,
    description: "описание",
    meal_type,
    min_age_months: 6,
    max_age_months: 120,
    recipe_ingredients: baseIng,
    is_soup: meal_type === "lunch" ? true : false,
    ...opts,
  };
}

Deno.test("pickDbSlots fills four slots from pool", () => {
  const pool: RecipeRowPool[] = [
    row("1", "Овсянка с яблоком", "breakfast"),
    row("2", "Суп овощной", "lunch", { is_soup: true }),
    row("3", "Котлеты", "dinner"),
    row("4", "Творог с бананом", "snack"),
  ];
  const { meals, filledCount } = pickDbSlots(pool, {
    age_months: 24,
    allergies: [],
    likes: ["овсян"],
    dislikes: [],
    type: "child",
  });
  assertEquals(filledCount, 4);
  if (!meals.breakfast) throw new Error("breakfast");
  assertEquals(meals.breakfast?.title.includes("Овсян"), true);
});

Deno.test("pickDbSlots returns partial when pool empty", () => {
  const { filledCount } = pickDbSlots([], {
    age_months: 24,
    allergies: [],
    likes: [],
    dislikes: [],
    type: "child",
  });
  assertEquals(filledCount, 0);
});
