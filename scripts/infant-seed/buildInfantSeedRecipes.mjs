/**
 * Сборка curated infant seed из JSON в data/infant-seed/ (source of truth).
 * Нормализует шаги (строки → { step_number, instruction }), добавляет batch-тег,
 * валидирует перед записью в data/infant-seed-recipes.json.
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const INFANT_SEED_BATCH_TAG = "infant_curated_v2";

const MEALS = ["breakfast", "lunch", "snack", "dinner"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const path46 = join(root, "data", "infant-seed", "infant_4_6_months_stage1.json");
const path78 = join(root, "data", "infant-seed", "infant_7_8_months_stage2.json");
const path911 = join(root, "data", "infant-seed", "infant_9_11_months_stage3.json");

function loadBundle(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Отсутствует файл ${label}: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("steps: нужен непустой массив");
  }
  return steps.map((s, i) => {
    if (typeof s === "string") {
      const instruction = s.trim();
      if (!instruction) throw new Error(`Пустой шаг #${i + 1}`);
      return { step_number: i + 1, instruction };
    }
    const instruction = String(s.instruction ?? "").trim();
    if (!instruction) throw new Error(`Пустой шаг #${i + 1}`);
    return {
      step_number: s.step_number ?? i + 1,
      instruction,
    };
  });
}

function normalizeIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error("ingredients: нужен непустой массив");
  }
  return ingredients.map((ing, i) => {
    const name = String(ing.name ?? "").trim();
    if (!name) throw new Error(`Ингредиент #${i + 1}: пустое name`);
    return {
      name,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      display_text: String(ing.display_text ?? ing.name).trim() || name,
      canonical_amount: ing.canonical_amount ?? null,
      canonical_unit: ing.canonical_unit ?? null,
      order_index: ing.order_index ?? i,
      category: ing.category ?? null,
    };
  });
}

function validateOne(r, ctx) {
  const title = String(r.title ?? "").trim();
  if (!title) throw new Error(`${ctx}: пустой title`);
  const description = String(r.description ?? "").trim();
  if (!description) throw new Error(`${ctx}: пустое description (${title})`);
  const chef = String(r.chef_advice ?? "").trim();
  if (!chef) throw new Error(`${ctx}: пустое chef_advice (${title})`);

  const mt = r.meal_type;
  if (!MEALS.includes(mt)) {
    throw new Error(`${ctx}: неверный meal_type "${mt}" (${title})`);
  }
  const min = Number(r.min_age_months);
  const max = Number(r.max_age_months);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`${ctx}: min/max_age_months (${title})`);
  }
  if (min > max) {
    throw new Error(`${ctx}: min_age_months > max_age_months (${title})`);
  }
  if (!Array.isArray(r.nutrition_goals)) {
    throw new Error(`${ctx}: nutrition_goals должен быть массивом (${title})`);
  }
}

function mergeTags(tags, seedSet) {
  const t = Array.isArray(tags) ? [...tags] : [];
  if (!t.includes("infant")) t.unshift("infant");
  if (!t.includes(INFANT_SEED_BATCH_TAG)) t.push(INFANT_SEED_BATCH_TAG);
  if (seedSet && !t.includes(seedSet)) t.push(seedSet);
  return t;
}

export function buildInfantSeedRecipes() {
  const b46 = loadBundle(path46, "4–6 мес");
  const b78 = loadBundle(path78, "7–8 мес");
  const b911 = loadBundle(path911, "9–11 мес");

  const out = [];

  for (const bundle of [b46, b78, b911]) {
    const seedSet = bundle.seedSet ?? "unknown";
    const recipes = bundle.recipes ?? [];
    for (let idx = 0; idx < recipes.length; idx++) {
      const raw = recipes[idx];
      const ctx = `${seedSet}[${idx}]`;
      validateOne(raw, ctx);

      const steps = normalizeSteps(raw.steps);
      const ingredients = normalizeIngredients(raw.ingredients);

      out.push({
        title: String(raw.title).trim(),
        description: String(raw.description).trim(),
        chef_advice: String(raw.chef_advice).trim(),
        meal_type: raw.meal_type,
        cooking_time_minutes: Number(raw.cooking_time_minutes) || 15,
        min_age_months: Number(raw.min_age_months),
        max_age_months: Number(raw.max_age_months),
        calories: raw.calories ?? null,
        proteins: raw.proteins ?? null,
        fats: raw.fats ?? null,
        carbs: raw.carbs ?? null,
        tags: mergeTags(raw.tags, seedSet),
        nutrition_goals: Array.isArray(raw.nutrition_goals) ? raw.nutrition_goals : [],
        servings_base: raw.servings_base ?? 1,
        servings_recommended: raw.servings_recommended ?? 1,
        is_soup: Boolean(raw.is_soup),
        ingredients,
        steps,
      });
    }
  }

  /** Дубликаты title в рамках одной возрастной полосы */
  const seen = new Map();
  for (const r of out) {
    const k = `${r.min_age_months}-${r.max_age_months}|${r.title}`;
    if (seen.has(k)) {
      throw new Error(`Дубликат title в наборе: "${r.title}" (${k})`);
    }
    seen.set(k, true);
  }

  return out;
}

export function summarizeByField(recipes, field) {
  const m = new Map();
  for (const r of recipes) {
    const k = String(r[field]);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export { MEALS };
