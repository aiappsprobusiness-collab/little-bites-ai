/**
 * Нормализация и валидация curated seed для импорта в recipes.
 * Исходник: один .txt с несколькими подряд JSON-объектами { seedSet, recipes: [...] }.
 * Профили: toddler, child_37_96, child_97_216; adult_216_1200 — отдельный вход (массивы JSON).
 */

import { parseMultiJsonObjects, parseMultiJsonTopLevelArrays } from "./parseMultiJsonObjects.mjs";
import { normalizeNutritionGoalsForDb } from "./nutritionGoalsDb.mjs";

export const TODDLER_CATALOG_BATCH_TAG = "toddler_curated_v1";
export const CHILD_37_96_CATALOG_BATCH_TAG = "child_37_96_curated_v1";
export const CHILD_97_216_CATALOG_BATCH_TAG = "child_97_216_curated_v1";
export const ADULT_216_1200_CATALOG_BATCH_TAG = "adult_216_1200_curated_v1";

/** @typedef {{ minMin: number; maxMax: number; batchTag: string; roleTag: string; seedSetTagPrefix: string }} CatalogProfile */

/** @type {Record<string, CatalogProfile>} */
export const CATALOG_PROFILES = {
  toddler: {
    minMin: 12,
    maxMax: 36,
    batchTag: TODDLER_CATALOG_BATCH_TAG,
    roleTag: "toddler",
    seedSetTagPrefix: "toddler_12_36_months_",
  },
  child_37_96: {
    minMin: 37,
    maxMax: 96,
    batchTag: CHILD_37_96_CATALOG_BATCH_TAG,
    roleTag: "child",
    seedSetTagPrefix: "child_37_96_months_",
  },
  child_97_216: {
    minMin: 97,
    maxMax: 216,
    batchTag: CHILD_97_216_CATALOG_BATCH_TAG,
    roleTag: "child",
    seedSetTagPrefix: "child_97_216_months_",
  },
  adult_216_1200: {
    minMin: 216,
    maxMax: 1200,
    batchTag: ADULT_216_1200_CATALOG_BATCH_TAG,
    roleTag: "adult",
    seedSetTagPrefix: "adult_216_1200_months_",
  },
};

const MEALS = ["breakfast", "lunch", "snack", "dinner"];

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

/** Взрослый снапшот: amount часто строка «50 г». */
function normalizeAdultIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error("ingredients: нужен непустой массив");
  }
  return ingredients.map((ing, i) => {
    const name = String(ing.name ?? "").trim();
    if (!name) throw new Error(`Ингредиент #${i + 1}: пустое name`);
    const amtRaw = ing.amount;
    if (typeof amtRaw === "string" && amtRaw.trim()) {
      const line = `${name} — ${amtRaw.trim()}`;
      return {
        name,
        amount: null,
        unit: null,
        display_text: String(ing.display_text ?? line).trim() || line,
        canonical_amount: ing.canonical_amount ?? null,
        canonical_unit: ing.canonical_unit ?? null,
        order_index: ing.order_index ?? i,
        category: ing.category ?? null,
      };
    }
    return {
      name,
      amount: amtRaw ?? null,
      unit: ing.unit ?? null,
      display_text: String(ing.display_text ?? name).trim() || name,
      canonical_amount: ing.canonical_amount ?? null,
      canonical_unit: ing.canonical_unit ?? null,
      order_index: ing.order_index ?? i,
      category: ing.category ?? null,
    };
  });
}

const SOUP_TITLE_TOKENS = ["суп", "борщ", "щи", "солянк", "рассольник", "окрошк", "гаспачо", "бульон"];

function inferAdultIsSoup(mealType, title) {
  if (mealType !== "lunch") return false;
  const t = String(title ?? "").toLowerCase();
  return SOUP_TITLE_TOKENS.some((x) => t.includes(x));
}

/**
 * @param {CatalogProfile} profile
 */
function validateOne(r, ctx, profile) {
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
  if (min < profile.minMin || max > profile.maxMax) {
    throw new Error(
      `${ctx}: ожидается диапазон ${profile.minMin}–${profile.maxMax} мес (${title}: ${min}–${max})`
    );
  }
  if (!Array.isArray(r.nutrition_goals)) {
    throw new Error(`${ctx}: nutrition_goals должен быть массивом (${title})`);
  }
}

/**
 * @param {CatalogProfile} profile
 */
function mergeTags(tags, seedSet, profile) {
  const t = Array.isArray(tags) ? [...tags] : [];
  if (!t.includes(profile.roleTag)) t.unshift(profile.roleTag);
  if (!t.includes(profile.batchTag)) t.push(profile.batchTag);
  if (seedSet && !t.includes(seedSet)) t.push(seedSet);
  return t;
}

