/**
 * Сборка JSON каталога из .txt с несколькими JSON-объектами.
 *
 * Toddler 12–36 мес (по умолчанию):
 *   node scripts/generate-toddler-catalog-json.mjs
 *   node scripts/generate-toddler-catalog-json.mjs "C:/path/to/toddler_12_36_months_snack_stage1.txt"
 *
 * Child 37–96 мес:
 *   node scripts/generate-toddler-catalog-json.mjs child-37-96
 *   node scripts/generate-toddler-catalog-json.mjs child-37-96 "C:/path/to/child_37_96_months_snack_stage1.txt"
 *
 * Child 97–216 мес:
 *   node scripts/generate-toddler-catalog-json.mjs child-97-216
 *   node scripts/generate-toddler-catalog-json.mjs child-97-216 "C:/path/to/child_97_216_months_snack_stage1.txt"
 *
 * Adult 216–1200 мес (несколько JSON-массивов подряд):
 *   node scripts/generate-toddler-catalog-json.mjs adult-216-1200
 *   node scripts/generate-toddler-catalog-json.mjs adult-216-1200 "C:/path/to/adult_216_1200_months_snack_stage1.txt"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  ADULT_216_1200_CATALOG_BATCH_TAG,
  buildAdult2161200CatalogFromFileContent,
  buildChild3796CatalogFromFileContent,
  buildChild97216CatalogFromFileContent,
  buildToddlerCatalogFromFileContent,
  CHILD_37_96_CATALOG_BATCH_TAG,
  CHILD_97_216_CATALOG_BATCH_TAG,
  summarizeByField,
  TODDLER_CATALOG_BATCH_TAG,
} from "./toddler-seed/buildToddlerCatalogRecipes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const MODES = new Set(["child-37-96", "child-97-216", "adult-216-1200"]);
const args = process.argv.slice(2);
const mode = MODES.has(args[0]) ? args[0] : "toddler";
const pathArg = mode === "toddler" ? args[0] : args[1];

/** @type {{ defaultSource: string; outPath: string; batchTag: string; seedPrefix: string; build: (c: string) => unknown[]; hint: string }} */
const CONFIG = {
  toddler: {
    defaultSource: join(root, "data", "toddler-seed", "toddler_12_36_months_multimeal.source.txt"),
    outPath: join(root, "data", "toddler-seed", "toddler-catalog-recipes.json"),
    batchTag: TODDLER_CATALOG_BATCH_TAG,
    seedPrefix: "toddler_12_36_months_",
    build: buildToddlerCatalogFromFileContent,
    hint:
      "Скопируйте toddler_12_36_months_snack_stage1.txt в data/toddler-seed/toddler_12_36_months_multimeal.source.txt или передайте путь первым аргументом.",
  },
  "child-37-96": {
    defaultSource: join(root, "data", "toddler-seed", "child_37_96_months_multimeal.source.txt"),
    outPath: join(root, "data", "toddler-seed", "child-37-96-catalog-recipes.json"),
    batchTag: CHILD_37_96_CATALOG_BATCH_TAG,
    seedPrefix: "child_37_96_months_",
    build: buildChild3796CatalogFromFileContent,
    hint:
      "Скопируйте child_37_96_months_snack_stage1.txt (npm run seed:child:copy) или передайте путь вторым аргументом после child-37-96.",
  },
  "child-97-216": {
    defaultSource: join(root, "data", "toddler-seed", "child_97_216_months_multimeal.source.txt"),
    outPath: join(root, "data", "toddler-seed", "child-97-216-catalog-recipes.json"),
    batchTag: CHILD_97_216_CATALOG_BATCH_TAG,
    seedPrefix: "child_97_216_months_",
    build: buildChild97216CatalogFromFileContent,
    hint:
      "Скопируйте child_97_216_months_snack_stage1.txt (npm run seed:child:teen:copy) или передайте путь вторым аргументом после child-97-216.",
  },
  "adult-216-1200": {
    defaultSource: join(root, "data", "toddler-seed", "adult_216_1200_months_multimeal.source.txt"),
    outPath: join(root, "data", "toddler-seed", "adult-216-1200-catalog-recipes.json"),
    batchTag: ADULT_216_1200_CATALOG_BATCH_TAG,
    seedPrefix: "adult_216_1200_months_",
    build: buildAdult2161200CatalogFromFileContent,
    hint:
      "Скопируйте adult_216_1200_months_snack_stage1.txt (npm run seed:adult:copy) или передайте путь вторым аргументом после adult-216-1200.",
  },
}[mode];

const sourcePath = pathArg && pathArg !== "--" ? pathArg : CONFIG.defaultSource;

if (!existsSync(sourcePath)) {
  console.error("Нет файла:", sourcePath);
  console.error(CONFIG.hint);
  process.exit(1);
}

const fileContent = readFileSync(sourcePath, "utf8");
const recipes = CONFIG.build(fileContent);

const bySeedSet = {};
for (const r of recipes) {
  const tags = r.tags ?? [];
  const b = tags.find(
    (t) => typeof t === "string" && t.startsWith(CONFIG.seedPrefix) && t.endsWith("_stage1")
  );
  if (b) bySeedSet[b] = (bySeedSet[b] ?? 0) + 1;
}

mkdirSync(dirname(CONFIG.outPath), { recursive: true });
writeFileSync(
  CONFIG.outPath,
  JSON.stringify(
    {
      version: 1,
      batchTag: CONFIG.batchTag,
      generatedAt: new Date().toISOString(),
      sourceFile: sourcePath,
      count: recipes.length,
      summary: {
        byMealType: summarizeByField(recipes, "meal_type"),
        bySeedSet,
      },
      recipes,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`Записано ${recipes.length} рецептов → ${CONFIG.outPath}`);
console.log("batchTag:", CONFIG.batchTag);
console.log("По meal_type:", summarizeByField(recipes, "meal_type"));
console.log("По seedSet (тег):", bySeedSet);
