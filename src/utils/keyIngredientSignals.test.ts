import { describe, expect, it } from "vitest";
import {
  computeWeeklyKeyIngredientPenalty,
  computeWeeklyKeyIngredientPenaltyCalibrated,
  deriveKeyIngredientSignals,
  extractKeyProductKeysFromIngredients,
  MEAL_DIVERSITY_STAPLE_KEYS,
  normalizeProductKey,
  rawPenaltyUnitsFromPrior,
  WEEKLY_KEY_INGREDIENT_PENALTY_AT_2,
  WEEKLY_KEY_INGREDIENT_PENALTY_AT_3,
  WEEKLY_KEY_INGREDIENT_PENALTY_CAP,
} from "@shared/keyIngredientSignals";
import { computeSlotFitForPoolRow, type MealType } from "@/utils/recipePool";

describe("normalizeProductKey", () => {
  it("maps RU/EN apple", () => {
    expect(normalizeProductKey("Яблоко")).toBe("apple");
    expect(normalizeProductKey("apple")).toBe("apple");
    expect(normalizeProductKey("яблочное пюре")).toBe("apple");
  });
});

describe("rawPenaltyUnitsFromPrior", () => {
  it("distinguishes prior 2, 4, 7 without early saturation", () => {
    expect(rawPenaltyUnitsFromPrior(2)).toBe(3);
    expect(rawPenaltyUnitsFromPrior(4)).toBe(10);
    expect(rawPenaltyUnitsFromPrior(7)).toBe(19 + 4);
    expect(rawPenaltyUnitsFromPrior(7)).toBeGreaterThan(rawPenaltyUnitsFromPrior(4));
    expect(rawPenaltyUnitsFromPrior(4)).toBeGreaterThan(rawPenaltyUnitsFromPrior(2));
  });
});

describe("deriveKeyIngredientSignals", () => {
  it("extracts keys from ingredients in order, skips water", () => {
    const sig = deriveKeyIngredientSignals({
      title: "Перекус",
      recipe_ingredients: [
        { name: "Вода", display_text: "100 мл" },
        { name: "Яблоко", display_text: "1 шт" },
        { name: "Овсяные хлопья", display_text: "2 ст.л." },
      ],
    });
    expect(sig.keys).toEqual(["apple", "oatmeal"]);
    expect(sig.primaryKey).toBe("apple");
  });

  it("falls back to title when no ingredient keys", () => {
    const sig = deriveKeyIngredientSignals({
      title: "Банановый смузи",
      description: "",
      recipe_ingredients: [{ name: "Вода", display_text: "" }],
    });
    expect(sig.keys).toContain("banana");
  });
});

describe("computeWeeklyKeyIngredientPenalty", () => {
  it("no penalty when key seen 0–1 times", () => {
    expect(computeWeeklyKeyIngredientPenalty(["apple"], {}).penalty).toBe(0);
    expect(computeWeeklyKeyIngredientPenalty(["apple"], { apple: 1 }).penalty).toBe(0);
  });

  it("applies tier at 2+ and stronger at 3+ prior uses (calibrated scale)", () => {
    const at2 = computeWeeklyKeyIngredientPenalty(["apple"], { apple: 2 });
    expect(at2.penalty).toBe(WEEKLY_KEY_INGREDIENT_PENALTY_AT_2);
    const at3 = computeWeeklyKeyIngredientPenalty(["apple"], { apple: 3 });
    expect(at3.penalty).toBe(WEEKLY_KEY_INGREDIENT_PENALTY_AT_3);
    expect(at3.penalty).toBeGreaterThan(at2.penalty);
  });

  it("prior 2 vs 4 vs 7 produce different penalties for same single key", () => {
    const p2 = computeWeeklyKeyIngredientPenalty(["rice"], { rice: 2 }).penalty;
    const p4 = computeWeeklyKeyIngredientPenalty(["rice"], { rice: 4 }).penalty;
    const p7 = computeWeeklyKeyIngredientPenalty(["rice"], { rice: 7 }).penalty;
    expect(new Set([p2, p4, p7]).size).toBe(3);
    expect(p7).toBeGreaterThan(p4);
    expect(p4).toBeGreaterThan(p2);
  });

  it("sums multiple keys but stays within total cap (narrow pool still has finite penalty)", () => {
    const keys = ["apple", "banana", "chicken"];
    const counts = { apple: 6, banana: 6, chicken: 6 };
    const res = computeWeeklyKeyIngredientPenalty(keys, counts);
    expect(res.penalty).toBeLessThanOrEqual(WEEKLY_KEY_INGREDIENT_PENALTY_CAP);
    expect(res.penalty).toBeGreaterThan(0);
  });
});

