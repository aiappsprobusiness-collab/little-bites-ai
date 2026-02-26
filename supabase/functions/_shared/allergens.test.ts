/**
 * Tests for shared allergens helper (buildAllergenSet, isRecipeAllowedByAllergens).
 * Run: deno test allergens.test.ts --allow-read
 */
import { buildAllergenSet, isRecipeAllowedByAllergens, containsAnyToken } from "./allergens.ts";

Deno.test("buildAllergenSet: chicken allergy includes кур/куриц", () => {
  const set = buildAllergenSet(["курица"]);
  const t = set.blockedTokens;
  if (!t.some((x) => x.includes("кур") || x === "куриц" || x === "chicken")) {
    throw new Error("Chicken allergy should expand to кур/куриц/chicken, got: " + t.join(", "));
  }
});

Deno.test("isRecipeAllowedByAllergens: rejects recipe with chicken in title", () => {
  const set = buildAllergenSet(["курица"]);
  const recipe = { title: "Суп с курицей и овощами", description: "", recipe_ingredients: [] };
  const r = isRecipeAllowedByAllergens(recipe, set);
  if (r.allowed) throw new Error("Should reject recipe with курицей when allergy is курица");
  if (r.reason !== "allergy") throw new Error("reason should be allergy");
});

Deno.test("isRecipeAllowedByAllergens: allows recipe without allergen", () => {
  const set = buildAllergenSet(["курица"]);
  const recipe = { title: "Гречневая каша на воде", description: "", recipe_ingredients: [] };
  const r = isRecipeAllowedByAllergens(recipe, set);
  if (!r.allowed) throw new Error("Should allow recipe without chicken");
});

Deno.test("containsAnyToken: matches substring", () => {
  if (!containsAnyToken("суп с курицей", ["кур", "куриц"])) throw new Error("Should match кур in курицей");
});

Deno.test("buildAllergenSet: nuts allergy includes орех", () => {
  const set = buildAllergenSet(["орехи"]);
  const t = set.blockedTokens;
  if (!t.some((x) => x.includes("орех") || x === "nut")) {
    throw new Error("Nuts allergy should expand to орех/nut, got: " + t.join(", "));
  }
});

Deno.test("isRecipeAllowedByAllergens: rejects recipe with nuts in ingredients", () => {
  const set = buildAllergenSet(["орехи"]);
  const recipe = {
    title: "Пудинг",
    description: "",
    recipe_ingredients: [{ name: "орехи", display_text: "50 г" }],
  };
  const r = isRecipeAllowedByAllergens(recipe, set);
  if (r.allowed) throw new Error("Should reject recipe with орехи in ingredients");
});
