/**
 * Диагностика: откуда берутся recipe_id в meal_plans_v2 и где они находятся.
 * Берёт последние строки из meal_plans_v2, извлекает recipe_id из meals jsonb,
 * ищет каждый id в public.recipes (и при необходимости в других таблицах).
 *
 * Запуск (из корня проекта, нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env):
 *   node scripts/debug-recipe-id-lookup.mjs
 * Опционально: USER_ID=uuid node scripts/debug-recipe-id-lookup.mjs  — только планы этого пользователя.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUUID(s) {
  return typeof s === "string" && UUID_REGEX.test(s);
}

async function main() {
  const filterUserId = process.env.USER_ID || null;
  let q = supabase
    .from("meal_plans_v2")
    .select("id, user_id, member_id, planned_date, meals")
    .order("planned_date", { ascending: false })
    .limit(50);
  if (filterUserId) q = q.eq("user_id", filterUserId);

  const { data: rows, error } = await q;
  if (error) {
    console.error("meal_plans_v2 error:", error.message);
    process.exit(1);
  }

  const recipeIds = new Set();
  (rows || []).forEach((row) => {
    const meals = row.meals || {};
    MEAL_KEYS.forEach((key) => {
      const slot = meals[key];
      if (slot?.recipe_id && isUUID(slot.recipe_id)) recipeIds.add(slot.recipe_id);
    });
  });

  const ids = [...recipeIds];
  console.log("meal_plans_v2: строк загружено:", (rows || []).length);
  console.log("Уникальных recipe_id (UUID) из meals:", ids.length);
  if (ids.length === 0) {
    console.log("Нет UUID в слотах. Выход.");
    return;
  }

  const { data: recipesRows } = await supabase.from("recipes").select("id, title, meal_type, source").in("id", ids);
  const inRecipesMap = new Map((recipesRows || []).map((r) => [r.id, r]));

  const report = ids.map((id) => ({
    recipe_id: id,
    found: {
      public_recipes: inRecipesMap.has(id)
        ? { id: inRecipesMap.get(id).id, title: inRecipesMap.get(id).title, meal_type: inRecipesMap.get(id).meal_type, source: inRecipesMap.get(id).source }
        : null,
    },
  }));

  const inPublic = report.filter((r) => r.found.public_recipes != null).length;
  const notFound = report.filter((r) => r.found.public_recipes == null);

  console.log("\n--- Итог ---");
  console.log("Найдено в public.recipes:", inPublic, "из", ids.length);
  console.log("Не найдено нигде (ожидаемо только public.recipes):", notFound.length);

  if (notFound.length > 0) {
    console.log("\n--- recipe_id, которых НЕТ в public.recipes (первые 20) ---");
    notFound.slice(0, 20).forEach((r) => console.log(r.recipe_id));
  }

  const withNullMealType = report.filter((r) => r.found.public_recipes != null && r.found.public_recipes.meal_type == null);
  if (withNullMealType.length > 0) {
    console.log("\n--- В public.recipes, но meal_type = NULL (первые 10) ---");
    withNullMealType.slice(0, 10).forEach((r) => console.log(r.recipe_id, r.found.public_recipes?.title));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
