#!/usr/bin/env node
/**
 * Syncs the single source of truth for allergen tokens to Edge (Deno).
 * Source: src/shared/allergensDictionary.ts
 * Target: supabase/functions/_shared/allergensDictionary.ts
 *
 * Run before deploying Edge functions so Deno uses the same dictionary as the frontend.
 * Usage: node scripts/sync-allergens-dict.mjs
 * npm script: npm run sync:allergens
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "src", "shared", "allergensDictionary.ts");
const dest = join(root, "supabase", "functions", "_shared", "allergensDictionary.ts");

const content = readFileSync(src, "utf8");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, content, "utf8");
console.log("Synced src/shared/allergensDictionary.ts -> supabase/functions/_shared/allergensDictionary.ts");
