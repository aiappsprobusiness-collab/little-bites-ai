/**
 * Импорт infant seed из data/infant-seed-recipes.json в Supabase (service role).
 * Идемпотентность: поиск существующей строки по
 * (user_id, source=seed, locale, norm_title, min_age_months, max_age_months, meal_type),
 * затем UPDATE + замена ингредиентов/шагов или INSERT.
 *
 * Переменные окружения:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INFANT_SEED_CATALOG_USER_ID — uuid существующего пользователя auth.users (владелец строк пула)
 *
 * Флаги:
 *   --dry-run      только сводка, без записи
 *   --purge        перед вставкой удалить рецепты этого владельца с тегом batch из файла
 *   --purge-only   только удалить батч (по тегу), без чтения JSON и без вставки
 *
 * Опционально: SEED_CATALOG_BATCH_TAG или INFANT_SEED_BATCH_TAG — для --purge-only, если JSON не нужен.
 * Опционально: --file=относительный/абсолютный путь к bundle JSON; либо SEED_CATALOG_JSON (от корня репо или абсолютный).
 *
 * Запуск: node scripts/import-infant-seed.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, isAbsolute } from "path";
import { randomUUID } from "crypto";

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

const dryRun = process.argv.includes("--dry-run");
const purge = process.argv.includes("--purge");
const purgeOnly = process.argv.includes("--purge-only");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CATALOG_USER_ID = process.env.INFANT_SEED_CATALOG_USER_ID;

/** Расшифровка payload JWT без проверки подписи — только чтобы отловить anon/authenticated. */
function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function assertSupabaseServiceRoleKey(key) {
  const payload = decodeJwtPayload(key);
  if (!payload) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY не похож на JWT. Нужен ключ service_role из Supabase Dashboard → Settings → API (секретный), не anon и не VITE_SUPABASE_ANON_KEY."
    );
    process.exit(1);
  }
  const role = payload.role;
  if (role !== "service_role") {
    console.error(
      `В JWT указано role="${role ?? "нет"}". Для импорта нужен именно service_role (обходит RLS). Сейчас вставка проверяется как обычный клиент и падает на recipes_insert_own (user_id = auth.uid()).`
    );
    process.exit(1);
  }
}

function resolveJsonPath() {
  const arg = process.argv.find((a) => a.startsWith("--file="));
  if (arg) {
    const p = arg.slice("--file=".length);
    return isAbsolute(p) ? p : join(root, p);
  }
  const fromEnv = process.env.SEED_CATALOG_JSON;
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : join(root, fromEnv);
  return join(root, "data", "infant-seed-recipes.json");
}

const jsonPath = resolveJsonPath();

/** Грубое соответствие enum product_category для списка покупок */
function inferIngredientCategory(name) {
  const n = (name ?? "").toLowerCase();
  if (/вода|фильтр/.test(n)) return "other";
  if (/масло|оливк/.test(n)) return "fats";
  if (/молок|творог|сыр|кефир|йогурт|сметан|сливк/.test(n)) return "dairy";
  if (/куриц|индейк|яйц|фарш|мяс|говядин|свинин|баранин|телятин/.test(n)) return "meat";
  if (/рыб|треск|лосос|минтай|форел|судак/.test(n)) return "fish";
  if (/рис|греч|овся|пшен|киноа|кукуруз|семолин|круп|манк|лапш|мук|хлеб|макарон/.test(n)) return "grains";
  if (/яблок|груш|банан|абрикос|персик|слив|черник|ягод|фрукт/.test(n)) return "fruits";
  return "vegetables";
}

function normTitle(title) {
  return String(title ?? "")
    .trim()
    .toLowerCase();
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
assertSupabaseServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY);
if (!CATALOG_USER_ID) {
  console.error("Укажите INFANT_SEED_CATALOG_USER_ID (uuid пользователя-владельца сидов в auth.users).");
  process.exit(1);
}

const defaultBatchTag =
  process.env.SEED_CATALOG_BATCH_TAG ||
  process.env.INFANT_SEED_BATCH_TAG ||
  "infant_curated_v2";

let bundle = null;
let recipes = [];
let batchTag = defaultBatchTag;

if (!purgeOnly) {
  if (!existsSync(jsonPath)) {
    console.error("Нет файла", jsonPath);
    console.error(
      "Для infant: npm run seed:infant:json. Для toddler: npm run seed:toddler:json или --file=data/toddler-seed/toddler-catalog-recipes.json"
    );
    process.exit(1);
  }
  bundle = JSON.parse(readFileSync(jsonPath, "utf8"));
  recipes = bundle.recipes;
  batchTag = bundle.batchTag ?? defaultBatchTag;

  if (!Array.isArray(recipes) || recipes.length === 0) {
    console.error("В JSON нет массива recipes.");
    process.exit(1);
  }
} else {
  batchTag = defaultBatchTag;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function purgeBatch() {
  const { data: rows, error: selErr } = await supabase
    .from("recipes")
    .select("id")
    .eq("user_id", CATALOG_USER_ID)
    .contains("tags", [batchTag]);
  if (selErr) {
    console.error("purge select:", selErr);
    process.exit(1);
  }
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length === 0) {
    console.log("purge: нечего удалять");
    return;
  }
  const { error: delErr } = await supabase.from("recipes").delete().in("id", ids);
  if (delErr) {
    console.error("purge delete:", delErr);
    process.exit(1);
  }
  console.log(`purge: удалено рецептов: ${ids.length}`);
}

