/**
 * Безопасный backfill dual display для recipe_ingredients (core/seed/существующие рецепты).
 * Источник правил: evaluateDualMeasurementBackfill → enrichIngredientMeasurementForSave (тот же engine/gate, что save-time).
 *
 * Переменные: SUPABASE_URL (или VITE_SUPABASE_URL из .env), SUPABASE_SERVICE_ROLE_KEY.
 * Автоматически подгружаются корневые `.env` и `.env.local` (как у других scripts/), без перезаписи уже заданных в shell.
 *
 * Запуск:
 *   npm run backfill:ingredient-dual -- --dry-run --pool
 *   npm run backfill:ingredient-dual -- --pool
 *   npm run backfill:ingredient-dual -- --dry-run --verbose --limit=50 --pool
 *   npm run backfill:ingredient-dual -- --recipe-source=seed --offset=0 --limit=200
 *   npm run backfill:ingredient-dual -- --recipe-id=<uuid>
 *   npm run backfill:ingredient-dual -- --only-canonical
 *
 * --pool = все рецепты общего пула (source: seed, starter, manual, week_ai, chat_ai) — как RLS и generate-plan.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDualMeasurementBackfill,
  type IngredientRowForDualBackfill,
} from "../shared/ingredientDualBackfill.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const INGREDIENT_SELECT =
  "id, recipe_id, name, display_text, canonical_amount, canonical_unit, category, measurement_mode, display_amount, display_unit, display_quantity_text";

/** Как `POOL_SOURCES` в `src/utils/recipeCanonical.ts` и RLS «pool recipes» в миграциях. */
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

function loadEnvFromDotenvFiles(): void {
  loadEnvFile(join(repoRoot, ".env"));
  loadEnvFile(join(repoRoot, ".env.local"));
}

loadEnvFromDotenvFiles();

type CliOptions = {
  dryRun: boolean;
  verbose: boolean;
  limit: number | null;
  offset: number;
  recipeSources: string[] | null;
  recipeId: string | null;
  userId: string | null;
  onlyCanonical: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let verbose = false;
  let limit: number | null = null;
  let offset = 0;
  let recipeSources: string[] | null = null;
  let recipeId: string | null = null;
  let userId: string | null = null;
  let onlyCanonical = false;
  let wantPool = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a === "--only-canonical") onlyCanonical = true;
    else if (a === "--pool") wantPool = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run backfill:ingredient-dual -- [options]

Options:
  --dry-run              Не писать в БД, только отчёт
  --verbose              Лог по каждой строке (id, reason)
  --limit=N              Максимум строк из выборки (с учётом offset)
  --offset=N             Смещение по id (order id asc)
  --pool                 Все рецепты общего пула: source ∈ seed, starter, manual, week_ai, chat_ai
  --recipe-source=X      Узкий фильтр source (через запятую). С --pool: если задано оба — побеждает --recipe-source
  --user-id=UUID         Сузить к рецептам одного владельца (редко нужно для каталога)
  --recipe-id=UUID       Только ингредиенты этого рецепта
  --only-canonical       Не чинить битый dual, только measurement_mode = canonical_only
