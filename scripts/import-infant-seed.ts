/**
 * Импорт infant seed из JSON в Supabase (service role).
 * Идемпотентность: поиск существующей строки по
 * (user_id, source=seed, locale, norm_title, min_age_months, max_age_months, meal_type),
 * затем UPDATE + замена ингредиентов/шагов или INSERT.
 *
 * Канон: если в JSON нет валидного canonical_*, вычисляется из amount/unit или display_text
 * (`shared/ingredientCanonicalResolve.ts`), по тем же правилам, что ingredient_canonical в БД.
 *
 * Переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INFANT_SEED_CATALOG_USER_ID
 * Флаги: --dry-run, --purge, --purge-only, --file=...
 *
 * Запуск: npm run seed:infant:import (tsx)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { fillCanonicalForSeedIngredient } from "../shared/ingredientCanonicalResolve.ts";

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
      const value =
        raw.startsWith('"') && raw.endsWith('"')
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertSupabaseServiceRoleKey(key: string) {
  const payload = decodeJwtPayload(key);
  if (!payload) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY не похож на JWT. Нужен ключ service_role из Supabase Dashboard → Settings → API (секретный), не anon и не VITE_SUPABASE_ANON_KEY.",
    );
    process.exit(1);
  }
  const role = payload.role;
  if (role !== "service_role") {
    console.error(
      `В JWT указано role="${role ?? "нет"}". Для импорта нужен именно service_role (обходит RLS).`,
    );
    process.exit(1);
  }
}

function resolveJsonPath(): string {
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

function inferIngredientCategory(name: string | undefined | null): string {
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

function normTitle(title: unknown): string {
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
  process.env.SEED_CATALOG_BATCH_TAG || process.env.INFANT_SEED_BATCH_TAG || "infant_curated_v2";

let bundle: { recipes?: unknown[]; batchTag?: string } | null = null;
let recipes: unknown[] = [];
let batchTag = defaultBatchTag;

if (!purgeOnly) {
  if (!existsSync(jsonPath)) {
    console.error("Нет файла", jsonPath);
    process.exit(1);
  }
  bundle = JSON.parse(readFileSync(jsonPath, "utf8")) as { recipes?: unknown[]; batchTag?: string };
  recipes = bundle.recipes ?? [];
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

type RecipeJson = {
  title: string;
  min_age_months?: number;
  max_age_months?: number;
  meal_type?: string | null;
  description?: string;
  chef_advice?: string;
  cooking_time_minutes?: number;
  tags?: string[];
  nutrition_goals?: string[];
  is_soup?: boolean;
  servings_base?: number;
  servings_recommended?: number;
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  ingredients?: Array<Record<string, unknown>>;
  /** Как в buildInfantSeedRecipes: строки или `{ step_number?, instruction }` */
  steps?: Array<string | { step_number?: number; instruction?: string }>;
};

function normalizeSeedStep(raw: string | { step_number?: number; instruction?: string }, index: number): {
  step_number: number;
  instruction: string;
} {
  if (typeof raw === "string") {
    return { step_number: index + 1, instruction: raw.trim() };
  }
  return {
    step_number: raw.step_number ?? index + 1,
    instruction: String(raw.instruction ?? "").trim(),
  };
}

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

async function findExistingRecipeId(r: RecipeJson): Promise<string | null> {
  const nt = normTitle(r.title);
  let q = supabase
    .from("recipes")
    .select("id")
    .eq("user_id", CATALOG_USER_ID)
    .eq("source", "seed")
    .eq("locale", "ru")
    .eq("norm_title", nt)
    .eq("min_age_months", r.min_age_months ?? 6)
    .eq("max_age_months", r.max_age_months ?? 11);
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

function buildRecipeRow(r: RecipeJson, id: string) {
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
    trust_level: "core",
    calories: r.calories ?? null,
    proteins: r.proteins ?? null,
    fats: r.fats ?? null,
    carbs: r.carbs ?? null,
    steps: [],
    child_id: null,
    member_id: null,
  };
}

async function replaceIngredientsAndSteps(recipeId: string, r: RecipeJson) {
  const { error: di } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
  if (di) return { ok: false as const, error: di, phase: "delete_ingredients" };

  const { error: ds } = await supabase.from("recipe_steps").delete().eq("recipe_id", recipeId);
  if (ds) return { ok: false as const, error: ds, phase: "delete_steps" };

  const ingredients = (r.ingredients ?? []).map((ing, i) => {
    const name = typeof ing.name === "string" ? ing.name : "";
    const displayText = typeof ing.display_text === "string" && ing.display_text.trim() ? ing.display_text : name;
    const canon = fillCanonicalForSeedIngredient({
      name,
      amount: ing.amount ?? null,
      unit: typeof ing.unit === "string" ? ing.unit : null,
      display_text: displayText,
      canonical_amount: typeof ing.canonical_amount === "number" ? ing.canonical_amount : null,
      canonical_unit: typeof ing.canonical_unit === "string" ? ing.canonical_unit : null,
    });
    return {
      recipe_id: recipeId,
      name,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      display_text: displayText,
      canonical_amount: canon.canonical_amount,
      canonical_unit: canon.canonical_unit,
      order_index: (ing.order_index as number) ?? i,
      category: (ing.category as string) ?? inferIngredientCategory(name),
    };
  });

  const { error: ie } = await supabase.from("recipe_ingredients").insert(ingredients);
  if (ie) return { ok: false as const, error: ie, phase: "insert_ingredients" };

  const rawSteps = r.steps ?? [];
  const steps = rawSteps.map((s, i) => {
    const n = normalizeSeedStep(s, i);
    return {
      recipe_id: recipeId,
      step_number: n.step_number,
      instruction: n.instruction,
    };
  });

  const { error: se } = await supabase.from("recipe_steps").insert(steps);
  if (se) return { ok: false as const, error: se, phase: "insert_steps" };

  return { ok: true as const };
}

async function upsertOne(r: RecipeJson) {
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
    if (ue) return { ok: false as const, error: ue, title: r.title, mode: "update" as const };
  } else {
    const { error: ie } = await supabase.from("recipes").insert(row);
    if (ie) return { ok: false as const, error: ie, title: r.title, mode: "insert" as const };
  }

  const child = await replaceIngredientsAndSteps(id, r);
  if (!child.ok) {
    return { ok: false as const, error: child.error, title: r.title, recipeId: id, phase: child.phase };
  }

  return { ok: true as const, id, mode: existingId ? ("updated" as const) : ("inserted" as const) };
}

async function main() {
  if (purgeOnly) {
    console.log(`purge-only: user_id=${CATALOG_USER_ID}, batchTag=${batchTag}`);
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
  const failures: unknown[] = [];
  for (const r of recipes as RecipeJson[]) {
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