async function findExistingRecipeId(r) {
  const nt = normTitle(r.title);
  let q = supabase
    .from("recipes")
    .select("id")
    .eq("user_id", CATALOG_USER_ID)
    .eq("source", "seed")
    .eq("locale", "ru")
    .eq("norm_title", nt)
    .eq("min_age_months", r.min_age_months)
    .eq("max_age_months", r.max_age_months);
  if (r.meal_type != null && r.meal_type !== "") {
    q = q.eq("meal_type", r.meal_type);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("findExistingRecipeId:", error);
    return null;
  }
  return data?.id ?? null;
}

function buildRecipeRow(r, id) {
  const nutrition_goals = Array.isArray(r.nutrition_goals) ? r.nutrition_goals : [];
  const tags = Array.isArray(r.tags) ? r.tags : [];
  const ctm = Number(r.cooking_time_minutes) || 15;
  return {
    id,
    user_id: CATALOG_USER_ID,
    title: r.title,
    description: r.description ?? "",
    chef_advice: r.chef_advice ?? "",
    cooking_time_minutes: ctm,
    cooking_time: ctm,
    min_age_months: r.min_age_months ?? 6,
    max_age_months: r.max_age_months ?? 11,
    source: "seed",
    meal_type: r.meal_type,
    tags,
    nutrition_goals,
    is_soup: Boolean(r.is_soup),
    servings_base: r.servings_base ?? 1,
    servings_recommended: r.servings_recommended ?? 1,
    locale: "ru",
    trust_level: "trusted",
    calories: r.calories ?? null,
    proteins: r.proteins ?? null,
    fats: r.fats ?? null,
    carbs: r.carbs ?? null,
    steps: [],
    child_id: null,
    member_id: null,
  };
}

async function replaceIngredientsAndSteps(recipeId, r) {
  const { error: di } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId);
  if (di) return { ok: false, error: di, phase: "delete_ingredients" };

  const { error: ds } = await supabase.from("recipe_steps").delete().eq("recipe_id", recipeId);
  if (ds) return { ok: false, error: ds, phase: "delete_steps" };

  const ingredients = (r.ingredients ?? []).map((ing, i) => ({
    recipe_id: recipeId,
    name: ing.name,
    amount: ing.amount ?? null,
    unit: ing.unit ?? null,
    display_text: ing.display_text ?? ing.name,
    canonical_amount: ing.canonical_amount ?? null,
    canonical_unit: ing.canonical_unit ?? null,
    order_index: ing.order_index ?? i,
    category: ing.category ?? inferIngredientCategory(ing.name),
  }));

  const { error: ie } = await supabase.from("recipe_ingredients").insert(ingredients);
  if (ie) return { ok: false, error: ie, phase: "insert_ingredients" };

  const steps = (r.steps ?? []).map((s, i) => ({
    recipe_id: recipeId,
    step_number: s.step_number ?? i + 1,
    instruction: s.instruction ?? "",
  }));

  const { error: se } = await supabase.from("recipe_steps").insert(steps);
  if (se) return { ok: false, error: se, phase: "insert_steps" };

  return { ok: true };
}

async function upsertOne(r) {
  const existingId = await findExistingRecipeId(r);
  const id = existingId ?? randomUUID();
  const row = buildRecipeRow(r, id);

  if (existingId) {
    const { error: ue } = await supabase
      .from("recipes")
      .update({
        title: row.title,
        description: row.description,
        chef_advice: row.chef_advice,
        cooking_time_minutes: row.cooking_time_minutes,
        cooking_time: row.cooking_time,
        min_age_months: row.min_age_months,
        max_age_months: row.max_age_months,
        meal_type: row.meal_type,
        tags: row.tags,
        nutrition_goals: row.nutrition_goals,
        is_soup: row.is_soup,
        servings_base: row.servings_base,
        servings_recommended: row.servings_recommended,
        trust_level: row.trust_level,
        calories: row.calories,
        proteins: row.proteins,
        fats: row.fats,
        carbs: row.carbs,
        locale: row.locale,
        steps: row.steps,
      })
      .eq("id", id);
    if (ue) return { ok: false, error: ue, title: r.title, mode: "update" };
  } else {
    const { error: ie } = await supabase.from("recipes").insert(row);
    if (ie) return { ok: false, error: ie, title: r.title, mode: "insert" };
  }

  const child = await replaceIngredientsAndSteps(id, r);
  if (!child.ok) {
    return { ok: false, error: child.error, title: r.title, recipeId: id, phase: child.phase };
  }

  return { ok: true, id, mode: existingId ? "updated" : "inserted" };
}

async function main() {
  if (purgeOnly) {
    console.log(
      `purge-only: user_id=${CATALOG_USER_ID}, batchTag=${batchTag}`
    );
    if (dryRun) {
      const { data: rows, error } = await supabase
        .from("recipes")
        .select("id")
        .eq("user_id", CATALOG_USER_ID)
        .contains("tags", [batchTag]);
      if (error) {
        console.error("dry-run select:", error);
        process.exit(1);
      }
      console.log(`--dry-run: будет удалено рецептов: ${(rows ?? []).length}`);
      return;
    }
    await purgeBatch();
    return;
  }

  console.log(`Файл: ${jsonPath}, рецептов: ${recipes.length}, batchTag: ${batchTag}`);
  if (dryRun) {
    console.log("--dry-run: вставка пропущена");
    return;
  }
  if (purge) await purgeBatch();

  let inserted = 0;
  let updated = 0;
  const failures = [];
  for (const r of recipes) {
    const res = await upsertOne(r);
    if (res.ok) {
      if (res.mode === "updated") updated += 1;
      else inserted += 1;
    } else failures.push(res);
  }
  console.log(`Готово: вставлено ${inserted}, обновлено ${updated}, ошибок ${failures.length}`);
  if (failures.length) {
    console.error("Первые ошибки:", failures.slice(0, 5));
    process.exit(1);
  }
}

main();
