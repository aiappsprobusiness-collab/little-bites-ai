/**
 * Восстановление canonical_amount/unit для «бытовых» строк (зубчик, веточка, ломтик и т.д.)
 * после стандартного backfill:iana, когда evaluateCanonicalIngredientRow всё ещё не может распарсить.
 *
 * Переменные: SUPABASE_URL | VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   npm run repair:household-canonical -- --dry-run --pool
 *   npm run repair:household-canonical -- --pool
 *   npm run repair:household-canonical -- --dry-run --recipe-source=chat_ai
 *   npm run repair:household-canonical -- --pool --fix-categories --verbose
 *
 * После успешного прогона: npm run backfill:ingredient-dual -- --pool
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCanonicalIngredientRow,
  type IngredientCanonicalRowInput,
} from "../shared/ingredientCanonicalBackfill.ts";
import {
  appendCanonicalGramSuffix,
  tryHouseholdCanonicalHeuristic,
} from "../shared/ingredientHouseholdCanonicalHeuristic.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const RECIPE_POOL_SOURCES = ["seed", "starter", "manual", "week_ai", "chat_ai"] as const;

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

type Cli = {
  dryRun: boolean;
  verbose: boolean;
  pool: boolean;
  recipeSources: string[] | null;
  fixCategories: boolean;
  limit: number | null;
};

function parseArgs(argv: string[]): Cli {
  let dryRun = false;
  let verbose = false;
  let pool = false;
  let fixCategories = false;
  let recipeSources: string[] | null = null;
  let limit: number | null = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a === "--pool") pool = true;
    else if (a === "--fix-categories") fixCategories = true;
    else if (a.startsWith("--recipe-source=")) {
      recipeSources = a
        .slice("--recipe-source=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    }
  }
  if (pool && !recipeSources?.length) {
    recipeSources = [...RECIPE_POOL_SOURCES];
  }
  return { dryRun, verbose, pool, recipeSources, fixCategories, limit };
}

async function fetchRecipeIds(supabase: SupabaseClient, sources: string[] | null): Promise<string[]> {
  if (!sources?.length) {
    console.error("Укажите --pool или --recipe-source=seed,chat_ai,...");
    process.exit(1);
  }
  const ids: string[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("recipes")
      .select("id")
      .in("source", sources)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
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
  category: string | null;
};

async function fetchBrokenCanonicalRows(supabase: SupabaseClient, recipeIds: string[]): Promise<IngRow[]> {
  const CHUNK = 80;
  const acc: IngRow[] = [];
  for (let i = 0; i < recipeIds.length; i += CHUNK) {
    const chunk = recipeIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, category")
      .in("recipe_id", chunk)
      .or("canonical_amount.is.null,canonical_unit.is.null");
    if (error) throw error;
    if (data?.length) acc.push(...(data as IngRow[]));
  }
  acc.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return acc;
}

function suggestCategoryFix(name: string | null, category: string | null): string | null {
  const n = (name ?? "").toLowerCase();
  const c = category ?? "";
  if (/чеснок/i.test(n) && c !== "spices") return "spices";
  if (/сельдер/i.test(n) && c === "fish") return "vegetables";
  return null;
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
  const recipeIds = await fetchRecipeIds(supabase, opts.recipeSources);
  console.log("Рецептов в области:", recipeIds.length);
  let rows = await fetchBrokenCanonicalRows(supabase, recipeIds);
  console.log("Строк ингредиентов без полного канона:", rows.length);
  if (opts.limit != null) rows = rows.slice(0, opts.limit);

  let stdResolved = 0;
  let heuristicResolved = 0;
  let categoryOnly = 0;
  let categoryWithCanon = 0;
  const skipped: Record<string, number> = {};

  for (const r of rows) {
    const input: IngredientCanonicalRowInput = {
      name: r.name,
      amount: r.amount,
      unit: r.unit,
      display_text: r.display_text,
      canonical_amount: r.canonical_amount,
      canonical_unit: r.canonical_unit,
    };

    const ev = evaluateCanonicalIngredientRow(input, { onlyMissingCanonical: true });
    let canonical_amount: number | null = null;
    let canonical_unit: string | null = null;
    let display_text = r.display_text;
    let heuristicTag: string | null = null;
    let resolution: "standard" | "heuristic" | null = null;

    if (ev.decision === "update") {
      canonical_amount = ev.patch.canonical_amount;
      canonical_unit = ev.patch.canonical_unit;
      resolution = "standard";
      stdResolved++;
    } else {
      const h = tryHouseholdCanonicalHeuristic({
        name: r.name,
        display_text: r.display_text,
        amount: r.amount,
        unit: r.unit,
      });
      if (h) {
        canonical_amount = h.canonical_amount;
        canonical_unit = h.canonical_unit;
        heuristicTag = h.heuristic;
        resolution = "heuristic";
        heuristicResolved++;
        if (h.canonical_unit === "g" && display_text && !/=\s*\d/.test(display_text)) {
          display_text = appendCanonicalGramSuffix(display_text, h.canonical_amount);
        }
      }
    }

    const catFix = opts.fixCategories ? suggestCategoryFix(r.name, r.category) : null;
    let category = r.category;
    if (catFix && catFix !== r.category) {
      category = catFix;
      if (resolution) categoryWithCanon++;
      else categoryOnly++;
    }

    if (!resolution && !(catFix && catFix !== r.category)) {
      skipped[ev.reason] = (skipped[ev.reason] ?? 0) + 1;
      continue;
    }

    if (opts.verbose) {
      const tag =
        resolution === "standard"
          ? "standard"
          : resolution === "heuristic"
            ? `heuristic:${heuristicTag}`
            : "category_only";
      console.log(`[${tag}] id=${r.id} canon=${canonical_amount ?? "?"} ${canonical_unit ?? "?"} ${r.name ?? ""}`);
    }

    if (opts.dryRun) continue;

    const patch: Record<string, unknown> = {};
    if (resolution) {
      patch.canonical_amount = canonical_amount;
      patch.canonical_unit = canonical_unit;
      patch.display_text = display_text;
    }
    if (catFix && catFix !== r.category) patch.category = category;

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("recipe_ingredients").update(patch).eq("id", r.id);
    if (error) {
      console.error(`Ошибка update id=${r.id}:`, error.message);
      process.exit(1);
    }
  }

  console.log("\n=== Итог ===");
  console.log(opts.dryRun ? "(dry-run, записей не было)" : "Запись в БД выполнена.");
  console.log("Стандартный парсер (evaluateCanonicalIngredientRow):", stdResolved);
  console.log("Эвристики бытовых единиц:", heuristicResolved);
  if (opts.fixCategories) {
    console.log("Правок category вместе с каноном:", categoryWithCanon);
    console.log("Только category (канон не удалось):", categoryOnly);
  }
  console.log("Пропуски (из первого прохода evaluateCanonical без успеха heuristic):", JSON.stringify(skipped));
  console.log("\nДальше: npm run backfill:ingredient-dual -- --dry-run --pool && npm run backfill:ingredient-dual -- --pool");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
