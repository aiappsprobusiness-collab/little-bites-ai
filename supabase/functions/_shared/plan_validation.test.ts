/**
 * Tests for plan ingredient validation and payload building.
 * Run: deno test plan_validation.test.ts --allow-read
 */
import {
  ingredientHasQuantity,
  ingredientsHaveAmounts,
  normalizeIngredientsFallback,
  buildIngredientPayloadItem,
} from "./planValidation.ts";

Deno.test("ingredientHasQuantity: number+unit", () => {
  if (!ingredientHasQuantity({ name: "Молоко", amount: 200, unit: "мл" })) throw new Error("200 мл");
  if (!ingredientHasQuantity({ name: "Яйцо", amount: "2", unit: "шт." })) throw new Error("2 шт.");
});

Deno.test("ingredientHasQuantity: display_text with amount", () => {
  if (!ingredientHasQuantity({ name: "Молоко", display_text: "Молоко — 200 мл" })) throw new Error("display 200 мл");
  if (!ingredientHasQuantity({ name: "Соль", display_text: "Соль — по вкусу" })) throw new Error("по вкусу");
  if (!ingredientHasQuantity({ name: "Масло", display_text: "Масло для жарки" })) throw new Error("для жарки");
});

Deno.test("ingredientHasQuantity: amount string", () => {
  if (!ingredientHasQuantity({ name: "Мука", amount: "150 г" })) throw new Error("150 г");
  if (!ingredientHasQuantity({ name: "Яйцо", amount: "1 шт." })) throw new Error("1 шт.");
  if (ingredientHasQuantity({ name: "Соль", amount: "" })) throw new Error("empty amount should fail");
});

Deno.test("ingredientsHaveAmounts: at least 3 with quantity", () => {
  if (!ingredientsHaveAmounts([
    { name: "А", display_text: "А — 100 г" },
    { name: "Б", display_text: "Б — 2 шт." },
    { name: "В", display_text: "В — по вкусу" },
  ])) throw new Error("3 with qty");
  if (!ingredientsHaveAmounts([
    { name: "А", display_text: "А — 100 г" },
    { name: "Б", display_text: "Б — 2 шт." },
    { name: "В", display_text: "В — 1 ст.л." },
    { name: "Г", amount: "" },
  ])) throw new Error("3 with qty + 1 without");
  if (ingredientsHaveAmounts([
    { name: "А", amount: "" },
    { name: "Б", amount: "" },
    { name: "В", amount: "" },
  ])) throw new Error("all empty should fail");
});

Deno.test("normalizeIngredientsFallback: fills missing", () => {
  const out = normalizeIngredientsFallback([
    { name: "Творог", amount: "" },
    { name: "Яйцо", amount: "" },
    { name: "Мука", amount: "100 г" },
  ]);
  if (out.length !== 3) throw new Error("length");
  if (!out[0].display_text.includes("по вкусу") && !out[0].display_text.includes("1 шт.")) throw new Error("fallback creative");
  if (!out[1].display_text.includes("1 шт.")) throw new Error("яйцо 1 шт.");
  if (!out[2].display_text.includes("100 г")) throw new Error("keep amount");
});

Deno.test("buildIngredientPayloadItem: display_text and amount", () => {
  const a = buildIngredientPayloadItem({ name: "Молоко", amount: "200", unit: "мл", display_text: "" }, 0);
  if (a.display_text !== "Молоко — 200 мл") throw new Error("display_text with unit");
  if (a.amount !== "200") throw new Error("numeric amount");
  if (a.unit !== "мл") throw new Error("unit");

  const b = buildIngredientPayloadItem({ name: "Соль", amount: "по вкусу", display_text: "Соль — по вкусу" }, 1);
  if (b.amount !== null) throw new Error("non-numeric amount should be null");
  if (b.display_text !== "Соль — по вкусу") throw new Error("display_text");
});
