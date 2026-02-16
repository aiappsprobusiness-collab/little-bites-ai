/**
 * Чинит слоты в meal_plans_v2, у которых recipe_id не существует в public.recipes.
 * Патчит слот: recipe_id = null, title → broken_title, title = null, plan_source = 'broken'.
 *
 * Запуск (из корня, нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env):
 *   node scripts/repair-broken-plan-slots.mjs           # dry-run (по умолчанию)
 *   node scripts/repair-broken-plan-slots.mjs --apply  # реально обновить
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

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUUID(s) {
  return typeof s === "string" && UUID_REGEX.test(s);
}

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const daysBack = 60;
  const startDate = getDaysAgo(daysBack);

  const { data: rows, error: fetchErr } = await supabase
    .from("meal_plans_v2")
    .select("id, user_id, member_id, planned_date, meals")
    .gte("planned_date", startDate)
    .order("planned_date", { ascending: false })
    .limit(200);

  if (fetchErr) {
    console.error("meal_plans_v2 fetch error:", fetchErr.message);
    process.exit(1);
  }

  const allRecipeIds = new Set();
  const slotsByRow = [];
  (rows || []).forEach((row) => {
    const meals = row.meals || {};
    const slots = [];
    MEAL_KEYS.forEach((key) => {
      const slot = meals[key];
      if (slot?.recipe_id && isUUID(slot.recipe_id)) {
        allRecipeIds.add(slot.recipe_id);
        slots.push({ key, recipe_id: slot.recipe_id, title: slot.title, plan_source: slot.plan_source });
      }
    });
    slotsByRow.push({ id: row.id, user_id: row.user_id, member_id: row.member_id, planned_date: row.planned_date, meals: { ...meals }, slots });
  });

  if (allRecipeIds.size === 0) {
    console.log("Нет слотов с UUID recipe_id за период. Выход.");
    return;
  }

  const { data: existingRecipes } = await supabase.from("recipes").select("id").in("id", [...allRecipeIds]);
  const existingSet = new Set((existingRecipes || []).map((r) => r.id));

  const toRepair = [];
  slotsByRow.forEach(({ id, user_id, member_id, planned_date, meals, slots }) => {
    slots.forEach(({ key, recipe_id, title }) => {
      if (!existingSet.has(recipe_id)) {
        toRepair.push({
          rowId: id,
          user_id,
          member_id,
          planned_date,
          mealKey: key,
          recipe_id,
          title: title ?? null,
        });
      }
    });
  });

  console.log("Период: с", startDate, ", строк загружено:", (rows || []).length);
  console.log("Уникальных recipe_id в слотах:", allRecipeIds.size);
  console.log("Слотов с битым recipe_id (не в public.recipes):", toRepair.length);
  if (toRepair.length > 0) {
    const byId = new Set(toRepair.map((r) => r.recipe_id));
    console.log("Битые recipe_id:", [...byId]);
    console.log("Затронуты (day_key / member_id):", [...new Set(toRepair.map((r) => `${r.planned_date} / ${r.member_id ?? "null"}`))]);
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] Реальный апдейт не выполнялся. Запустите с --apply для применения.");
    return;
  }

  if (toRepair.length === 0) {
    console.log("\nНечего исправлять.");
    return;
  }

  const byRowId = new Map();
  toRepair.forEach((r) => {
    if (!byRowId.has(r.rowId)) byRowId.set(r.rowId, { rowId: r.rowId, meals: null, repairs: [] });
    byRowId.get(r.rowId).repairs.push(r);
  });

  let updated = 0;
  let errCount = 0;
  for (const [rowId, entry] of byRowId) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) continue;
    const meals = { ...(row.meals || {}) };
    entry.repairs.forEach(({ mealKey, title }) => {
      if (meals[mealKey]) {
        meals[mealKey] = {
          recipe_id: null,
          title: null,
          broken_title: title ?? undefined,
          plan_source: "broken",
        };
      }
    });
    const { error: updateErr } = await supabase.from("meal_plans_v2").update({ meals }).eq("id", rowId);
    if (updateErr) {
      console.error("Update error for row", rowId, updateErr.message);
      errCount++;
    } else {
      updated++;
    }
  }

  console.log("\n--- Summary ---");
  console.log("Строк обновлено:", updated);
  if (errCount > 0) console.log("Ошибок:", errCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
