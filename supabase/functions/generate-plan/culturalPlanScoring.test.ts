import {
  CULTURAL_ADAPTED_BONUS,
  CULTURAL_CLASSIC_BONUS,
  CULTURAL_SPECIFIC_PENALTY,
  computeCulturalFamiliarityBonus,
  countCulturalFamiliarityInRecipes,
  culturalFamiliarityCountKey,
} from "./culturalPlanScoring.ts";

Deno.test("computeCulturalFamiliarityBonus: classic / adapted / specific / null / unknown", () => {
  if (computeCulturalFamiliarityBonus("classic") !== CULTURAL_CLASSIC_BONUS) {
    throw new Error("classic bonus mismatch");
  }
  if (computeCulturalFamiliarityBonus("adapted") !== CULTURAL_ADAPTED_BONUS) {
    throw new Error("adapted should be neutral");
  }
  if (computeCulturalFamiliarityBonus("specific") !== -CULTURAL_SPECIFIC_PENALTY) {
    throw new Error("specific penalty mismatch");
  }
  if (computeCulturalFamiliarityBonus(null) !== CULTURAL_ADAPTED_BONUS) {
    throw new Error("null → adapted-like neutral");
  }
  if (computeCulturalFamiliarityBonus(undefined) !== CULTURAL_ADAPTED_BONUS) {
    throw new Error("undefined → neutral");
  }
  if (computeCulturalFamiliarityBonus("  ") !== CULTURAL_ADAPTED_BONUS) {
    throw new Error("empty → neutral");
  }
  if (computeCulturalFamiliarityBonus("weird_value") !== CULTURAL_ADAPTED_BONUS) {
    throw new Error("unknown string → neutral (safe)");
  }
});

Deno.test("culturalFamiliarityCountKey buckets", () => {
  if (culturalFamiliarityCountKey("classic") !== "classic") throw new Error("classic");
  if (culturalFamiliarityCountKey("SPECIFIC") !== "specific") throw new Error("case");
  if (culturalFamiliarityCountKey(null) !== "other") throw new Error("null → other");
});

Deno.test("countCulturalFamiliarityInRecipes", () => {
  const c = countCulturalFamiliarityInRecipes([
    { familiarity: "classic" },
    { familiarity: null },
    { familiarity: "specific" },
    { familiarity: "adapted" },
  ]);
  if (c.classic !== 1 || c.adapted !== 1 || c.specific !== 1 || c.other !== 1) {
    throw new Error(JSON.stringify(c));
  }
});
