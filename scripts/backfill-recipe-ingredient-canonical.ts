/**
 * Safe canonical backfill для recipe_ingredients: заполняет canonical_amount / canonical_unit
 * по тем же правилам, что normalize_ingredient_unit + ingredient_canonical в PostgreSQL.
 *
 * Переменные: SUPABASE_URL (или VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY; .env / .env.local.
 *
 * npm run backfill:ingredient-canonical -- --diagnose-only --recipe-source=seed
 * npm run backfill:ingredient-canonical -- --dry-run --recipe-source=seed --limit=500
 * npm run backfill:ingredient-canonical -- --recipe-source=seed --limit=500
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCanonicalIngredientRow,
  type IngredientCanonicalRowInput,
} from "../shared/ingredientCanonicalBackfill.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const ROW_SELECT =
  "id, recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      const key = m[1];
      const raw = m[2].trim();
      const value =
        raw.startsWith('"') && raw.endsWith('"')
          ? raw.slice(1, -1).replace(/\\"/g, '"')
          : raw.replace(/^['']|['']$/g, "");
      if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
    }
  }
}
loadEnvFile(join(repoRoot, ".env"));
loadEnvFile(join(repoRoot, ".env.local"));

type CliOptions = {
  dryRun: boolean;
  verbose: boolean;
  diagnoseOnly: boolean;
  limit: number | null;
  offset: number;
  recipeSources: string[] | null;
  recipeId: string | null;
  trustLevel: string | null;
  onlyMissingCanonical: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let verbose = false;
  let diagnoseOnly = false;
  let limit: number | null = null;
  let offset = 0;
  let recipeSources: string[] | null = null;
  let recipeId: string | null = null;
  let trustLevel: string | null = null;
  let onlyMissingCanonical = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a === "--diagnose-only") diagnoseOnly = true;
    else if (a === "--only-missing-canonical") onlyMissingCanonical = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run backfill:ingredient-canonical -- [options]

  --diagnose-only          Только статистика по БД (без backfill)
  --dry-run                Backfill без записи
  --verbose                Лог по строкам
  --limit=N   --offset=N
  --recipe-source=seed[,manual,...]
  --recipe-id=UUID
  --trust-level=core       Доп. фильтр на recipes.trust_level
  --only-missing-canonical Только строки, где оба канона NULL
`);
      process.exit(0);
    } else if (a.startsWith("--limit=")) limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    else if (a.startsWith("--offset=")) offset = Math.max(0, parseInt(a.slice("--offset=".length), 10) || 0);
    else if (a.startsWith("--recipe-source=")) {
      recipeSources = a
        .slice("--recipe-source=".length)
        .trim()
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith("--recipe-id=")) recipeId = a.slice("--recipe-id=".length).trim() || null;
    else if (a.startsWith("--trust-level=")) trustLevel = a.slice("--trust-level=".length).trim().toLowerCase() || null;
  }

  return { dryRun, verbose, diagnoseOnly, limit, offset, recipeSources, recipeId, trustLevel, onlyMissingCanonical };
}

async function fetchRecipeIdsScoped(
  supabase: SupabaseClient,
  opts: CliOptions,
): Promise<string[]> {
  if (opts.recipeId) return [opts.recipeId];
  const ids: string[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = supabase.from("recipes").select("id").order("id", { ascending: true }).range(from, from + page - 1);
    if (opts.recipeSources?.length) q = q.in("source", opts.recipeSources);
    if (opts.trustLevel) q = q.eq("trust_level", opts.trustLevel);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) ids.push(r.id);
    if (data.length < page) break;
    from += page;
  }
  return ids;
}

type IngRow = {
  id: string;
  recipe_id: string;
  name: string | null;
  amount: unknown;
  unit: string | null;
  display_text: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
};

async function fetchIngredientsForRecipes(
  supabase: SupabaseClient,
  recipeIds: string[],
): Promise<IngRow[]> {
  const CHUNK = 100;
  const acc: IngRow[] = [];
  for (let i = 0; i < recipeIds.length; i += CHUNK) {
    const chunk = recipeIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("recipe_ingredients").select(ROW_SELECT).in("recipe_id", chunk);
    if (error) throw error;
    if (data?.length) acc.push(...(data as IngRow[]));
  }
  acc.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return acc;
}

async function runDiagnose(supabase: SupabaseClient, opts: CliOptions): Promise<void> {
  const recipeIds = await fetchRecipeIdsScoped(supabase, opts);
  console.log("\n=== Диагностика recipe_ingredients (канон) ===");
  console.log("Рецептов в области:", recipeIds.length);
  if (recipeIds.length === 0) {
    console.log("Нет рецептов по фильтрам.");
    return;
  }

  const rows = await fetchIngredientsForRecipes(supabase, recipeIds);
  console.log("Всего строк ингредиентов:", rows.length);

  let nullCa = 0;
  let nullCu = 0;
  let bothNull = 0;
  let validCanon = 0;
  const rawUnitFreq: Record<string, number> = {};
  const canonUnitFreq: Record<string, number> = {};
  const sourceFreq: Record<string, number> = {};

  for (const r of rows) {
    const ca = r.canonical_amount;
    const cu = r.canonical_unit;
    if (ca == null) nullCa++;
    if (cu == null || String(cu).trim() === "") nullCu++;
    if (ca == null && (cu == null || String(cu).trim() === "")) bothNull++;

    const hasAmt = r.amount != null && String(r.amount).trim() !== "";
    const hasUt = r.unit != null && String(r.unit).trim() !== "";
    const hasDt = (r.display_text ?? "").trim().length > 0;
    if (hasAmt || hasUt) {
      const k = "amount_or_unit_set";
      sourceFreq[k] = (sourceFreq[k] ?? 0) + 1;
    } else if (hasDt) {
      const k = "display_only_no_amount_unit";
      sourceFreq[k] = (sourceFreq[k] ?? 0) + 1;
    }

    const u = (r.unit ?? "").trim() || "(пусто)";
    rawUnitFreq[u] = (rawUnitFreq[u] ?? 0) + 1;

    if (ca != null && cu != null && String(cu).trim() !== "") {
      validCanon++;
      const cuk = String(cu).trim().toLowerCase();
      canonUnitFreq[cuk] = (canonUnitFreq[cuk] ?? 0) + 1;
    }
  }

  const topRaw = Object.entries(rawUnitFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const topCanon = Object.entries(canonUnitFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log("canonical_amount IS NULL:", nullCa);
  console.log("canonical_unit пустой/NULL:", nullCu);
  console.log("оба канона пустые:", bothNull);
  console.log("строк с заполненным canonical_amount и canonical_unit:", validCanon);
  console.log("источники (грубо):", JSON.stringify(sourceFreq));
  console.log("топ unit (сырой):", JSON.stringify(Object.fromEntries(topRaw)));
  console.log("топ canonical_unit:", JSON.stringify(Object.fromEntries(topCanon)));

  let wouldUpdate = 0;
  const dryReasons: Record<string, number> = {};
  for (const r of rows) {
    const ev = evaluateCanonicalIngredientRow(
      {
        name: r.name,
        amount: r.amount,
        unit: r.unit,
        display_text: r.display_text,
        canonical_amount: r.canonical_amount,
        canonical_unit: r.canonical_unit,
      },
      { onlyMissingCanonical: opts.onlyMissingCanonical },
    );
    if (ev.decision === "update") wouldUpdate++;
    else dryReasons[ev.reason] = (dryReasons[ev.reason] ?? 0) + 1;
  }
  console.log("\n(симуляция backfill) would_update:", wouldUpdate);
  console.log("skip reasons:", JSON.stringify(dryReasons, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Нужны SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  if (opts.diagnoseOnly) {
    await runDiagnose(supabase, opts);
    console.log(
      "\nРекомендуемый порядок: diagnose → canonical dry-run → canonical write → dual dry-run → dual write.\n",
    );
    return;
  }

  const recipeIds = await fetchRecipeIdsScoped(supabase, opts);
  if (recipeIds.length === 0) {
    console.error("Нет рецептов по фильтрам.");
    process.exit(1);
  }

  let rows = await fetchIngredientsForRecipes(supabase, recipeIds);
  const end = opts.limit != null ? opts.offset + opts.limit : undefined;
  rows = rows.slice(opts.offset, end);

  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };

  let scanned = 0;
  let updated = 0;

  for (const r of rows) {
    scanned++;
    const input: IngredientCanonicalRowInput = {
      name: r.name,
      amount: r.amount,
      unit: r.unit,
      display_text: r.display_text,
      canonical_amount: r.canonical_amount,
      canonical_unit: r.canonical_unit,
    };
    const ev = evaluateCanonicalIngredientRow(input, { onlyMissingCanonical: opts.onlyMissingCanonical });

    if (ev.decision === "skip") {
      bump(ev.reason);
      if (opts.verbose) console.log(`[skip] id=${r.id} reason=${ev.reason}`);
      continue;
    }

    bump(ev.reason);
    bump("updated_canonical");
    if (opts.verbose) {
      console.log(
        `[update] id=${r.id} ${ev.patch.canonical_amount} ${ev.patch.canonical_unit} (${ev.resolutionSource})`,
      );
    }

    if (opts.dryRun) {
      updated++;
      continue;
    }

    let q = supabase
      .from("recipe_ingredients")
      .update({
        canonical_amount: ev.patch.canonical_amount,
        canonical_unit: ev.patch.canonical_unit,
      })
      .eq("id", r.id);

    if (opts.onlyMissingCanonical) {
      q = q.is("canonical_amount", null).is("canonical_unit", null);
    }

    const { error: upErr } = await q;
    if (upErr) {
      bump("update_failed");
      console.error(`[update_failed] id=${r.id}`, upErr.message);
      continue;
    }
    updated++;
  }

  console.log(opts.dryRun ? "\n=== Canonical backfill dry-run ===" : "\n=== Canonical backfill ===");
  console.log(`scanned_rows=${scanned}`);
  console.log(opts.dryRun ? `would_update=${updated}` : `updated=${updated}`);
  console.log("by_reason:", JSON.stringify(counts, null, 2));
  if (opts.dryRun) {
    console.log("\nДальше: без --dry-run для записи, затем npm run backfill:ingredient-dual -- --dry-run ...\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
