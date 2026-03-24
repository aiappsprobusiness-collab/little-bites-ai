/**
 * Пишет data/infant-seed-recipes.json из программного генератора.
 * Запуск: node scripts/generate-infant-seed-json.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  buildInfantSeedRecipes,
  summarizeByField,
  INFANT_SEED_BATCH_TAG,
} from "./infant-seed/buildInfantSeedRecipes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "data", "infant-seed-recipes.json");

const recipes = buildInfantSeedRecipes();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      version: 1,
      batchTag: INFANT_SEED_BATCH_TAG,
      generatedAt: new Date().toISOString(),
      count: recipes.length,
      summary: {
        byMealType: summarizeByField(recipes, "meal_type"),
        byMinAge: summarizeByField(recipes, "min_age_months"),
      },
      recipes,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`Записано ${recipes.length} рецептов → ${outPath}`);
console.log("По meal_type:", summarizeByField(recipes, "meal_type"));
