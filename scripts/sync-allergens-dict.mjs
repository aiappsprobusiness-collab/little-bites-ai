#!/usr/bin/env node
/**
 * Syncs shared allergen / allergy-match modules to Edge (Deno).
 * Sources: src/shared/*.ts
 * Targets: supabase/functions/_shared/*.ts
 *
 * Usage: node scripts/sync-allergens-dict.mjs
 * npm script: npm run sync:allergens
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const destDir = join(root, "supabase", "functions", "_shared");

const pairs = [
  ["src/shared/allergensDictionary.ts", "allergensDictionary.ts"],
  ["src/shared/meatAllergyTokens.ts", "meatAllergyTokens.ts"],
  ["src/shared/recipeAllergyMatch.ts", "recipeAllergyMatch.ts"],
  ["src/shared/chatRecipeAllergySafety.ts", "chatRecipeAllergySafety.ts"],
];

mkdirSync(destDir, { recursive: true });
for (const [relSrc, destName] of pairs) {
  const srcPath = join(root, relSrc);
  const destPath = join(destDir, destName);
  const content = readFileSync(srcPath, "utf8");
  writeFileSync(destPath, content, "utf8");
  console.log(`Synced ${relSrc} -> supabase/functions/_shared/${destName}`);
}
