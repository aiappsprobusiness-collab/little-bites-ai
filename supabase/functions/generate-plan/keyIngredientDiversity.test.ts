import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  computeWeeklyKeyIngredientPenalty,
  computeWeeklyKeyIngredientPenaltyCalibrated,
  deriveKeyIngredientSignals,
  WEEKLY_KEY_INGREDIENT_PENALTY_AT_2,
  WEEKLY_KEY_INGREDIENT_PENALTY_AT_3,
} from "../../../shared/keyIngredientSignals.ts";

Deno.test("deriveKeyIngredientSignals: apple from RU ingredients", () => {
  const sig = deriveKeyIngredientSignals({
    title: "Полдник",
    recipe_ingredients: [{ name: "Яблоко", display_text: "½ шт" }],
  });
  assertEquals(sig.primaryKey, "apple");
  assertEquals(sig.keys.includes("apple"), true);
});

Deno.test("computeWeeklyKeyIngredientPenalty: 2 vs 3 prior uses", () => {
  assertEquals(computeWeeklyKeyIngredientPenalty(["apple"], { apple: 2 }).penalty, WEEKLY_KEY_INGREDIENT_PENALTY_AT_2);
  assertEquals(computeWeeklyKeyIngredientPenalty(["apple"], { apple: 3 }).penalty, WEEKLY_KEY_INGREDIENT_PENALTY_AT_3);
});

Deno.test("computeWeeklyKeyIngredientPenaltyCalibrated: primary heavier than secondary", () => {
  const used = { chicken: 5, apple: 2 };
  const pc = computeWeeklyKeyIngredientPenaltyCalibrated(
    { keys: ["chicken", "apple"], primaryKey: "chicken" },
    { usedGlobal: used },
  );
  const pa = computeWeeklyKeyIngredientPenaltyCalibrated(
    { keys: ["chicken", "apple"], primaryKey: "apple" },
    { usedGlobal: used },
  );
  if (!(pc.penalty > pa.penalty)) {
    throw new Error(`expected primary chicken penalty > primary apple: ${pc.penalty} vs ${pa.penalty}`);
  }
});