describe("computeWeeklyKeyIngredientPenaltyCalibrated", () => {
  it("penalizes primary key repeat more than secondary when the heavy prior sits on primary", () => {
    const used = { chicken: 5, apple: 2 };
    const primaryChicken = computeWeeklyKeyIngredientPenaltyCalibrated(
      { keys: ["chicken", "apple"], primaryKey: "chicken" },
      { usedGlobal: used },
    );
    const primaryApple = computeWeeklyKeyIngredientPenaltyCalibrated(
      { keys: ["chicken", "apple"], primaryKey: "apple" },
      { usedGlobal: used },
    );
    expect(primaryChicken.penalty).toBeGreaterThan(primaryApple.penalty);
  });

  it("adds meal-slot staple penalty for breakfast/snack when staples repeat in that meal", () => {
    expect(MEAL_DIVERSITY_STAPLE_KEYS.has("apple")).toBe(true);
    const sig = deriveKeyIngredientSignals({
      title: "Перекус",
      recipe_ingredients: [{ name: "Яблоко", display_text: "" }],
    });
    const noMeal = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
      usedGlobal: {},
      usedByMeal: { snack: { apple: 2 } },
      mealSlot: "snack",
    });
    const globalOnly = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
      usedGlobal: {},
      usedByMeal: { snack: {} },
      mealSlot: "snack",
    });
    expect(noMeal.mealSlotSubtotal).toBeGreaterThan(globalOnly.mealSlotSubtotal);
    expect(noMeal.penalty).toBeGreaterThan(globalOnly.penalty);
  });

  it("does not apply meal-slot extra penalty on lunch for staples", () => {
    const sig = deriveKeyIngredientSignals({
      title: "Суп",
      recipe_ingredients: [{ name: "Рис", display_text: "" }],
    });
    const lunch = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
      usedGlobal: {},
      usedByMeal: { lunch: { rice: 4 } },
      mealSlot: "lunch",
    });
    expect(lunch.mealSlotSubtotal).toBe(0);
  });
});

describe("weekly apple dominance (client slot-fit)", () => {
  it("reduces slot-fit for apple when apple already overused vs banana candidate", () => {
    const slotNorm: MealType = "snack";
    const appleRow = {
      id: "a1",
      title: "Яблочные дольки",
      meal_type: "snack",
      recipe_ingredients: [{ name: "Яблоко", display_text: "" }],
    };
    const bananaRow = {
      id: "b1",
      title: "Банан с творогом",
      meal_type: "snack",
      recipe_ingredients: [
        { name: "Банан", display_text: "" },
        { name: "Творог", display_text: "" },
      ],
    };
    const used = { apple: 2, banana: 0 };
    const fitApple = computeSlotFitForPoolRow(appleRow, {
      slotNorm,
      memberData: { age_months: 24 },
      usedKeyIngredientCounts: used,
    });
    const fitBanana = computeSlotFitForPoolRow(bananaRow, {
      slotNorm,
      memberData: { age_months: 24 },
      usedKeyIngredientCounts: used,
    });
    expect(fitBanana).toBeGreaterThan(fitApple);
  });

  it("snack slot-fit prefers less-repeated staple when byMeal counts favor banana over apple in snacks", () => {
    const slotNorm: MealType = "snack";
    const appleRow = {
      id: "a1",
      title: "Яблоко",
      meal_type: "snack",
      recipe_ingredients: [{ name: "Яблоко", display_text: "" }],
    };
    const bananaRow = {
      id: "b1",
      title: "Банан",
      meal_type: "snack",
      recipe_ingredients: [{ name: "Банан", display_text: "" }],
    };
    const usedGlobal = { apple: 1, banana: 1 };
    const byMeal = { snack: { apple: 3, banana: 0 } };
    const fitApple = computeSlotFitForPoolRow(appleRow, {
      slotNorm,
      memberData: { age_months: 24 },
      usedKeyIngredientCounts: usedGlobal,
      usedKeyIngredientCountsByMealType: byMeal,
    });
    const fitBanana = computeSlotFitForPoolRow(bananaRow, {
      slotNorm,
      memberData: { age_months: 24 },
      usedKeyIngredientCounts: usedGlobal,
      usedKeyIngredientCountsByMealType: byMeal,
    });
    expect(fitBanana).toBeGreaterThan(fitApple);
  });
});

describe("extractKeyProductKeysFromIngredients", () => {
  it("respects maxKeys", () => {
    const keys = extractKeyProductKeysFromIngredients(
      [
        { name: "Курица", display_text: "" },
        { name: "Рис", display_text: "" },
        { name: "Морковь", display_text: "" },
      ],
      2,
    );
    expect(keys.length).toBe(2);
  });
});
