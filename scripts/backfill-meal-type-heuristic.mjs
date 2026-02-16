/**
 * Backfill meal_type в public.recipes по эвристике (title + description).
 * Обрабатывает только строки с meal_type IS NULL.
 *
 * Запуск (из корня, нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env):
 *   node scripts/backfill-meal-type-heuristic.mjs              # dry-run, все NULL
 *   node scripts/backfill-meal-type-heuristic.mjs --limit 200   # dry-run, первые 200
 *   node scripts/backfill-meal-type-heuristic.mjs --apply       # реально обновить все
 *   node scripts/backfill-meal-type-heuristic.mjs --limit 500 --apply
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      const key = m[1];
      const raw = m[2].trim();
      const value = raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replace(/\\"/g, '"')
        : raw.replace(/^['']|['']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (в .env или в окружении).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH = 500;

const BREAKFAST_TOKENS = [
  "каша", "овсян", "омлет", "блин", "олад", "сырник", "запеканк", "тост", "гранола", "мюсли",
];
const SNACK_TOKENS = [
  "фрукт", "яблок", "груш", "банан", "ягоды", "орех", "перекус", "печенье", "батончик", "пюре", "смузи",
];
const LUNCH_DINNER_TOKENS = [
  "суп", "борщ", "щи", "солянк", "рагу", "тушен", "котлет", "плов", "паста", "фарш", "запеч", "рыба", "мясо",
];
const SOUP_TOKENS = ["суп", "борщ", "щи", "солянк"];

function normalizeTitle(str) {
  if (str == null || typeof str !== "string") return "";
  return str.toLowerCase().trim();
}

/** Возвращает 'breakfast' | 'snack' | 'lunch' | 'dinner' | null. */
function inferMealType(title, description) {
  const text = normalizeTitle(title) + " " + normalizeTitle(description);
  if (!text.trim()) return null;

  const hasSoup = SOUP_TOKENS.some((t) => text.includes(t));
  if (hasSoup) return "lunch";

  const hasBreakfast = BREAKFAST_TOKENS.some((t) => text.includes(t));
  if (hasBreakfast) return "breakfast";

  const hasSnack = SNACK_TOKENS.some((t) => text.includes(t));
  if (hasSnack) return "snack";

  const hasMeal = LUNCH_DINNER_TOKENS.some((t) => text.includes(t));
  if (hasMeal) return "dinner";

  return null;
}

function parseLimit() {
  const idx = process.argv.indexOf("--limit");
  if (idx === -1 || !process.argv[idx + 1]) return null;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = parseLimit();

  const { count: totalNullCount } = await supabase.from("recipes").select("id", { count: "exact", head: true }).is("meal_type", null);
  const totalNull = totalNullCount ?? 0;
  console.log("Рецептов с meal_type IS NULL (всего):", totalNull);
  if (limit != null) console.log("Ограничение --limit:", limit);

  const stats = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
  let updated = 0;
  let offset = 0;

  while (true) {
    let q = supabase
      .from("recipes")
      .select("id, title, description, meal_type")
      .is("meal_type", null)
      .range(offset, offset + BATCH - 1);

    const { data: batch, error } = await q;
    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }
    const rows = batch || [];
    if (rows.length === 0) break;

    for (const r of rows) {
      const inferred = inferMealType(r.title, r.description);
      if (inferred) {
        stats[inferred]++;
        if (apply) {
          const { error: upErr } = await supabase.from("recipes").update({ meal_type: inferred }).eq("id", r.id);
          if (upErr) console.error("Update error", r.id, upErr.message);
          else updated++;
        }
      }
    }

    offset += rows.length;
    if (limit != null && offset >= limit) break;
  }

  const processed = offset;
  const wouldUpdate = stats.breakfast + stats.lunch + stats.snack + stats.dinner;
  const remainingNull = totalNull - (apply ? updated : wouldUpdate);

  console.log("\n--- Статистика ---");
  console.log("Обработано строк с NULL:", processed);
  console.log("Будет/было обновлено по типам:", stats);
  console.log("Осталось NULL (unknown):", remainingNull);
  if (!apply) {
    console.log("\n[DRY-RUN] Запись не выполнялась. Запустите с --apply для обновления.");
  } else {
    console.log("\nОбновлено записей:", updated);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