`);
      process.exit(0);
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a.startsWith("--offset=")) {
      offset = Math.max(0, parseInt(a.slice("--offset=".length), 10) || 0);
    } else if (a.startsWith("--recipe-source=")) {
      const raw = a.slice("--recipe-source=".length).trim();
      recipeSources = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (a.startsWith("--recipe-id=")) {
      recipeId = a.slice("--recipe-id=".length).trim() || null;
    } else if (a.startsWith("--user-id=")) {
      userId = a.slice("--user-id=".length).trim() || null;
    }
  }

  if (wantPool) {
    if (recipeSources?.length) {
      console.warn(
        "[warn] Заданы и --pool, и --recipe-source: используется только список из --recipe-source (не весь пул).",
      );
    } else {
      recipeSources = [...RECIPE_POOL_SOURCES];
    }
  }

  return { dryRun, verbose, limit, offset, recipeSources, recipeId, userId, onlyCanonical };
}

type RowFromDb = {
  id: string;
  recipe_id: string;
  name: string | null;
  display_text: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
  category: string | null;
  measurement_mode: string | null;
  display_amount: number | null;
  display_unit: string | null;
  display_quantity_text: string | null;
  recipes?: { id: string; source: string } | { id: string; source: string }[] | null;
  /** Подставляется при выборке по recipe_id без embed */
  _source?: string;
};

function normalizeRow(r: RowFromDb): IngredientRowForDualBackfill {
  return {
    name: r.name,
    display_text: r.display_text,
    canonical_amount: r.canonical_amount,
    canonical_unit: r.canonical_unit,
    category: r.category,
    measurement_mode: r.measurement_mode,
    display_amount: r.display_amount,
    display_unit: r.display_unit,
    display_quantity_text: r.display_quantity_text,
  };
}

function recipeSourceFromRow(r: RowFromDb): string {
  if (r._source) return r._source;
  const rec = r.recipes;
  if (Array.isArray(rec)) return rec[0]?.source ?? "?";
  return rec?.source ?? "?";
}

/** Рецепты по фильтрам (AND): опционально user_id и/или source. */
async function fetchRecipeIdsFiltered(
  supabase: SupabaseClient,
  filters: { sources?: string[]; userId?: string | null },
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = supabase.from("recipes").select("id").order("id", { ascending: true });
    if (filters.userId) q = q.eq("user_id", filters.userId);
    if (filters.sources?.length) q = q.in("source", filters.sources);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) ids.push(r.id);
    if (data.length < page) break;
    from += page;
  }
  return ids;
}

async function fetchIngredientsForRecipeIdChunks(
  supabase: SupabaseClient,
  recipeIds: string[],
  onlyCanonical: boolean,
): Promise<RowFromDb[]> {
  const modes = onlyCanonical ? (["canonical_only"] as const) : (["canonical_only", "dual"] as const);
  const CHUNK = 100;
  const acc: RowFromDb[] = [];
  for (let i = 0; i < recipeIds.length; i += CHUNK) {
    const chunk = recipeIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select(INGREDIENT_SELECT)
      .not("canonical_amount", "is", null)
      .in("recipe_id", chunk)
      .in("measurement_mode", [...modes]);
    if (error) throw error;
    if (data?.length) acc.push(...(data as RowFromDb[]));
  }
  acc.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return acc;
}

async function logDiagnosticsWhenNoIngredientMatches(
  supabase: SupabaseClient,
  recipeIds: string[],
): Promise<void> {
  const idSample = recipeIds.slice(0, 80);
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select("id, canonical_amount, measurement_mode")
    .in("recipe_id", idSample)
    .limit(2000);
  if (error) {
    console.warn("[diag] Не удалось снять статистику:", error.message);
    return;
  }
  if (!data?.length) {
    console.warn(
      `[diag] У первых ${idSample.length} рецептов из выборки нет строк в recipe_ingredients — проверьте целостность данных.`,
    );
    return;
  }
  const total = data.length;
  const nullCanon = data.filter((r) => r.canonical_amount == null).length;
  const modeCounts: Record<string, number> = {};
  for (const r of data) {
    const m = r.measurement_mode == null || r.measurement_mode === "" ? "(пусто)" : String(r.measurement_mode);
    modeCounts[m] = (modeCounts[m] ?? 0) + 1;
  }
  console.log(
    `[diag] Выборка ${total} ингредиентов (рецепты из начала списка): canonical_amount IS NULL — ${nullCanon} (${Math.round((nullCanon / total) * 100)}%); measurement_mode → ${JSON.stringify(modeCounts)}`,
  );
  if (nullCanon === total) {
    console.log(
      "[diag] Похоже, в сид-данных не заполнен канон (г/мл). Dual backfill работает только при заполненных canonical_amount + canonical_unit.\n" +
        "     Сначала нужны canonical в JSON импорта или `npm run backfill:ingredient-canonical`; см. поля в seed и scripts/import-infant-seed.ts.",
    );
  } else if (nullCanon < total) {
    const badModes = Object.keys(modeCounts).filter((k) => k !== "canonical_only" && k !== "dual" && k !== "(пусто)");
    if (badModes.length) {
      console.log(
        `[diag] Есть строки с неожиданным measurement_mode (${badModes.join(", ")}). Скрипт обрабатывает только canonical_only и dual.`,
      );
    }
  }
}

async function attachRecipeSources(supabase: SupabaseClient, rows: RowFromDb[]): Promise<void> {
  const u = [...new Set(rows.map((r) => r.recipe_id))];
  const map = new Map<string, string>();
  const CHUNK = 150;
  for (let i = 0; i < u.length; i += CHUNK) {
    const ch = u.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("recipes").select("id, source").in("id", ch);
    if (error) throw error;
    for (const r of data ?? []) map.set(r.id, r.source);
  }
  for (const row of rows) {
    row._source = map.get(row.recipe_id) ?? "?";
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Нужны SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY в окружении или в .env / .env.local в корне репозитория.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };

  let scanned = 0;
  let updated = 0;

  const pageSize = 400;

  const baseQueryNoJoin = () => {
    let q = supabase.from("recipe_ingredients").select(INGREDIENT_SELECT).not("canonical_amount", "is", null);

    if (opts.recipeId) q = q.eq("recipe_id", opts.recipeId);
    if (opts.onlyCanonical) q = q.eq("measurement_mode", "canonical_only");
    else q = q.in("measurement_mode", ["canonical_only", "dual"]);

    return q.order("id", { ascending: true });
  };

  const processRows = async (rows: RowFromDb[]) => {
    for (const raw of rows) {
      scanned++;
      const row = normalizeRow(raw);
      const ev = evaluateDualMeasurementBackfill(row);

      if (ev.decision === "skip") {
        bump(ev.reason);
        if (opts.verbose) {
          console.log(
            `[skip] id=${raw.id} recipe=${raw.recipe_id} source=${recipeSourceFromRow(raw)} reason=${ev.reason}`,
          );
        }
        continue;
      }

      bump("updated_to_dual");
      if (opts.verbose) {
        console.log(
          `[update] id=${raw.id} recipe=${raw.recipe_id} source=${recipeSourceFromRow(raw)} prior_mode=${ev.priorMeasurementMode}`,
        );
      }

      if (opts.dryRun) {
        updated++;
        continue;
      }

      const priorMode = ((raw.measurement_mode ?? "canonical_only").trim() || "canonical_only").toLowerCase();
      const { error: upErr } = await supabase
        .from("recipe_ingredients")
        .update({
          display_amount: ev.patch.display_amount,
          display_unit: ev.patch.display_unit,
          display_quantity_text: ev.patch.display_quantity_text,
          measurement_mode: ev.patch.measurement_mode,
          display_text: ev.patch.display_text,
        })
        .eq("id", raw.id)
        .eq("measurement_mode", priorMode);

      if (upErr) {
        bump("update_failed");
        console.error(`[update_failed] id=${raw.id}`, upErr.message);
        continue;
      }
      updated++;
    }
  };

  if ((opts.recipeSources?.length || opts.userId) && !opts.recipeId) {
    const recipeIds = await fetchRecipeIdsFiltered(supabase, {
      sources: opts.recipeSources?.length ? opts.recipeSources : undefined,
      userId: opts.userId ?? undefined,
    });
    if (recipeIds.length === 0) {
      const parts: string[] = [];
      if (opts.userId) parts.push(`user_id = ${opts.userId}`);
      if (opts.recipeSources?.length) parts.push(`source ∈ [${opts.recipeSources.join(", ")}]`);
      console.warn(
        `\n[hint] В этом проекте Supabase нет строк в recipes с фильтром: ${parts.join(" AND ") || "(пусто)"}.\n` +
          `        Проверьте URL в .env и значения recipes.user_id / recipes.source.\n`,
      );
    } else {
      const f: string[] = [];
      if (opts.userId) f.push(`user_id`);
      if (opts.recipeSources?.length) f.push(`source`);
      console.log(`Рецептов по фильтру (${f.join(" + ") || "—"}): ${recipeIds.length} (загрузка ингредиентов пачками…)`);
    }
    let all = await fetchIngredientsForRecipeIdChunks(supabase, recipeIds, opts.onlyCanonical);
    if (recipeIds.length > 0 && all.length === 0) {
      console.warn(
        "[hint] После фильтров не осталось строк: нужны recipe_ingredients с NOT NULL canonical_amount и measurement_mode ∈ {canonical_only, dual}.\n",
      );
      await logDiagnosticsWhenNoIngredientMatches(supabase, recipeIds);
    }
    if (opts.verbose || all.length > 0) {
      await attachRecipeSources(supabase, all);
    }
    const end = opts.limit != null ? opts.offset + opts.limit : undefined;
    all = all.slice(opts.offset, end);
    if (all.length) await processRows(all);
  } else {
    if (opts.limit != null) {
      const from = opts.offset;
      const to = opts.offset + Math.max(0, opts.limit) - 1;
      const { data: rows, error } = await baseQueryNoJoin().range(from, to);
      if (error) {
        console.error(error);
        process.exit(1);
      }
      if (rows?.length) {
        const list = rows as RowFromDb[];
        if (opts.verbose) await attachRecipeSources(supabase, list);
        await processRows(list);
      }
    } else {
      let cursor = opts.offset;
      for (;;) {
        const { data: rows, error } = await baseQueryNoJoin().range(cursor, cursor + pageSize - 1);
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (!rows?.length) break;
        const list = rows as RowFromDb[];
        if (opts.verbose) await attachRecipeSources(supabase, list);
        await processRows(list);
        if (rows.length < pageSize) break;
        cursor += rows.length;
      }
    }
  }

  console.log(opts.dryRun ? "\n=== Dry-run summary ===" : "\n=== Backfill summary ===");
  console.log(`scanned_rows=${scanned}`);
  console.log(opts.dryRun ? `would_update=${updated}` : `updated=${updated}`);
  console.log("by_reason:", JSON.stringify(counts, null, 2));
  if (opts.dryRun) {
    console.log("\nПовторите без --dry-run для записи в БД.");
  }
  if (scanned === 0 && !counts["update_failed"]) {
    console.log(
      "\n[hint] scanned_rows=0: ни одна строка не попала под фильтры (или в БД нет таких рецептов/ингредиентов).\n" +
        "       Попробуйте без --recipe-source, чтобы увидеть общую выборку: npm run backfill:ingredient-dual -- --dry-run --limit=20\n",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