/**
 * @param {string} fileContent
 * @param {keyof typeof CATALOG_PROFILES} catalogKind
 */
export function buildCuratedSeedCatalogFromFileContent(fileContent, catalogKind) {
  const profile = CATALOG_PROFILES[catalogKind];
  if (!profile) {
    throw new Error(`Неизвестный catalogKind: ${catalogKind}`);
  }

  const bundles = parseMultiJsonObjects(fileContent);
  if (bundles.length === 0) throw new Error("В файле нет JSON-объектов");

  const out = [];

  for (const bundle of bundles) {
    const seedSet = bundle.seedSet ?? "unknown";
    const recipes = bundle.recipes ?? [];
    for (let idx = 0; idx < recipes.length; idx++) {
      const raw = recipes[idx];
      const ctx = `${seedSet}[${idx}]`;
      validateOne(raw, ctx, profile);

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
        tags: mergeTags(raw.tags, seedSet, profile),
        nutrition_goals: normalizeNutritionGoalsForDb(raw.nutrition_goals),
        servings_base: raw.servings_base ?? 1,
        servings_recommended: raw.servings_recommended ?? 1,
        is_soup: Boolean(raw.is_soup),
        ingredients,
        steps,
      });
    }
  }

  const seen = new Map();
  for (const r of out) {
    const k = `${r.min_age_months}-${r.max_age_months}|${r.meal_type}|${r.title}`;
    if (seen.has(k)) {
      throw new Error(`Дубликат в наборе: "${r.title}" (${k})`);
    }
    seen.set(k, true);
  }

  return out;
}

/** @param {string} fileContent */
export function buildToddlerCatalogFromFileContent(fileContent) {
  return buildCuratedSeedCatalogFromFileContent(fileContent, "toddler");
}

/** @param {string} fileContent */
export function buildChild3796CatalogFromFileContent(fileContent) {
  return buildCuratedSeedCatalogFromFileContent(fileContent, "child_37_96");
}

/** @param {string} fileContent */
export function buildChild97216CatalogFromFileContent(fileContent) {
  return buildCuratedSeedCatalogFromFileContent(fileContent, "child_97_216");
}

/**
 * Взрослый каталог: файл из нескольких JSON-массивов рецептов (без обёртки seedSet).
 * Тег батча: adult_216_1200_months_{meal_type}_stage1.
 */
export function buildAdult2161200CatalogFromFileContent(fileContent) {
  const profile = CATALOG_PROFILES.adult_216_1200;
  const arrays = parseMultiJsonTopLevelArrays(fileContent);
  if (arrays.length === 0) throw new Error("В файле нет JSON-массивов");

  const out = [];
  for (let bi = 0; bi < arrays.length; bi++) {
    const arr = arrays[bi];
    if (!Array.isArray(arr)) {
      throw new Error(`Блок ${bi}: ожидался массив рецептов`);
    }
    for (let idx = 0; idx < arr.length; idx++) {
      const rawIn = arr[idx];
      const raw = {
        ...rawIn,
        nutrition_goals: Array.isArray(rawIn.nutrition_goals) ? rawIn.nutrition_goals : [],
      };
      const ctx = `array[${bi}][${idx}]`;
      validateOne(raw, ctx, profile);
      const mt = raw.meal_type;
      const seedSet = `adult_216_1200_months_${mt}_stage1`;
      const steps = normalizeSteps(raw.steps);
      const ingredients = normalizeAdultIngredients(raw.ingredients);
      const nut = raw.nutrition && typeof raw.nutrition === "object" ? raw.nutrition : {};

      out.push({
        title: String(raw.title).trim(),
        description: String(raw.description).trim(),
        chef_advice: String(raw.chef_advice).trim(),
        meal_type: mt,
        cooking_time_minutes: Number(raw.cooking_time_minutes) || 15,
        min_age_months: Number(raw.min_age_months),
        max_age_months: Number(raw.max_age_months),
        calories: raw.calories ?? nut.kcal_per_serving ?? null,
        proteins: raw.proteins ?? nut.protein ?? null,
        fats: raw.fats ?? nut.fat ?? null,
        carbs: raw.carbs ?? nut.carbs ?? null,
        tags: mergeTags(raw.tags, seedSet, profile),
        nutrition_goals: normalizeNutritionGoalsForDb(raw.nutrition_goals),
        servings_base: raw.servings_base ?? 1,
        servings_recommended: raw.servings_recommended ?? 1,
        is_soup: Boolean(raw.is_soup) || inferAdultIsSoup(mt, raw.title),
        ingredients,
        steps,
      });
    }
  }

  const seen = new Map();
  for (const r of out) {
    const k = `${r.min_age_months}-${r.max_age_months}|${r.meal_type}|${r.title}`;
    if (seen.has(k)) {
      throw new Error(`Дубликат в наборе: "${r.title}" (${k})`);
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
