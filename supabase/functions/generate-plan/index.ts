/**
 * Edge Function: fire-and-forget plan generation (day or week).
 * action=start: create job, return 202 + job_id. Client then calls action=run (fire-and-forget) and polls job.
 * action=run: run generation for job_id, update plan_generation_jobs and meal_plans_v2.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { safeError, safeLog, safeWarn } from "../_shared/safeLogger.ts";
import { canonicalizeRecipePayload } from "../_shared/recipeCanonical.ts";
import {
  ingredientHasQuantity,
  ingredientsHaveAmounts,
  normalizeIngredientsFallbackOnlySpices,
  buildIngredientPayloadItem,
  type IngredientForValidation,
} from "../_shared/planValidation.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;
type NormalizedMealType = (typeof MEAL_KEYS)[number];

const MEAL_TYPE_ALIASES: Record<string, NormalizedMealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  dinner: "dinner",
  "завтрак": "breakfast",
  "обед": "lunch",
  "полдник": "snack",
  "перекус": "snack",
  "ужин": "dinner",
  supper: "dinner",
  afternoon_snack: "snack",
};

/** Нормализация meal_type к enum breakfast | lunch | snack | dinner. RU/EN. */
function normalizeMealType(value: string | null | undefined): NormalizedMealType | null {
  if (value == null || typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  const found = MEAL_TYPE_ALIASES[key] ?? MEAL_TYPE_ALIASES[value.trim()];
  return found ?? null;
}

/** Токены «суп» для завтрака: не подставлять на breakfast. */
const SOUP_TITLE_TOKENS = ["суп", "борщ", "щи", "солянка", "soup"];
function isSoupLikeTitle(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return false;
  const t = title.toLowerCase();
  return SOUP_TITLE_TOKENS.some((tok) => t.includes(tok));
}

const SANITY_BREAKFAST_HEAVY = ["суп", "борщ", "щи", "солянка", "рагу", "плов", "карри", "нут", "тушен", "тушён", "рыба", "soup"];
const SANITY_LUNCH_BREAKFAST = ["сырник", "оладь", "запеканк", "каша", "гранола", "тост"];
const SANITY_DINNER_SNACK = ["йогурт", "творог", "дольки", "печенье", "батончик", "пюре", "смузи", "фрукты", "fruit"];
const SANITY_SNACK_MAIN = ["суп", "борщ", "рагу", "плов", "фарш", "котлет", "паста", "soup"];
const SANITY_SNACK_GRAIN = ["каша", "гречк", "рис", "пшён", "овсян", "rice", "oat"];
const SANITY_SNACK_BREAKFAST = ["запеканк", "олад", "сырник"];

/** [2] Sanity check: returns ok and which tokens hit. */
function slotSanityCheck(slotType: NormalizedMealType, text: string | null | undefined): { ok: boolean; hitTokens: string[] } {
  if (!text || typeof text !== "string") return { ok: true, hitTokens: [] };
  const t = text.toLowerCase();
  const hitTokens: string[] = [];
  if (slotType === "breakfast") {
    const h = SANITY_BREAKFAST_HEAVY.filter((tok) => t.includes(tok));
    if (h.length > 0) return { ok: false, hitTokens: h };
  }
  if (slotType === "lunch") {
    const h = SANITY_LUNCH_BREAKFAST.filter((tok) => t.includes(tok));
    if (h.length > 0) return { ok: false, hitTokens: h };
  }
  if (slotType === "dinner") {
    const h = SANITY_DINNER_SNACK.filter((tok) => t.includes(tok));
    if (h.length > 0) return { ok: false, hitTokens: h };
  }
  if (slotType === "snack") {
    const h1 = SANITY_SNACK_MAIN.filter((tok) => t.includes(tok));
    if (h1.length > 0) return { ok: false, hitTokens: h1 };
    const h2 = SANITY_SNACK_GRAIN.filter((tok) => t.includes(tok));
    if (h2.length > 0) return { ok: false, hitTokens: h2 };
    const h3 = SANITY_SNACK_BREAKFAST.filter((tok) => t.includes(tok));
    if (h3.length > 0) return { ok: false, hitTokens: h3 };
  }
  return { ok: true, hitTokens: [] };
}

/** [2] Жёсткие sanity rules по слотам. Возвращает причину reject или null если ок. */
function slotSanityReject(slotType: NormalizedMealType, text: string | null | undefined): string | null {
  const { ok } = slotSanityCheck(slotType, text);
  return ok ? null : "sanity_hit";
}

/** Legacy: причины блокировки (для логов). */
function getSanityBlockedReasons(title: string | null | undefined, normalizedSlot: NormalizedMealType): string[] {
  const { ok, hitTokens } = slotSanityCheck(normalizedSlot, title);
  return ok ? [] : hitTokens;
}

/** [C] Infer meal_type from title+description+ingredients (recovery when DB meal_type is NULL). */
const SOUP_TOKENS = ["СЃСѓРї", "Р±РѕСЂС‰", "С‰Рё", "СЃРѕР»СЏРЅРє", "soup"];
const BREAKFAST_TOKENS = ["РєР°С€Р°", "РѕРІСЃСЏРЅ", "РѕРјР»РµС‚", "Р±Р»РёРЅ", "РѕР»Р°Рґ", "СЃС‹СЂРЅРёРє", "Р·Р°РїРµРєР°РЅРє", "С‚РѕСЃС‚", "РіСЂР°РЅРѕР»Р°", "РјСЋСЃР»Рё"];
const SNACK_TOKENS = ["С„СЂСѓРєС‚", "СЏР±Р»РѕРє", "РіСЂСѓС€", "Р±Р°РЅР°РЅ", "СЏРіРѕРґС‹", "РѕСЂРµС…", "РїРµСЂРµРєСѓСЃ", "РїРµС‡РµРЅСЊРµ", "Р±Р°С‚РѕРЅС‡РёРє", "РїСЋСЂРµ", "СЃРјСѓР·Рё"];
const LUNCH_DINNER_TOKENS = ["СЃСѓРї", "Р±РѕСЂС‰", "С‰Рё", "СЃРѕР»СЏРЅРє", "СЂР°РіСѓ", "С‚СѓС€РµРЅ", "РєРѕС‚Р»РµС‚", "РїР»РѕРІ", "РїР°СЃС‚Р°", "С„Р°СЂС€", "Р·Р°РїРµС‡", "СЂС‹Р±Р°", "РјСЏСЃРѕ"];
function inferMealTypeFromTitle(
  title: string | null | undefined,
  description: string | null | undefined,
  ingredientsText?: string | null
): NormalizedMealType | null {
  const text = [title ?? "", description ?? "", ingredientsText ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return null;
  if (SOUP_TOKENS.some((t) => text.includes(t))) return "lunch";
  if (BREAKFAST_TOKENS.some((t) => text.includes(t))) return "breakfast";
  if (SNACK_TOKENS.some((t) => text.includes(t))) return "snack";
  if (LUNCH_DINNER_TOKENS.some((t) => text.includes(t))) return "dinner";
  return null;
}

/** Resolved meal_type for candidate: raw norm or inferred from title/ingredients. */
function getResolvedMealType(r: RecipeRowPool): { resolved: NormalizedMealType | null; wasInferred: boolean } {
  const rawNorm = normalizeMealType(r.meal_type);
  if (rawNorm != null) return { resolved: rawNorm, wasInferred: false };
  const ingredientsText = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
  const inferred = inferMealTypeFromTitle(r.title, r.description, ingredientsText);
  return { resolved: inferred, wasInferred: inferred != null };
}

function getTodayKey(): string {
  const t = new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
}

function getRolling7Dates(startKey: string): string[] {
  const [y, m, d] = startKey.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(start);
    d2.setDate(d2.getDate() + i);
    out.push(d2.getFullYear() + "-" + String(d2.getMonth() + 1).padStart(2, "0") + "-" + String(d2.getDate()).padStart(2, "0"));
  }
  return out;
}

function getDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayNames = ["Р’РѕСЃРєСЂРµСЃРµРЅСЊРµ", "РџРѕРЅРµРґРµР»СЊРЅРёРє", "Р’С‚РѕСЂРЅРёРє", "РЎСЂРµРґР°", "Р§РµС‚РІРµСЂРі", "РџСЏС‚РЅРёС†Р°", "РЎСѓР±Р±РѕС‚Р°"];
  return dayNames[date.getDay()];
}

type MealSlot = { recipe_id?: string; title?: string; plan_source?: "pool" | "ai"; replaced_from_recipe_id?: string };

/** РќРѕСЂРјР°Р»РёР·Р°С†РёСЏ meals: С‚РѕР»СЊРєРѕ СЃР»РѕС‚С‹ СЃ РІР°Р»РёРґРЅС‹Рј recipe_id, Р±РµР· null/undefined. */
function normalizeMealsForWrite(
  meals: Record<string, MealSlot | null | undefined>
): Record<string, MealSlot> {
  const out: Record<string, MealSlot> = {};
  for (const [key, slot] of Object.entries(meals)) {
    if (slot == null || typeof slot !== "object") continue;
    const s = slot as MealSlot & { recipeId?: string; id?: string };
    const rid = s.recipe_id ?? s.recipeId ?? s.id;
    if (!rid || typeof rid !== "string") continue;
    out[key] = { recipe_id: rid, title: slot.title ?? "Р РµС†РµРїС‚", plan_source: slot.plan_source, ...(slot.replaced_from_recipe_id && { replaced_from_recipe_id: slot.replaced_from_recipe_id }) };
  }
  return out;
}

/** Upsert meal_plans_v2: РѕРґРЅР° СЃС‚СЂРѕРєР° РЅР° (user_id, member_id, planned_date). Slot-wise merge, РЅРѕСЂРјР°Р»РёР·Р°С†РёСЏ. РљРѕРЅС‚СЂРѕР»СЊРЅС‹Р№ SELECT вЂ” С‚РѕР»СЊРєРѕ РїСЂРё runControlSelect. */
async function upsertMealPlanRow(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dayKey: string,
  meals: Record<string, MealSlot | null | undefined>,
  opts?: { runControlSelect?: boolean; debugPlan?: boolean }
): Promise<{ error?: string; id?: string; mergedEmpty?: boolean; keys?: string[] }> {
  const normalizedNew = normalizeMealsForWrite(meals);
  if (opts?.debugPlan) {
    const inputKeys = Object.keys(meals ?? {});
    const inputHasRecipeId: Record<string, boolean> = {};
    for (const k of inputKeys) {
      const slot = (meals ?? {})[k] as { recipe_id?: string; recipeId?: string; id?: string } | null | undefined;
      inputHasRecipeId[k] = !!(slot && (slot.recipe_id ?? slot.recipeId ?? slot.id));
    }
    safeLog("[MEALS WRITE]", {
      dayKey,
      memberId: memberId ?? "null",
      inputKeys,
      inputHasRecipeId,
      outputKeys: Object.keys(normalizedNew),
    });
  }
  let q = supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: existing } = await q.maybeSingle();
  const currentMeals = (existing as { meals?: Record<string, unknown> } | null)?.meals ?? {};
  const mergedMeals: Record<string, unknown> = { ...currentMeals };
  for (const [k, v] of Object.entries(normalizedNew)) mergedMeals[k] = v;
  const payload: { meals: Record<string, unknown> } = { meals: mergedMeals };

  if (existing?.id) {
    const { error: updateErr } = await supabase.from("meal_plans_v2").update(payload).eq("id", (existing as { id: string }).id);
    if (updateErr) return { error: updateErr.message };
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("meal_plans_v2")
      .insert({ user_id: userId, member_id: memberId, planned_date: dayKey, meals: mergedMeals })
      .select("id")
      .single();
    if (insertErr) {
      if (insertErr.code === "23505" || String(insertErr.message || "").includes("23505")) {
        let retryQ = supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey);
        if (memberId == null) retryQ = retryQ.is("member_id", null);
        else retryQ = retryQ.eq("member_id", memberId);
        const { data: retry } = await retryQ.maybeSingle();
        if (retry?.id) {
          const { error: updateErr } = await supabase.from("meal_plans_v2").update(payload).eq("id", (retry as { id: string }).id);
          if (updateErr) return { error: updateErr.message };
        }
      } else return { error: insertErr.message };
    }
  }

  const runControlSelect = opts?.runControlSelect === true;
  if (runControlSelect) {
    let controlQ = supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey);
    if (memberId == null) controlQ = controlQ.is("member_id", null);
    else controlQ = controlQ.eq("member_id", memberId);
    const { data: controlRow } = await controlQ.maybeSingle();
    const storedMeals = (controlRow as { meals?: Record<string, unknown> } | null)?.meals ?? {};
    const keys = Object.keys(storedMeals);
    const mergedEmpty = keys.length === 0;
    safeLog("[PLAN upsert]", { dayKey, memberId: memberId ?? "null", keys });
    return { id: (controlRow as { id: string } | null)?.id, keys, mergedEmpty };
  }
  const keys = Object.keys(mergedMeals);
  const mergedEmpty = !keys.some((k) => (mergedMeals[k] as { recipe_id?: string } | null)?.recipe_id);
  return { id: (existing as { id?: string } | null)?.id, keys, mergedEmpty };
}

function getPrevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

/** Р’РѕР·РІСЂР°С‰Р°РµС‚ РјР°СЃСЃРёРІ РєР»СЋС‡РµР№ РґР°С‚ Р·Р° N РґРЅРµР№ РґРѕ firstDayKey (РЅРµ РІРєР»СЋС‡Р°СЏ firstDayKey). */
function getLastNDaysKeys(firstDayKey: string, n: number): string[] {
  const [y, m, d] = firstDayKey.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - i);
    out.push(
      date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
    );
  }
  return out;
}

/** Р—Р°РіСЂСѓР¶Р°РµС‚ recipe_id Рё titleKeys РёР· meal_plans_v2 Р·Р° СѓРєР°Р·Р°РЅРЅС‹Рµ РґР°С‚С‹ (РґР»СЏ РєРѕРЅС‚РµРєСЃС‚Р° СЂР°Р·РЅРѕРѕР±СЂР°Р·РёСЏ). */
async function fetchRecipeAndTitleKeysFromPlans(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dateKeys: string[]
): Promise<{ recipeIds: string[]; titleKeys: string[] }> {
  if (dateKeys.length === 0) return { recipeIds: [], titleKeys: [] };
  let q = supabase
    .from("meal_plans_v2")
    .select("meals")
    .eq("user_id", userId)
    .in("planned_date", dateKeys);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: rows } = await q;
  const recipeIds: string[] = [];
  const titleKeys: string[] = [];
  for (const row of rows ?? []) {
    const meals = (row as { meals?: Record<string, { recipe_id?: string; title?: string }> }).meals ?? {};
    for (const k of MEAL_KEYS) {
      const slot = meals[k];
      if (slot?.recipe_id) recipeIds.push(slot.recipe_id);
      if (slot?.title) titleKeys.push(normalizeTitleKey(slot.title));
    }
  }
  return { recipeIds, titleKeys };
}

/** Р—Р°РіСЂСѓР¶Р°РµС‚ titleKeys РїРѕ mealType РёР· meal_plans_v2 (РґР»СЏ quality gate: РЅРµ РїРѕРІС‚РѕСЂСЏС‚СЊ Р±Р»СЋРґРѕ РїРѕ С‚РѕРјСѓ Р¶Рµ РїСЂРёС‘РјСѓ Р·Р° РїРѕСЃР»РµРґРЅРёРµ N РґРЅРµР№). */
async function fetchTitleKeysByMealTypeFromPlans(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dateKeys: string[]
): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const k of MEAL_KEYS) out[k] = new Set<string>();
  if (dateKeys.length === 0) return out;
  let q = supabase
    .from("meal_plans_v2")
    .select("meals")
    .eq("user_id", userId)
    .in("planned_date", dateKeys);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: rows } = await q;
  for (const row of rows ?? []) {
    const meals = (row as { meals?: Record<string, { title?: string }> }).meals ?? {};
    for (const k of MEAL_KEYS) {
      const title = meals[k]?.title;
      if (title) out[k].add(normalizeTitleKey(title));
    }
  }
  return out;
}

/** Р—Р°РіСЂСѓР¶Р°РµС‚ categoryKey РїРѕ mealType РёР· meal_plans_v2 (РїРѕ title; РґР»СЏ porridge cap Рё category_streak). */
async function fetchCategoriesByMealTypeFromPlans(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dateKeys: string[]
): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const k of MEAL_KEYS) out[k] = new Set<string>();
  if (dateKeys.length === 0) return out;
  let q = supabase
    .from("meal_plans_v2")
    .select("meals")
    .eq("user_id", userId)
    .in("planned_date", dateKeys);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: rows } = await q;
  for (const row of rows ?? []) {
    const meals = (row as { meals?: Record<string, { title?: string }> }).meals ?? {};
    for (const k of MEAL_KEYS) {
      const title = meals[k]?.title;
      if (title) out[k].add(inferDishCategoryKey(title, null, null));
    }
  }
  return out;
}

/** РљР»СЋС‡РµРІС‹Рµ РёРЅРіСЂРµРґРёРµРЅС‚С‹ РґР»СЏ СЂР°Р·РЅРѕРѕР±СЂР°Р·РёСЏ РІ СЂР°РјРєР°С… РґРЅСЏ (РѕРґРёРЅ РєР»СЋС‡ РЅР° СЂРµС†РµРїС‚). РџСЂРёРѕСЂРёС‚РµС‚: РїРµСЂРІС‹Р№ СЃРѕРІРїР°РІС€РёР№ С‚РѕРєРµРЅ. */
const MAIN_INGREDIENT_TOKENS: { token: string; key: string }[] = [
  { token: "С‚С‹РєРІ", key: "С‚С‹РєРІР°" },
  { token: "РєР°Р±Р°С‡РѕРє", key: "РєР°Р±Р°С‡РѕРє" },
  { token: "РєР°Р±Р°С‡Рє", key: "РєР°Р±Р°С‡РѕРє" },
  { token: "Р±Р°РєР»Р°Р¶Р°РЅ", key: "Р±Р°РєР»Р°Р¶Р°РЅ" },
  { token: "РєСѓСЂРёС†", key: "РєСѓСЂРёС†Р°" },
  { token: "РёРЅРґРµР№Рє", key: "РёРЅРґРµР№РєР°" },
  { token: "СЂС‹Р±", key: "СЂС‹Р±Р°" },
  { token: "Р»РѕСЃРѕСЃ", key: "Р»РѕСЃРѕСЃСЊ" },
  { token: "С‚СЂРµСЃРє", key: "С‚СЂРµСЃРєР°" },
  { token: "РіРѕРІСЏРґРёРЅ", key: "РіРѕРІСЏРґРёРЅР°" },
  { token: "СЃРІРёРЅРёРЅ", key: "СЃРІРёРЅРёРЅР°" },
  { token: "С„Р°СЂС€", key: "С„Р°СЂС€" },
  { token: "С‚РІРѕСЂРѕРі", key: "С‚РІРѕСЂРѕРі" },
  { token: "СЃС‹СЂРЅРёРє", key: "С‚РІРѕСЂРѕРі" },
  { token: "РЅСѓС‚", key: "РЅСѓС‚" },
  { token: "С‡РµС‡РµРІРёС†", key: "С‡РµС‡РµРІРёС†Р°" },
  { token: "С„Р°СЃРѕР»", key: "С„Р°СЃРѕР»СЊ" },
  { token: "СЂРёСЃ", key: "СЂРёСЃ" },
  { token: "РіСЂРµС‡Рє", key: "РіСЂРµС‡РєР°" },
  { token: "РѕРІСЃСЏРЅ", key: "РѕРІСЃСЏРЅРєР°" },
  { token: "РєР°СЂС‚РѕС„РµР»", key: "РєР°СЂС‚РѕС„РµР»СЊ" },
  { token: "РїСЋСЂРµ", key: "РєР°СЂС‚РѕС„РµР»СЊ" },
  { token: "РјРѕСЂРєРѕРІ", key: "РјРѕСЂРєРѕРІСЊ" },
  { token: "СЃРІРµРєР»", key: "СЃРІРµРєР»Р°" },
  { token: "РєР°РїСѓСЃС‚", key: "РєР°РїСѓСЃС‚Р°" },
  { token: "СЏР№С†", key: "СЏР№С†Р°" },
  { token: "РѕРјР»РµС‚", key: "СЏР№С†Р°" },
  { token: "РјРѕР»РѕРє", key: "РјРѕР»РѕРєРѕ" },
  { token: "Р№РѕРіСѓСЂС‚", key: "Р№РѕРіСѓСЂС‚" },
  { token: "СЃРјРµС‚Р°РЅ", key: "СЃРјРµС‚Р°РЅР°" },
  { token: "РјР°РєР°СЂРѕРЅ", key: "РјР°РєР°СЂРѕРЅС‹" },
  { token: "РїР°СЃС‚Р°", key: "РјР°РєР°СЂРѕРЅС‹" },
  { token: "СЃСѓРї", key: "СЃСѓРї" },
  { token: "Р±РѕСЂС‰", key: "Р±РѕСЂС‰" },
  { token: "СЂР°РіСѓ", key: "СЂР°РіСѓ" },
  { token: "РїР»РѕРІ", key: "РїР»РѕРІ" },
];

function inferMainIngredientKey(
  title: string | null | undefined,
  description?: string | null,
  ingredientsText?: string | null
): string | null {
  const text = [title ?? "", description ?? "", ingredientsText ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return null;
  for (const { token, key } of MAIN_INGREDIENT_TOKENS) {
    if (text.includes(token)) return key;
  }
  return null;
}

/** РљР°С‚РµРіРѕСЂРёСЏ Р±Р»СЋРґР° РґР»СЏ СЂР°Р·РЅРѕРѕР±СЂР°Р·РёСЏ РЅРµРґРµР»Рё (porridge cap, category_streak). РћРґРЅР° РЅР° СЂРµС†РµРїС‚ РїРѕ РїРµСЂРІРѕРјСѓ СЃРѕРІРїР°РґРµРЅРёСЋ. */
const DISH_CATEGORY_TOKENS: { token: string; key: string }[] = [
  { token: "РєР°С€Р°", key: "porridge" },
  { token: "РѕРІСЃСЏРЅ", key: "porridge" },
  { token: "РіСЂРµС‡РЅ", key: "porridge" },
  { token: "СЂРёСЃРѕРІ", key: "porridge" },
  { token: "РјР°РЅРЅ", key: "porridge" },
  { token: "РїС€С‘РЅ", key: "porridge" },
  { token: "РѕРјР»РµС‚", key: "eggs" },
  { token: "СЏР№С†", key: "eggs" },
  { token: "СЃРєСЂСЌРјР±Р»", key: "eggs" },
  { token: "РѕР»Р°РґСЊРё", key: "pancakes" },
  { token: "Р±Р»РёРЅС‹", key: "pancakes" },
  { token: "РїР°РЅРєРµР№РєРё", key: "pancakes" },
  { token: "С‚РІРѕСЂРѕРі", key: "cottage_cheese" },
  { token: "СЃС‹СЂРЅРёРєРё", key: "cottage_cheese" },
  { token: "СЃСѓРї", key: "soup" },
  { token: "Р±СѓР»СЊРѕРЅ", key: "soup" },
  { token: "С‰Рё", key: "soup" },
  { token: "Р±РѕСЂС‰", key: "soup" },
  { token: "СЂР°СЃСЃРѕР»СЊРЅРёРє", key: "soup" },
  { token: "РїР°СЃС‚Р°", key: "pasta" },
  { token: "РјР°РєР°СЂРѕРЅ", key: "pasta" },
  { token: "РїР»РѕРІ", key: "rice" },
  { token: "СЂРёСЃ ", key: "rice" },
  { token: "СЂР°РіСѓ", key: "stew" },
  { token: "С‚СѓС€РµРЅ", key: "stew" },
  { token: "СЃР°Р»Р°С‚", key: "salad" },
  { token: "Р±СѓС‚РµСЂ", key: "sandwich" },
  { token: "С‚РѕСЃС‚", key: "sandwich" },
  { token: "СЃСЌРЅРґРІРёС‡", key: "sandwich" },
  { token: "Р№РѕРіСѓСЂС‚", key: "yogurt_bowl" },
  { token: "РіСЂР°РЅРѕР»Р°", key: "yogurt_bowl" },
  { token: "Р±РѕСѓР»", key: "yogurt_bowl" },
];

function inferDishCategoryKey(
  title: string | null | undefined,
  description?: string | null,
  ingredientsText?: string | null
): string {
  const text = [title ?? "", description ?? "", ingredientsText ?? ""].join(" ").toLowerCase();
  if (!text.trim()) return "other";
  for (const { token, key } of DISH_CATEGORY_TOKENS) {
    if (text.includes(token)) return key;
  }
  return "other";
}

const MAX_PORRIDGE_PER_WEEK_BREAKFAST = 3;

const FETCH_TIMEOUT_MS = 28_000;
const FETCH_RETRY_BACKOFF_MS = 400;
const JOB_STALL_MS_WEEK = 5 * 60 * 1000; // 5 min
const JOB_STALL_MS_DAY = 2 * 60 * 1000; // 2 min

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const retries = opts?.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, FETCH_RETRY_BACKOFF_MS));
    }
  }
  throw lastErr;
}

function extractFirstJsonObject(str: string): string | null {
  const start = str.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

function extractChefAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.chefAdvice ?? obj.chef_advice ?? obj.chefAdviceText;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function extractAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.advice;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

/** РћРїРёСЃР°РЅРёРµ РґР»СЏ recipes.description: РёР· description/intro, РёРЅР°С‡Рµ РёР· chef_advice РёР»Рё РїРµСЂРІС‹С… С€Р°РіРѕРІ (РјР°РєСЃ 200 СЃРёРјРІРѕР»РѕРІ). */
function getDescriptionWithFallback(options: {
  description?: string | null;
  intro?: string | null;
  steps?: string[];
  chef_advice?: string | null;
}): string {
  const { description, intro, steps, chef_advice } = options;
  const primary =
    typeof description === "string" && description.trim()
      ? description.trim()
      : typeof intro === "string" && intro.trim()
        ? intro.trim()
        : "";
  if (primary.length > 0) return primary.slice(0, 200);
  if (typeof chef_advice === "string" && chef_advice.trim()) return chef_advice.trim().slice(0, 200);
  if (Array.isArray(steps) && steps.length > 0) {
    const first = steps
      .slice(0, 2)
      .map((s) => (typeof s === "string" ? s : ""))
      .filter(Boolean)
      .join(" ");
    if (first.trim()) return first.trim().slice(0, 200);
  }
  return "";
}

// вЂ”вЂ”вЂ” Pool-first: same logic as client recipePool вЂ”вЂ”вЂ”
function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = (haystack ?? "").toLowerCase();
  for (const t of tokens) {
    if (t.length >= 2 && h.includes(t)) return true;
  }
  return false;
}
type MemberDataPool = { allergies?: string[]; preferences?: string[]; age_months?: number };

/** [3] Р Р°СЃС€РёСЂРµРЅРЅС‹Рµ С‚РѕРєРµРЅС‹ РґР»СЏ Р°Р»Р»РµСЂРіРёРё РЅР° РјРѕР»РѕРєРѕ/Р»Р°РєС‚РѕР·Сѓ (RU + EN). РќРµ РІРєР»СЋС‡Р°С‚СЊ "РјР°СЃР»Рѕ" вЂ” Р±Р°РЅРёС‚ СЂР°СЃС‚РёС‚РµР»СЊРЅРѕРµ РјР°СЃР»Рѕ. */
const DAIRY_ALLERGY_TOKENS = [
  "РјРѕР»РѕРєРѕ", "РјРѕР»РѕС‡РЅС‹Р№", "СЃР»РёРІРєРё", "СЃРјРµС‚Р°РЅР°", "С‚РІРѕСЂРѕРі", "СЃС‹СЂ", "Р№РѕРіСѓСЂС‚", "РєРµС„РёСЂ", "СЂСЏР¶РµРЅРєР°", "РјРѕСЂРѕР¶РµРЅРѕРµ", "СЃРіСѓС‰РµРЅРєР°", "Р»Р°РєС‚РѕР·Р°", "РєР°Р·РµРёРЅ",
  "СЃР»РёРІРѕС‡РЅ", "СЃР»РёРІРѕС‡РЅРѕРµ РјР°СЃР»Рѕ",
  "milk", "dairy", "cream", "sour cream", "curd", "cheese", "yogurt", "kefir", "butter", "ghee", "lactose", "casein",
];

function getAllergyTokens(memberData: MemberDataPool | null | undefined): string[] {
  if (!memberData?.allergies?.length) return [];
  const tokens = new Set<string>();
  const rawLower = memberData.allergies.map((a) => String(a).toLowerCase()).join(" ");
  const isMilkAllergy = /РјРѕР»РѕРє|milk|Р»Р°РєС‚РѕР·|lactose|dairy|РєР°Р·РµРёРЅ|casein/.test(rawLower);
  for (const a of memberData.allergies) {
    for (const t of tokenize(String(a))) {
      if (t.length >= 2) tokens.add(t);
    }
  }
  if (isMilkAllergy) {
    for (const t of DAIRY_ALLERGY_TOKENS) tokens.add(t);
  }
  return [...tokens];
}
function getPreferenceExcludeTokens(memberData: MemberDataPool | null | undefined): string[] {
  const prefs = memberData?.preferences;
  if (!prefs?.length) return [];
  const str = prefs.join(" ");
  const tokens = new Set<string>();
  const re1 = /РЅРµ\s+Р»СЋР±РёС‚\s+([^\.,;!?]+)/gi;
  const re2 = /Р±РµР·\s+([^\.,;!?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  while ((m = re2.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  return [...tokens];
}
const AGE_RESTRICTED_TOKENS = ["РѕСЃС‚СЂ", "РєРѕС„Рµ", "РіСЂРёР±"];
type RecipeRowPool = {
  id: string; title: string; tags: string[] | null; description: string | null; meal_type?: string | null;
  source?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
  recipe_steps?: Array<{ instruction?: string }> | null;
};
/** [4] Infer protein key from title+description+ingredients for diversity. Never returns null (falls back to veg). */
/** Priority on conflict: fish > chicken > beef_pork > legumes > dairy > egg > veg */
type ProteinKey = "fish" | "chicken" | "beef_pork" | "legumes" | "dairy" | "egg" | "veg";
function inferProteinKey(
  title: string | null | undefined,
  description: string | null | undefined,
  ingredientsText?: string | null
): ProteinKey {
  const text = [title ?? "", description ?? "", ingredientsText ?? ""].join(" ").toLowerCase();
  if (/(РјРёРЅС‚Р°Р№|С‚СЂРµСЃРє|С…РµРє|СЃСѓРґР°Рє|Р»РѕСЃРѕСЃ|СЃРµРјРі|СЃС‘РјРі|С„РѕСЂРµР»|С‚СѓРЅРµС†|СЃР°СЂРґРёРЅ|СЃРєСѓРјР±СЂРё|СЂС‹Р±|fish|salmon|cod|tuna|mackerel)/.test(text)) return "fish";
  if (/(РєСѓСЂРёС†|РєСѓСЂРёРЅ|РёРЅРґРµР№Рє|С„РёР»Рµ Р±РµРґСЂР°|РіСЂСѓРґРє|РїС‚РёС†|turkey|chicken)/.test(text)) return "chicken";
  if (/(РіРѕРІСЏРґРёРЅ|С‚РµР»СЏС‚|СЃРІРёРЅРёРЅ|Р±РµРєРѕРЅ|РІРµС‚С‡РёРЅ|РјСЏСЃРЅ|beef|pork|veal|bacon|ham)/.test(text)) return "beef_pork";
  if (/(С„Р°СЂС€|minced)/.test(text) && !/СЂС‹Р±/.test(text)) return "beef_pork";
  if (/(С‡РµС‡РµРІРёС†|РЅСѓС‚|С„Р°СЃРѕР»|РіРѕСЂРѕС…|Р±РѕР±|chickpea|lentil|beans|peas)/.test(text)) return "legumes";
  if (/(С‚РІРѕСЂРѕРі|Р№РѕРіСѓСЂС‚|РєРµС„РёСЂ|РјРѕР»РѕРє|СЃС‹СЂ|СЃРјРµС‚Р°РЅ|СЂСЏР¶РµРЅРє|dairy|curd|yogurt|cheese|milk|cottage|cream)/.test(text)) return "dairy";
  if (/(СЏР№С†|РѕРјР»РµС‚|egg|omelet)/.test(text)) return "egg";
  return "veg";
}

/** Allergy check with debug details: which tokens found, where. */
function checkAllergyWithDetail(
  recipe: RecipeRowPool,
  memberData: MemberDataPool | null | undefined
): { pass: boolean; foundTokens: string[]; matchedIn: string[] } {
  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length === 0) return { pass: true, foundTokens: [], matchedIn: [] };
  const title = (recipe.title ?? "").toLowerCase();
  const description = (recipe.description ?? "").toLowerCase();
  const ingredientsText = (recipe.recipe_ingredients ?? [])
    .map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" "))
    .join(" ")
    .toLowerCase();
  const foundTokens: string[] = [];
  const matchedIn: string[] = [];
  for (const tok of allergyTokens) {
    if (tok.length < 2) continue;
    const hit = title.includes(tok) || description.includes(tok) || ingredientsText.includes(tok);
    if (hit) {
      foundTokens.push(tok);
      const where: string[] = [];
      if (title.includes(tok)) where.push("title");
      if (description.includes(tok)) where.push("description");
      if (ingredientsText.includes(tok)) where.push("ingredients");
      where.forEach((w) => {
        if (!matchedIn.includes(w)) matchedIn.push(w);
      });
    }
  }
  return { pass: foundTokens.length === 0, foundTokens, matchedIn };
}

function passesProfileFilter(recipe: RecipeRowPool, memberData: MemberDataPool | null | undefined): { pass: boolean; reason?: "filtered_by_allergies" | "filtered_by_preferences" | "filtered_by_age" } {
  const { pass } = checkAllergyWithDetail(recipe, memberData);
  if (!pass) return { pass: false, reason: "filtered_by_allergies" };
  const prefTokens = getPreferenceExcludeTokens(memberData);
  if (prefTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, prefTokens)) return { pass: false, reason: "filtered_by_preferences" };
  }
  const ageMonths = memberData?.age_months;
  if (ageMonths != null && ageMonths < 36) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, AGE_RESTRICTED_TOKENS)) return { pass: false, reason: "filtered_by_age" };
  }
  return { pass: true };
}

/** [1] Scoring for pool candidates. Higher = better. Returns breakdown for debug. */
type AdaptiveParams = { allergyPenalty?: number; softenProtein?: boolean; proteinPenaltyBoost?: number };
type ScoreResult = { finalScore: number; baseScore: number; diversityPenalty: number; proteinKey: ProteinKey; proteinCountBefore: number; categoryKey: string };
function scorePoolCandidate(
  recipe: RecipeRowPool,
  normalizedSlot: NormalizedMealType,
  allergyTokens: string[],
  proteinKeyCounts: Record<string, number>,
  excludeProteinKeys: Set<string>,
  usedTitleKeysSet: Set<string>,
  adaptiveParams?: AdaptiveParams
): ScoreResult {
  let baseScore = 0;
  const src = (recipe.source ?? "").toLowerCase();
  if (src === "manual" || src === "week_ai") baseScore += 2;
  const ingredientsCount = recipe.recipe_ingredients?.length ?? 0;
  const ingredientsText = (recipe.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
  if (ingredientsCount >= 4 || ingredientsText.length >= 40) baseScore += 1;
  const stepsCount = recipe.recipe_steps?.length ?? 0;
  if (stepsCount >= 3) baseScore += 1;
  const t = (recipe.title ?? "").toLowerCase();
  const snackyTokens = ["РїСЋСЂРµ", "РґРѕР»СЊРєРё", "Р±Р°С‚РѕРЅС‡РёРє", "РїРµС‡РµРЅСЊРµ"];
  if (normalizedSlot !== "snack" && snackyTokens.some((tok) => t.includes(tok))) baseScore -= 3;
  const snackLike = ["Р№РѕРіСѓСЂС‚", "С‚РІРѕСЂРѕРі", "РґРѕР»СЊРєРё", "РїРµС‡РµРЅСЊРµ", "Р±Р°С‚РѕРЅС‡РёРє", "РїСЋСЂРµ", "СЃРјСѓР·Рё"];
  if (normalizedSlot === "dinner" && snackLike.some((tok) => t.includes(tok))) baseScore -= 5;
  const breakfastLike = ["РѕР»Р°РґСЊ", "СЃС‹СЂРЅРёРє", "Р·Р°РїРµРєР°РЅРє", "РєР°С€Р°", "РіСЂР°РЅРѕР»Р°", "С‚РѕСЃС‚"];
  if ((normalizedSlot === "lunch" || normalizedSlot === "dinner") && breakfastLike.some((tok) => t.includes(tok))) baseScore -= 5;
  const categoryKey = inferDishCategoryKey(recipe.title, recipe.description, ingredientsText);
  if (normalizedSlot === "lunch") {
    if (categoryKey === "soup") baseScore += 4;
    else baseScore -= 2;
  }
  if (normalizedSlot === "snack") {
    const snackAllow = ["С„СЂСѓРєС‚", "СЏРіРѕРґ", "РѕСЂРµС…", "СЃРјСѓР·Рё", "РїРµС‡РµРЅСЊРµ", "Р±Р°С‚РѕРЅС‡РёРє", "С…Р»РµР±РµС†", "РїСЋСЂРµ", "fruit", "berry", "nut"];
    if (snackAllow.some((tok) => t.includes(tok))) baseScore += 2;
    const snackReject = ["РєР°С€Р°", "РіСЂРµС‡Рє", "СЂРёСЃ", "СЂР°РіСѓ", "С‚СѓС€РµРЅ", "rice", "oat"];
    if (snackReject.some((tok) => t.includes(tok))) baseScore -= 5;
  }
  const titleK = normalizeTitleKey(recipe.title);
  if (usedTitleKeysSet.has(titleK)) baseScore -= 20;
  const allergyPenaltyVal = typeof adaptiveParams?.allergyPenalty === "number" ? adaptiveParams.allergyPenalty : -100;
  if (allergyTokens.length > 0) {
    const checkText = [recipe.title, recipe.description ?? "", ingredientsText].join(" ");
    if (containsAnyToken(checkText, allergyTokens)) return { finalScore: allergyPenaltyVal, baseScore: 0, diversityPenalty: allergyPenaltyVal, proteinKey: "veg", proteinCountBefore: 0, categoryKey: "other" };
  }
  const softenProtein = adaptiveParams?.softenProtein === true;
  const proteinPenaltyBoost = typeof adaptiveParams?.proteinPenaltyBoost === "number" ? adaptiveParams.proteinPenaltyBoost : 0;
  const pk = inferProteinKey(recipe.title, recipe.description, ingredientsText);
  const proteinCountBefore = proteinKeyCounts[pk] ?? 0;

  let diversityPenalty = 0;
  if (excludeProteinKeys.has(pk)) {
    diversityPenalty += softenProtein ? 2 : -10;
  }
  if (normalizedSlot === "snack") {
    if (pk === "dairy" && proteinCountBefore >= 2) diversityPenalty -= 30;
    else if (pk === "dairy" && proteinCountBefore >= 1) diversityPenalty -= 15;
    else if (pk === "fish" || pk === "dairy") {
      if (proteinCountBefore >= 1) diversityPenalty -= softenProtein ? 6 : 20 + proteinPenaltyBoost;
    } else if (proteinCountBefore >= 2) diversityPenalty -= softenProtein ? 5 : 15 + proteinPenaltyBoost;
  } else {
    if (pk === "fish" || pk === "dairy") {
      if (proteinCountBefore >= 1) diversityPenalty -= softenProtein ? 6 : 20 + proteinPenaltyBoost;
    } else if (proteinCountBefore >= 2) diversityPenalty -= softenProtein ? 5 : 15 + proteinPenaltyBoost;
  }

  const finalScore = baseScore + diversityPenalty;
  return { finalScore, baseScore, diversityPenalty, proteinKey: pk, proteinCountBefore, categoryKey };
}

/** Load pool once for run/upgrade: same "loose" query, no per-slot SELECT. */
async function fetchPoolCandidates(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  limitCandidates: number
): Promise<RecipeRowPool[]> {
  const baseQ = () =>
    supabase
      .from("recipes")
      .select("id, title, tags, description, meal_type, source, recipe_ingredients(name, display_text), recipe_steps(instruction)")
      .eq("user_id", userId)
      .in("source", ["seed", "starter", "manual", "week_ai", "chat_ai"])
      .order("created_at", { ascending: false })
      .limit(limitCandidates);
  let q = baseQ();
  if (memberId == null) q = q.is("member_id", null);
  else q = q.or(`member_id.eq.${memberId},member_id.is.null`);
  const { data: rows, error } = await q;
  if (error) {
    safeWarn("generate-plan fetchPoolCandidates error", error.message);
    return [];
  }
  return (rows ?? []) as RecipeRowPool[];
}

async function pickFromPool(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  mealType: string,
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  limitCandidates: number,
    options?: {
    logPrefix?: string;
    hadRecipeId?: string | null;
    returnDebug?: boolean;
    debugPool?: boolean;
    excludeProteinKeys?: string[];
    proteinKeyCounts?: Record<string, number>;
    /** РљР»СЋС‡Рё РіР»Р°РІРЅС‹С… РёРЅРіСЂРµРґРёРµРЅС‚РѕРІ СѓР¶Рµ РІС‹Р±СЂР°РЅРЅС‹С… РІ СЌС‚РѕС‚ РґРµРЅСЊ вЂ” РЅРµ РїРѕРІС‚РѕСЂСЏС‚СЊ (С‚С‹РєРІР° РґРІР°Р¶РґС‹ РІ РґРµРЅСЊ). */
    excludedMainIngredients?: string[];
    adaptiveParams?: AdaptiveParams;
    weekProgress?: { filled: number; total: number };
    debugSlotStats?: Record<string, unknown>;
    weekStats?: { candidatesSeen: number };
    /** Р”Р»СЏ replace_slot: РІРµСЂРЅСѓС‚СЊ candidatesAfterAllFilters Рё topTitleKeys РґР»СЏ СЂРµС€РµРЅРёСЏ РѕР± AI fallback. */
    returnExtra?: boolean;
    /** Р”Р»СЏ week/day run: РІРµСЂРЅСѓС‚СЊ top 10 РєР°РЅРґРёРґР°С‚РѕРІ СЃ categoryKey/proteinKey/titleKey РґР»СЏ rerank РїРѕ quality gate. */
    returnTopCandidates?: number;
    /** РџСѓР» СѓР¶Рµ Р·Р°РіСЂСѓР¶РµРЅ (run/upgrade): РЅРµ РґРµР»Р°С‚СЊ SELECT, С„РёР»С‚СЂРѕРІР°С‚СЊ РІ РїР°РјСЏС‚Рё. */
    preloadedCandidates?: RecipeRowPool[] | null;
    /** Р"Р»СЏ [POOL DIAG]: Р»РѕР³РёСЂРѕРІР°С‚СЊ СЃС‚СѓРїРµРЅРё С„РёР»С‚СЂР° С‚РѕР»СЊРєРѕ РїСЂРё debug_plan. */
    logDiag?: { requestId: string; dayKey: string; mealKey: string; usedTitleKeysByMealTypeSize?: number } | null;
  }
): Promise<
  | { id: string; title: string; candidatesAfterAllFilters?: number; topTitleKeys?: string[] }
  | { topCandidates: Array<{ id: string; title: string; categoryKey: string; proteinKey: ProteinKey; titleKey: string }>; candidatesAfterAllFilters: number }
  | null
> {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const excludeProteinKeysRaw = (options?.excludeProteinKeys ?? []).filter((pk) => pk !== "veg");
  const excludeProteinSet = new Set(excludeProteinKeysRaw);
  const excludedMainIngredientSet = new Set((options?.excludedMainIngredients ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean));
  const excludedMainIngredientsList = options?.excludedMainIngredients ?? [];
  const proteinKeyCounts = options?.proteinKeyCounts ?? {};
  const adaptiveParams = options?.adaptiveParams;
  const weekProgress = options?.weekProgress;
  const proteinPenaltyBoost = (weekProgress && weekProgress.total > 0 && weekProgress.filled / weekProgress.total > 0.5)
    ? 2
    : 0;
  const effectiveAdaptive: AdaptiveParams = {
    ...adaptiveParams,
    proteinPenaltyBoost: proteinPenaltyBoost + (adaptiveParams?.proteinPenaltyBoost ?? 0),
  };
  const debugPool = options?.debugPool ?? (typeof Deno !== "undefined" && Deno.env?.get?.("GENERATE_PLAN_DEBUG") === "1");
  const weekStats = options?.weekStats;
  const logPrefix = options?.logPrefix ?? "[POOL DEBUG]";
  const hadRecipeId = options?.hadRecipeId ?? undefined;

  const normalizedSlot = normalizeMealType(mealType) ?? (mealType as NormalizedMealType);
  const allergyTokens = getAllergyTokens(memberData);

  let rawCandidates: RecipeRowPool[];
  let candidatesStrict: number;
  if (options?.preloadedCandidates != null && options.preloadedCandidates.length >= 0) {
    rawCandidates = options.preloadedCandidates;
    candidatesStrict = rawCandidates.length; // preloaded = loose list, no separate strict count
  } else {
    const baseQ = () =>
      supabase
        .from("recipes")
        .select("id, title, tags, description, meal_type, source, recipe_ingredients(name, display_text), recipe_steps(instruction)")
        .eq("user_id", userId)
        .in("source", ["seed", "starter", "manual", "week_ai", "chat_ai"])
        .order("created_at", { ascending: false })
        .limit(limitCandidates);

    let qStrict = baseQ();
    if (memberId == null) qStrict = qStrict.is("member_id", null);
    else qStrict = qStrict.eq("member_id", memberId);

    const { data: rowsStrict, error: errStrict } = await qStrict;
    if (errStrict) {
      safeWarn("generate-plan pool query (strict) error", mealType, errStrict.message);
      return null;
    }
    candidatesStrict = (rowsStrict ?? []).length;

    let qLoose = baseQ();
    if (memberId == null) {
    } else {
      qLoose = qLoose.or(`member_id.eq.${memberId},member_id.is.null`);
    }
    if (excludeRecipeIds.length > 0 && excludeRecipeIds.length < 50) {
      qLoose = qLoose.not("id", "in", `(${excludeRecipeIds.join(",")})`);
    }

    const { data: rowsLoose, error: errLoose } = await qLoose;
    if (errLoose) {
      safeWarn("generate-plan pool query (loose) error", mealType, errLoose.message);
      return null;
    }
    rawCandidates = (rowsLoose ?? []) as RecipeRowPool[];
  }
  const candidatesLoose = rawCandidates.length;
  const candidatesFromDb = rawCandidates.length;
  if (weekStats && typeof weekStats === "object") weekStats.candidatesSeen = (weekStats.candidatesSeen ?? 0) + candidatesFromDb;

  let filtered = rawCandidates;
  if (excludeRecipeIds.length > 0 && excludeRecipeIds.length < 50) {
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }
  const afterExcludeIds = filtered.length;
  const startCount = afterExcludeIds; // pipeline start for breakdown (same as afterExcludeIds)
  const afterExclude = startCount; // legacy name for rejectReason/logPayload
  filtered = filtered.filter((r) => !excludeTitleSet.has(normalizeTitleKey(r.title)));
  const afterExcludeTitleKeys = filtered.length;
  const titleKeyRejectedCount = startCount - afterExcludeTitleKeys;

  let afterMainIngredient = afterExcludeTitleKeys;
  if (excludedMainIngredientSet.size > 0) {
    const beforeMainIngredient = filtered.length;
    filtered = filtered.filter((r) => {
      const ingText = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
      const mainKey = inferMainIngredientKey(r.title, r.description, ingText);
      return mainKey == null || !excludedMainIngredientSet.has(mainKey);
    });
    afterMainIngredient = filtered.length;
    if (debugPool && beforeMainIngredient !== afterMainIngredient) {
      safeLog("[POOL DEBUG] afterMainIngredient", { mealType, beforeMainIngredient, afterMainIngredient, excludedMainIngredients: [...excludedMainIngredientSet] });
    }
  }

  const beforeMealType = afterMainIngredient;
  const preMealTypeFiltered = [...filtered];
  const resolvedCache = new Map<string, { resolved: NormalizedMealType | null; wasInferred: boolean }>();
  for (const r of preMealTypeFiltered) {
    resolvedCache.set(r.id, getResolvedMealType(r));
  }
  filtered = preMealTypeFiltered.filter((r) => {
    const { resolved } = resolvedCache.get(r.id) ?? getResolvedMealType(r);
    return resolved != null && resolved === normalizedSlot;
  });
  const afterMealType = filtered.length;
  const mealTypeRejectedCount = beforeMealType - afterMealType;
  const mealTypeRecoveredFromTitle = preMealTypeFiltered.some((r) => {
    const c = resolvedCache.get(r.id);
    return c?.wasInferred && c.resolved === normalizedSlot;
  });
  const recoveredCount = filtered.filter((r) => resolvedCache.get(r.id)?.wasInferred).length;
  if (debugPool && preMealTypeFiltered.length > 0) {
    const sampleResolved = preMealTypeFiltered.slice(0, 15).map((r) => {
      const c = resolvedCache.get(r.id) ?? getResolvedMealType(r);
      return { raw: r.meal_type ?? "null", norm_raw: normalizeMealType(r.meal_type), resolved: c.resolved, wasInferred: c.wasInferred };
    });
    safeLog("[MEAL_TYPE DEBUG]", {
      slotTypeRaw: mealType,
      slotTypeNorm: normalizedSlot,
      beforeMealType,
      afterMealType,
      mealTypeRejectedCount,
      sampleResolved,
    });
  }
  const candidatesAfterMealType = afterMealType;

  const mealTypeSamples = afterMealType === 0 && candidatesFromDb > 0
    ? rawCandidates.slice(0, 5).map((r) => r.meal_type)
    : undefined;

  if (normalizedSlot === "breakfast") {
    filtered = filtered.filter((r) => !isSoupLikeTitle(r.title));
  }
  const afterNoSoup = filtered.length;

  const sanityBlockedReasons: string[] = [];
  const beforeSanity = filtered.length;
  filtered = filtered.filter((r) => {
    const ingText = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
    const fullText = [r.title ?? "", r.description ?? "", ingText].join(" ");
    const { ok, hitTokens } = slotSanityCheck(normalizedSlot, fullText);
    if (!ok) {
      sanityBlockedReasons.push(...hitTokens);
      if (debugPool) safeLog("[SANITY DEBUG]", { slotType: mealType, recipeId: r.id, title: r.title?.slice(0, 50), hitTokens });
      return false;
    }
    return true;
  });
  const blockedBySanityRules = [...new Set(sanityBlockedReasons)];
  const afterSanity = filtered.length;

  let rejectReason: string | undefined;
  if (candidatesFromDb === 0) rejectReason = "no_candidates";
  else if (candidatesStrict === 0 && candidatesLoose > 0) rejectReason = "member_id_mismatch";
  else if (afterExclude === 0) rejectReason = "source_filter_too_strict";
  else if (afterMealType === 0) rejectReason = "meal_type_mismatch";
  else if (normalizedSlot === "breakfast" && afterNoSoup === 0) rejectReason = "all_soup_for_breakfast";
  else if (afterSanity === 0 && blockedBySanityRules.length > 0) rejectReason = "sanity_rules";
  else if (excludedMainIngredientSet.size > 0 && afterMainIngredient === 0 && afterExcludeTitleKeys > 0) rejectReason = "main_ingredient_repeat";

  const beforeProfile = filtered.length;
  const candidatesBeforeProfile = [...filtered];
  const afterAllergy = candidatesBeforeProfile.filter((r) => checkAllergyWithDetail(r, memberData).pass).length;
  const firstFailReason = { current: undefined as string | undefined };
  filtered = filtered.filter((r) => {
    const result = passesProfileFilter(r, memberData);
    if (!result.pass && !firstFailReason.current) firstFailReason.current = result.reason;
    return result.pass;
  });
  const afterProfile = filtered.length;
  const allergyRejectedCount = beforeProfile - afterAllergy;
  const profileRejectedCount = beforeProfile - afterProfile;
  if (beforeProfile > 0 && afterProfile === 0 && firstFailReason.current) rejectReason = firstFailReason.current;

  const hasMilkAllergy = memberData?.allergies?.length && memberData?.allergies?.some((a) => /РјРѕР»РѕРє|milk|Р»Р°РєС‚РѕР·|lactose|dairy|РєР°Р·РµРёРЅ|casein/i.test(String(a)));
  if (debugPool && hasMilkAllergy && allergyTokens.length === 0) {
    safeLog("[ALLERGY DEBUG] warning", { allergiesRaw: memberData?.allergies ?? [] });
  }
  if (debugPool && allergyTokens.length > 0) {
    for (let idx = 0; idx < Math.min(3, candidatesBeforeProfile.length); idx++) {
      const r = candidatesBeforeProfile[idx];
      const detail = checkAllergyWithDetail(r, memberData);
      safeLog("[ALLERGY DEBUG]", {
        slotType: mealType,
        recipeId: r.id,
        title: r.title?.slice(0, 60),
        foundAllergyTokens: detail.foundTokens.slice(0, 10),
        matchedIn: detail.matchedIn,
      });
    }
    if (beforeProfile > 0 && afterProfile === 0 && firstFailReason.current === "filtered_by_allergies") {
      const tokenCounts = new Map<string, number>();
      for (const r of candidatesBeforeProfile) {
        const { foundTokens } = checkAllergyWithDetail(r, memberData);
        for (const tok of foundTokens) {
          tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1);
        }
      }
      const topTokens = [...tokenCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tok, cnt]) => `${tok}:${cnt}`);
      safeLog("[ALLERGY DEBUG] all_filtered", { slotType: mealType, candidates: beforeProfile, topTokens });
    }
  }

  const sanityRejectedCount = beforeSanity - afterSanity;
  const proteinRejectedCount = 0;
  const finalCount = afterProfile;
  const rejectedTotal = startCount - finalCount;
  // profileRejectedCount includes allergy; do not add allergyRejectedCount to avoid double-count
  const topRejectReasonsSum =
    titleKeyRejectedCount + mealTypeRejectedCount + sanityRejectedCount + profileRejectedCount + proteinRejectedCount;

  if (debugPool) {
    safeLog("[POOL DEBUG] reject_breakdown", {
      slotType: mealType,
      afterExcludeIds,
      afterExcludeTitleKeys,
      afterMealType,
      afterSanity,
      afterProfile,
      finalCount,
      rejectedTotal,
      topRejectReasonsPrimary: {
        titleKey: titleKeyRejectedCount,
        mealType: mealTypeRejectedCount,
        sanity: sanityRejectedCount,
        profile: profileRejectedCount,
        protein: proteinRejectedCount,
      },
      topRejectReasonsDetails: { allergy: allergyRejectedCount },
      invariant: rejectedTotal === topRejectReasonsSum,
      candidatesStrict,
      candidatesLoose,
    });
  }

  const logDiag = options?.logDiag;
  if (logDiag) {
    safeLog("[POOL DIAG counts]", {
      requestId: logDiag.requestId,
      dayKey: logDiag.dayKey,
      mealKey: logDiag.mealKey,
      counts: {
        fromDb: candidatesFromDb,
        afterExcludeIds,
        afterTitleKeys: afterExcludeTitleKeys,
        afterMainIngredient,
        afterMealType,
        afterSanity,
        afterAllergies: afterAllergy,
        final: afterProfile,
      },
      rejectReason: rejectReason ?? (filtered.length === 0 ? "all_filtered_out" : undefined),
    });
    safeLog("[POOL DIAG debug]", {
      requestId: logDiag.requestId,
      dayKey: logDiag.dayKey,
      mealKey: logDiag.mealKey,
      debug: {
        excludeRecipeIdsCount: excludeRecipeIds.length,
        excludeTitleKeysCount: excludeTitleKeys.length,
        usedTitleKeysByMealTypeSize: logDiag.usedTitleKeysByMealTypeSize,
        memberId: memberId ?? "null",
        excludeProteinKeysCount: excludeProteinKeysRaw.length,
        excludeProteinKeysList: excludeProteinKeysRaw.slice(0, 5),
        excludedMainIngredientsCount: excludedMainIngredientsList.length,
        excludedMainIngredientsList: excludedMainIngredientsList.slice(0, 5),
      },
    });
  }

  if (filtered.length === 0) {
    const sanityRej = sanityRejectedCount;
    const allergyRej = allergyRejectedCount;
    const debugSlotStatsNull = options?.debugSlotStats;
    if (debugSlotStatsNull && typeof debugSlotStatsNull === "object") {
      Object.assign(debugSlotStatsNull, {
        slotType: mealType,
        pickedSource: "ai",
        candidatesFromDb,
        afterExcludeIds,
        afterTitleKeys: afterExcludeTitleKeys,
        afterMainIngredient,
        afterProfile,
        pickedRecipeId: null,
        pickedTitle: null,
        pickedMealTypeNorm: null,
        proteinKey: null,
        score: null,
        rejectReason: rejectReason ?? "all_filtered_out",
        sanityRejectedCount: sanityRej,
        allergyRejectedCount: allergyRej,
        proteinRejectedCount: 0,
        mealTypeRejectedCount,
        mealTypeRecoveredFromTitle,
        recoveredCount,
      });
    }
    const logPayload: Record<string, unknown> = {
      mealType,
      normalizedSlot,
      hadRecipeId: hadRecipeId ?? undefined,
      replaced: false,
      candidatesFromDb,
      afterExcludeIds: afterExclude,
      afterTitleKeys: afterExcludeTitleKeys,
      afterMainIngredient,
      beforeMealType,
      candidatesAfterMealType: afterMealType,
      afterProfile,
      afterFiltersCount: 0,
      pickedRecipeId: null,
      rejectReason: rejectReason ?? (candidatesFromDb === 0 ? "no_candidates" : "all_filtered_out"),
      usedTitleKeysCount: excludeTitleKeys.length,
    };
    if (beforeMealType > 0 && afterMealType === 0 && debugPool) {
      logPayload.hint = "meal_type still NULL / backfill in progress";
    }
    safeLog(logPrefix, logPayload);
    return null;
  }

  const scored = filtered.map((r) => {
    const sr = scorePoolCandidate(r, normalizedSlot, allergyTokens, proteinKeyCounts, excludeProteinSet, excludeTitleSet, effectiveAdaptive);
    return { recipe: r, ...sr };
  });
  const validScored = scored.filter((x) => x.finalScore > -100);
  const sorted = (validScored.length > 0 ? validScored : scored).sort((a, b) => b.finalScore - a.finalScore);
  const top10 = sorted.slice(0, 10);
  const returnTopN = options?.returnTopCandidates ?? 0;
  if (returnTopN > 0 && sorted.length > 0) {
    const topN = sorted.slice(0, Math.min(returnTopN, sorted.length));
    const topCandidates = topN
      .filter((x) => (resolvedCache.get(x.recipe.id) ?? getResolvedMealType(x.recipe)).resolved === normalizedSlot)
      .map((x) => ({
        id: x.recipe.id,
        title: x.recipe.title,
        categoryKey: x.categoryKey,
        proteinKey: x.proteinKey,
        titleKey: normalizeTitleKey(x.recipe.title),
      }));
    return { topCandidates, candidatesAfterAllFilters: filtered.length };
  }
  if (debugPool && sorted.length > 0) {
    const top5 = sorted.slice(0, 5);
    const ingText = (r: RecipeRowPool) => (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
    safeLog("[POOL DEBUG] candidates_snapshot", {
      slotType: mealType,
      memberId: memberId ?? "null",
      usedTitleKeysCount: excludeTitleKeys.length,
      proteinCounts: { ...proteinKeyCounts },
      top5: top5.map(({ recipe: r, baseScore, diversityPenalty, finalScore, proteinKey, proteinCountBefore }) => {
        const ing = ingText(r);
        const fullText = [r.title ?? "", r.description ?? "", ing].join(" ");
        const { ok: sanityOk } = slotSanityCheck(normalizedSlot, fullText);
        const allergyDetail = checkAllergyWithDetail(r, memberData);
        const t = (r.title ?? "").toLowerCase();
        const snackLike = ["Р№РѕРіСѓСЂС‚", "С‚РІРѕСЂРѕРі", "РґРѕР»СЊРєРё", "РїРµС‡РµРЅСЊРµ", "Р±Р°С‚РѕРЅС‡РёРє", "РїСЋСЂРµ", "СЃРјСѓР·Рё"];
        const breakfastLike = ["РѕР»Р°РґСЊ", "СЃС‹СЂРЅРёРє", "Р·Р°РїРµРєР°РЅРє", "РєР°С€Р°", "РіСЂР°РЅРѕР»Р°", "С‚РѕСЃС‚"];
        const resolved = resolvedCache.get(r.id) ?? getResolvedMealType(r);
        return {
          id: r.id,
          title: r.title?.slice(0, 60),
          meal_type_raw: r.meal_type ?? null,
          meal_type_norm_raw: normalizeMealType(r.meal_type),
          meal_type_resolved: resolved.resolved,
          meal_type_wasInferred: resolved.wasInferred,
          proteinKey,
          baseScore,
          diversityPenalty,
          finalScore,
          proteinCountBefore,
          source: r.source ?? null,
          hasSteps: (r.recipe_steps?.length ?? 0) >= 3,
          ingredientsCount: r.recipe_ingredients?.length ?? 0,
          flags: {
            isSoupLike: isSoupLikeTitle(r.title),
            isSnackLike: snackLike.some((tok) => t.includes(tok)),
            isBreakfastLike: breakfastLike.some((tok) => t.includes(tok)),
            sanityRejected: !sanityOk,
            allergyHit: allergyDetail.foundTokens.length > 0,
          },
        };
      }),
    });
  }
  let picked = top10[Math.floor(Math.random() * top10.length)]?.recipe ?? sorted[0]?.recipe;

  const pickedResolved = resolvedCache.get(picked.id) ?? getResolvedMealType(picked);
  const candidateType = pickedResolved.resolved;
  if (candidateType !== normalizedSlot) {
    rejectReason = "meal_type_mismatch_after_fetch";
    safeLog(logPrefix, { mealType, normalizedSlot, pickedMealTypeRaw: picked.meal_type, pickedMealTypeNorm: candidateType, rejectReason });
    return null;
  }

  const pickedEntry = sorted.find((x) => x.recipe.id === picked.id);
  const topReason = sorted[0] ? `finalScore=${sorted[0].finalScore}` : undefined;
  const afterFiltersCount = filtered.length;
  const pickedBaseScore = pickedEntry?.baseScore;
  const pickedPenalty = pickedEntry?.diversityPenalty;
  const pickedFinalScore = pickedEntry?.finalScore;
  const pickedProteinKey = pickedEntry?.proteinKey ?? inferProteinKey(picked.title, picked.description, (picked.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" "));
  const pickedCategoryKey = pickedEntry?.categoryKey ?? inferDishCategoryKey(picked.title, picked.description, (picked.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" "));
  const excludedTitleKeysHit = afterExclude - beforeMealType;

  const debugSlotStats = options?.debugSlotStats;
  if (debugSlotStats && typeof debugSlotStats === "object") {
    Object.assign(debugSlotStats, {
      slotType: mealType,
      pickedSource: "pool",
      candidatesFromDb,
      afterExcludeIds,
      afterTitleKeys: afterExcludeTitleKeys,
      afterMainIngredient,
      afterProfile,
      pickedRecipeId: picked.id,
      pickedTitle: picked.title,
      pickedMealTypeNorm: candidateType,
      proteinKey: pickedProteinKey,
      pickedProteinKey,
      categoryKey: pickedCategoryKey,
      score: pickedFinalScore,
      rejectReason: undefined,
      sanityRejectedCount,
      allergyRejectedCount,
      proteinRejectedCount,
      mealTypeRejectedCount,
      mealTypeRecoveredFromTitle,
      recoveredCount,
    });
  }

  if (debugPool) {
    safeLog(logPrefix, "candidates snapshot", {
      top5: sorted.slice(0, 5).map((x) => ({
        id: x.recipe.id,
        title: x.recipe.title,
        meal_type: x.recipe.meal_type,
        proteinKey: x.proteinKey,
        baseScore: x.baseScore,
        diversityPenalty: x.diversityPenalty,
        finalScore: x.finalScore,
      })),
    });
  }
  safeLog(logPrefix, {
    mealType,
    normalizedSlot,
    hadRecipeId: hadRecipeId ?? undefined,
    replaced: true,
    candidatesFromDb,
    afterExcludeIds: afterExclude,
    afterTitleKeys: afterExcludeTitleKeys,
    afterMainIngredient,
    afterProfile,
    afterFiltersCount,
    pickedRecipeId: picked.id,
    rejectReason: undefined,
    topReason,
    pickedMealTypeRaw: picked.meal_type,
    pickedMealTypeNorm: candidateType,
    pickedProteinKey,
    slotTypeNorm: normalizedSlot,
    usedTitleKeysCount: excludeTitleKeys.length,
    mealTypeRecoveredFromTitle,
    recoveredCount,
    categoryKey: pickedCategoryKey,
  });
  const base = { id: picked.id, title: picked.title };
  if (options?.returnExtra) {
    const topTitleKeys = filtered.slice(0, 5).map((r) => normalizeTitleKey(r.title));
    return { ...base, candidatesAfterAllFilters: afterFiltersCount, topTitleKeys };
  }
  return base;
}

/** [3] Validate AI-generated meal: allergy + slot sanity + ingredients with amount. Returns null if OK, else reason. */
function validateAiMeal(
  title: string,
  ingredients: Array<IngredientForValidation | { name?: string; amount?: string } | string>,
  steps: string[],
  mealKey: string,
  memberData: MemberDataPool | null | undefined
): string | null {
  const ingList: IngredientForValidation[] = ingredients.map((i) => {
    if (typeof i === "string") return { name: i, amount: "", display_text: i };
    const name = (i as { name?: string }).name ?? "";
    const amountRaw = (i as { amount?: string | number }).amount;
    const unit = (i as { unit?: string }).unit ?? "";
    const amountStr = typeof amountRaw === "number" ? String(amountRaw) : (amountRaw ?? "").trim();
    const display_text =
      (i as { display_text?: string }).display_text ??
      (amountStr || unit ? `${name} вЂ” ${amountStr}${unit ? " " + unit : ""}`.trim() : name);
    return { name, amount: amountRaw, unit, display_text };
  });
  const allergyTokens = getAllergyTokens(memberData);
  const ingText = ingList.map((i) => i.name).join(" ");
  const combinedText = [title, ingText, steps.join(" ")].join(" ");
  if (allergyTokens.length > 0 && containsAnyToken(combinedText, allergyTokens)) return "allergy";
  if (!ingredientsHaveAmounts(ingList)) return "ingredients_no_amount";
  const normSlot = normalizeMealType(mealKey) ?? (mealKey as NormalizedMealType);
  const sanityText = normSlot === "breakfast" ? title : combinedText;
  const sanity = slotSanityReject(normSlot, sanityText);
  if (sanity) return sanity;
  return null;
}

interface SingleDayMeal {
  name?: string;
  ingredients?: Array<{ name?: string; amount?: string }> | string[];
  steps?: string[];
  cooking_time?: number;
  chefAdvice?: string;
  advice?: string;
}
interface SingleDayResponse {
  breakfast?: SingleDayMeal;
  lunch?: SingleDayMeal;
  snack?: SingleDayMeal;
  dinner?: SingleDayMeal;
}

serve(async (req) => {
  // CORS preflight: must return 2xx and CORS headers so browser allows the actual request
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_config_or_auth" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as {
      action?: "start" | "run" | "replace_slot" | "cancel";
      mode?: "autofill" | "upgrade";
      job_id?: string;
      type?: "day" | "week";
      member_id?: string | null;
      member_data?: { name?: string; age_months?: number; allergies?: string[]; preferences?: string[] };
      day_key?: string;
      day_keys?: string[];
      start_key?: string;
      end_key?: string;
      meal_type?: string;
      exclude_recipe_ids?: string[];
      exclude_title_keys?: string[];
      debug_pool?: boolean;
      debug_plan?: boolean | string;
    };
    const mode = body.mode === "upgrade" ? "upgrade" : "autofill";
    const debugPool = body.debug_pool ?? false;
    const action = body.action === "run" ? "run" : body.action === "replace_slot" ? "replace_slot" : body.action === "cancel" ? "cancel" : "start";
    const type = body.type === "day" || body.type === "week" ? body.type : "day";
    const memberId = body.member_id ?? null;
    const memberData = body.member_data ?? null;

    if (action === "cancel") {
      const cancelJobId = typeof body.job_id === "string" ? body.job_id : null;
      if (!cancelJobId) {
        return new Response(JSON.stringify({ error: "job_id_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: cancelJob, error: cancelErr } = await supabase
        .from("plan_generation_jobs")
        .select("id, user_id, status")
        .eq("id", cancelJobId)
        .single();
      if (cancelErr || !cancelJob || cancelJob.user_id !== userId) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabase
        .from("plan_generation_jobs")
        .update({
          status: "error",
          error_text: "cancelled_by_user",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cancelJobId);
      return new Response(
        JSON.stringify({ job_id: cancelJobId, status: "error", cancelled: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "replace_slot") {
      const requestId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const debugPlan = body.debug_plan === true || body.debug_plan === "1" || Deno.env.get("DEBUG_PLAN") === "1";

      const dayKey = typeof body.day_key === "string" ? body.day_key : null;
      const mealType = typeof body.meal_type === "string" ? body.meal_type : null;
      if (!dayKey || !mealType || !MEAL_KEYS.includes(mealType as (typeof MEAL_KEYS)[number])) {
        return new Response(
          JSON.stringify({ error: "missing_day_key_or_meal_type", requestId, reason: "bad_input" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (debugPlan) safeLog("[REPLACE_SLOT] start", { requestId, dayKey, memberId, mealType });
      const memberDataPool: MemberDataPool | null = memberData
        ? { allergies: memberData.allergies ?? [], preferences: memberData.preferences ?? [], age_months: memberData.age_months }
        : null;

      const existingRow = await supabase
        .from("meal_plans_v2")
        .select("id, meals")
        .eq("user_id", userId)
        .eq("planned_date", dayKey)
        .is("member_id", memberId)
        .maybeSingle();

      const currentMeals = (existingRow.data as { meals?: Record<string, { recipe_id?: string; title?: string }> } | null)?.meals ?? {};
      const hadRecipeId = currentMeals[mealType]?.recipe_id ?? null;

      const dateKeysReplace = [dayKey, ...getLastNDaysKeys(dayKey, 6)];
      const { recipeIds: replaceRecipeIds, titleKeys: replaceTitleKeys } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, memberId, dateKeysReplace);
      const excludeRecipeIds = [...(Array.isArray(body.exclude_recipe_ids) ? body.exclude_recipe_ids : []), ...replaceRecipeIds];
      const excludeTitleKeys = [...new Set([...(Array.isArray(body.exclude_title_keys) ? body.exclude_title_keys : []), ...replaceTitleKeys])];
      const excludedMainIngredientsReplace = MEAL_KEYS.filter((k) => k !== mealType)
        .map((k) => inferMainIngredientKey(currentMeals[k]?.title ?? "", null, null))
        .filter(Boolean) as string[];

      let excludeProteinKeys: string[] = [];
      const prevDayKey = getPrevDayKey(dayKey);
      const prevDayRow = await supabase
        .from("meal_plans_v2")
        .select("meals")
        .eq("user_id", userId)
        .eq("planned_date", prevDayKey)
        .is("member_id", memberId)
        .maybeSingle();
      const prevMeals = (prevDayRow.data as { meals?: Record<string, { title?: string }> } | null)?.meals ?? {};
      for (const k of MEAL_KEYS) {
        const t = prevMeals[k]?.title;
        const pk = inferProteinKey(t, null);
        if (pk && pk !== "veg") excludeProteinKeys.push(pk);
      }

      const REPLACE_POOL_MIN_CANDIDATES = 3;
      const { data: profileRowReplace } = await supabase.from("profiles_v2").select("status, premium_until, trial_until").eq("user_id", userId).maybeSingle();
      const profReplace = profileRowReplace as { status?: string; premium_until?: string | null; trial_until?: string | null } | null;
      const isPremiumOrTrialReplace = !!(profReplace?.premium_until && new Date(profReplace.premium_until) > new Date()) || !!(profReplace?.trial_until && new Date(profReplace.trial_until) > new Date()) || profReplace?.status === "premium" || profReplace?.status === "trial";

      const pickedRaw = await pickFromPool(
        supabase,
        userId,
        memberId,
        mealType,
        memberDataPool,
        excludeRecipeIds,
        excludeTitleKeys,
        60,
        { logPrefix: "[REPLACE_SLOT]", hadRecipeId, excludeProteinKeys, debugPool, excludedMainIngredients: excludedMainIngredientsReplace, returnExtra: true }
      );
      const sessionExcludeRecipeCount = Array.isArray(body.exclude_recipe_ids) ? body.exclude_recipe_ids.length : 0;
      const sessionExcludeTitleCount = Array.isArray(body.exclude_title_keys) ? body.exclude_title_keys.length : 0;
      const candidatesAfterAll = pickedRaw?.candidatesAfterAllFilters ?? 0;
      const topTitles = pickedRaw?.topTitleKeys ?? [];
      const qualityGateTriggered = !!pickedRaw && (candidatesAfterAll <= REPLACE_POOL_MIN_CANDIDATES) && isPremiumOrTrialReplace;
      const picked = qualityGateTriggered ? null : (pickedRaw ? { id: pickedRaw.id, title: pickedRaw.title } : null);
      if (debugPlan) {
        safeLog("[REPLACE_SLOT] pool_result", {
          requestId,
          poolCandidatesAfterAllFilters: candidatesAfterAll,
          topTitles: topTitles.slice(0, 5),
          sessionExcludeCounts: { recipeIds: sessionExcludeRecipeCount, titleKeys: sessionExcludeTitleCount },
          qualityGateTriggered,
          qualityGateReason: qualityGateTriggered ? "pool_candidates_low" : undefined,
          aiFallbackTriggered: !picked && (pickedRaw == null || qualityGateTriggered),
          aiFallbackReason: !picked ? (pickedRaw == null ? "pool_empty" : "pool_candidates_low") : undefined,
        });
      }

      if (picked) {
        if (debugPlan) safeLog("[REPLACE_SLOT] pool_search", { requestId, pickedSource: "pool", newRecipeId: picked.id });
        const newMeals = { ...currentMeals, [mealType]: { recipe_id: picked.id, title: picked.title, plan_source: "pool" as const } };
        const upsertErr = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals);
        if (upsertErr.error) {
          safeWarn("[REPLACE_SLOT] attach_failed (upsert)", requestId, upsertErr.error);
          return new Response(
            JSON.stringify({ error: "replace_failed", pickedSource: "pool", reasonIfAi: "attach_failed", requestId, reason: "attach_failed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (debugPlan) safeLog("[REPLACE_SLOT] finish", { requestId, ok: true, recipeId: picked.id, reason: "pool" });
        return new Response(
          JSON.stringify({ pickedSource: "pool", newRecipeId: picked.id, title: picked.title, plan_source: "pool", requestId, reason: "pool" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (debugPlan) safeLog("[REPLACE_SLOT] pool_search", { requestId, pickedSource: null, reason: qualityGateTriggered ? "quality_gate" : "pool_empty" });
      // Plan = only pool. No AI from replace_slot. When no candidates, return pool_exhausted.
      return new Response(
        JSON.stringify({ ok: false, error: "replace_failed", code: "pool_exhausted", requestId, reason: "pool_exhausted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startKey = type === "week" ? (body.start_key ?? getRolling7Dates(getTodayKey())[0]) : null;
    const dayKeys = type === "day" && body.day_key
      ? [body.day_key]
      : type === "week"
        ? (Array.isArray(body.day_keys) && body.day_keys.length > 0 ? body.day_keys : getRolling7Dates(startKey ?? getTodayKey()))
        : [];

    if (dayKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: "missing_day_key_or_start_key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "upgrade") {
      const debugPlanUpgrade = body.debug_plan === true || body.debug_plan === "1" || (typeof Deno !== "undefined" && Deno.env?.get?.("DEBUG_PLAN") === "1");
      if (debugPool) {
        safeLog("[POOL UPGRADE] range", { dayKeysCount: dayKeys.length, firstKey: dayKeys[0], lastKey: dayKeys[dayKeys.length - 1] });
      }
      const memberDataPool: MemberDataPool | null = memberData
        ? { allergies: memberData.allergies ?? [], preferences: memberData.preferences ?? [], age_months: memberData.age_months }
        : null;
      const allergyTokens = getAllergyTokens(memberDataPool);
      const { data: profileUpgrade } = await supabase.from("profiles_v2").select("status, premium_until, trial_until").eq("user_id", userId).maybeSingle();
      const profUpgrade = profileUpgrade as { status?: string; premium_until?: string | null; trial_until?: string | null } | null;
      const isPremiumOrTrialUpgrade = !!(profUpgrade?.premium_until && new Date(profUpgrade.premium_until) > new Date()) || !!(profUpgrade?.trial_until && new Date(profUpgrade.trial_until) > new Date()) || profUpgrade?.status === "premium" || profUpgrade?.status === "trial";

      let weekContext: string[] = [];
      const usedRecipeIds: string[] = [];
      const usedTitleKeys: string[] = [];
      const usedTitleKeysByMealTypeUpgrade: Record<string, Set<string>> = { breakfast: new Set(), lunch: new Set(), snack: new Set(), dinner: new Set() };
      const usedCategoriesByMealTypeUpgrade: Record<string, Set<string>> = { breakfast: new Set(), lunch: new Set(), snack: new Set(), dinner: new Set() };
      let breakfastPorridgeCountUpgrade = 0;
      const proteinKeyCounts: Record<string, number> = {};
      let lastCategoryByMealTypeUpgrade: Record<string, string> = {};
      let replacedCount = 0;
      let unchangedCount = 0;
      let aiFallbackCount = 0;
      const weekRows = await (async () => {
        let weekQ = supabase
          .from("meal_plans_v2")
          .select("planned_date, meals")
          .eq("user_id", userId)
          .in("planned_date", dayKeys);
        if (memberId == null) weekQ = weekQ.is("member_id", null);
        else weekQ = weekQ.eq("member_id", memberId);
        const { data } = await weekQ;
        return (data ?? []) as { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }[];
      })();
      weekRows.forEach((row) => {
        const meals = row.meals ?? {};
        MEAL_KEYS.forEach((k) => {
          const slot = meals[k];
          if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
          if (slot?.title) {
            usedTitleKeys.push(normalizeTitleKey(slot.title));
            usedTitleKeysByMealTypeUpgrade[k].add(normalizeTitleKey(slot.title));
            const cat = inferDishCategoryKey(slot.title, null, null);
            usedCategoriesByMealTypeUpgrade[k].add(cat);
            if (k === "breakfast" && cat === "porridge") breakfastPorridgeCountUpgrade++;
          }
        });
      });
      const last4KeysUpgrade = getLastNDaysKeys(dayKeys[0], 4);
      const { recipeIds: prev4RecipeIdsUpgrade, titleKeys: prev4TitleKeysUpgrade } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, memberId, last4KeysUpgrade);
      usedRecipeIds.push(...prev4RecipeIdsUpgrade);
      usedTitleKeys.push(...prev4TitleKeysUpgrade);
      const last4TitleByMealUpgrade = await fetchTitleKeysByMealTypeFromPlans(supabase, userId, memberId, last4KeysUpgrade);
      const last4CatByMealUpgrade = await fetchCategoriesByMealTypeFromPlans(supabase, userId, memberId, last4KeysUpgrade);
      for (const k of MEAL_KEYS) {
        usedTitleKeysByMealTypeUpgrade[k] = new Set([...(usedTitleKeysByMealTypeUpgrade[k] ?? []), ...(last4TitleByMealUpgrade[k] ?? [])]);
        usedCategoriesByMealTypeUpgrade[k] = new Set([...(usedCategoriesByMealTypeUpgrade[k] ?? []), ...(last4CatByMealUpgrade[k] ?? [])]);
      }
      let qLast4Up = supabase.from("meal_plans_v2").select("meals").eq("user_id", userId).in("planned_date", last4KeysUpgrade);
      if (memberId == null) qLast4Up = qLast4Up.is("member_id", null);
      else qLast4Up = qLast4Up.eq("member_id", memberId);
      const { data: last4RowsUp } = await qLast4Up;
      (last4RowsUp ?? []).forEach((row: { meals?: Record<string, { title?: string }> }) => {
        const title = row.meals?.breakfast?.title;
        if (title && inferDishCategoryKey(title, null, null) === "porridge") breakfastPorridgeCountUpgrade++;
      });

      const deepseekUrlUpgrade = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/deepseek-chat";

      const poolCandidates = await fetchPoolCandidates(supabase, userId, memberId, 120);
      const startedAt = Date.now();
      const BUDGET_MS = 25000;
      let filledSlotsCountUpgrade = 0;
      let filledDaysCountUpgrade = 0;
      const requestId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `upg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      if (debugPlanUpgrade) {
        safeLog("[POOL EXCLUDES]", {
          requestId,
          memberId: memberId ?? "null",
          dayKeys,
          excludeRecipeIdsCount: usedRecipeIds.length,
          excludeTitleKeysCount: usedTitleKeys.length,
          usedTitleKeysByMealTypeSizes: {
            breakfast: usedTitleKeysByMealTypeUpgrade.breakfast?.size ?? 0,
            lunch: usedTitleKeysByMealTypeUpgrade.lunch?.size ?? 0,
            snack: usedTitleKeysByMealTypeUpgrade.snack?.size ?? 0,
            dinner: usedTitleKeysByMealTypeUpgrade.dinner?.size ?? 0,
          },
        });
      }

      for (let di = 0; di < dayKeys.length; di++) {
        if (Date.now() - startedAt > BUDGET_MS) {
          const totalSlotsUp = dayKeys.length * MEAL_KEYS.length;
          const emptySlotsUp = totalSlotsUp - filledSlotsCountUpgrade;
          const emptyDaysUp = dayKeys.length - filledDaysCountUpgrade;
          return new Response(
            JSON.stringify({
              ok: true,
              partial: true,
              reason: "time_budget",
              totalSlots: totalSlotsUp,
              filledSlotsCount: filledSlotsCountUpgrade,
              emptySlotsCount: emptySlotsUp,
              filledDaysCount: filledDaysCountUpgrade,
              emptyDaysCount: emptyDaysUp,
              replacedCount,
              unchangedCount,
              aiFallbackCount,
              assignedCount: replacedCount,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const dayKey = dayKeys[di];
        const prevDayKey = di > 0 ? dayKeys[di - 1] : null;
        let excludeProteinKeysFromPrevDay: string[] = [];
        if (prevDayKey) {
          const prevRow = weekRows.find((r) => r.planned_date === prevDayKey);
          const prevMeals = prevRow?.meals ?? {};
          for (const k of MEAL_KEYS) {
            const pk = inferProteinKey(prevMeals[k]?.title, null);
            if (pk && pk !== "veg") excludeProteinKeysFromPrevDay.push(pk);
          }
        }
        const dayUsedProteinKeys = new Set<string>();
        const existingRow = await supabase
          .from("meal_plans_v2")
          .select("id, meals")
          .eq("user_id", userId)
          .eq("planned_date", dayKey)
          .is("member_id", memberId)
          .maybeSingle();
        type MealsRow = Record<string, { recipe_id?: string; title?: string; plan_source?: "pool" | "ai"; replaced_from_recipe_id?: string }>;
        const currentMeals = (existingRow.data as { meals?: MealsRow } | null)?.meals ?? {};
        const newMeals = { ...currentMeals } as MealsRow;

        const dayCategoriesUpgrade: Record<string, string> = {};
        let dayExcludedMainIngredientsUpgrade: string[] = [];
        const poolPicks: Record<string, { id: string; title: string } | null> = {};
        for (const mealKey of MEAL_KEYS) {
          const slot = currentMeals[mealKey];
          const hadRecipeId = slot?.recipe_id ?? null;
          const useRerankUp = isPremiumOrTrialUpgrade;
          const excludeProteinKeysForSlot =
            mealKey === "breakfast"
              ? []
              : [...excludeProteinKeysFromPrevDay, ...dayUsedProteinKeys].filter((pk) => pk !== "veg");
          const excludedMainForSlot = dayExcludedMainIngredientsUpgrade;
          let pickedRawUp = await pickFromPool(
            supabase,
            userId,
            memberId,
            mealKey,
            memberDataPool,
            usedRecipeIds,
            usedTitleKeys,
            60,
            {
              logPrefix: "[POOL UPGRADE]",
              hadRecipeId: hadRecipeId ?? undefined,
              excludeProteinKeys: excludeProteinKeysForSlot,
              proteinKeyCounts,
              debugPool,
              excludedMainIngredients: excludedMainForSlot,
              returnTopCandidates: useRerankUp ? 10 : undefined,
              preloadedCandidates: poolCandidates,
              logDiag: debugPlanUpgrade ? { requestId, dayKey, mealKey, usedTitleKeysByMealTypeSize: usedTitleKeysByMealTypeUpgrade[mealKey]?.size ?? 0 } : undefined,
            }
          );
          let picked: { id: string; title: string; categoryKey?: string } | null = null;
          const hadCandidates = pickedRawUp != null && ("topCandidates" in pickedRawUp ? (pickedRawUp.topCandidates?.length ?? 0) > 0 : "id" in pickedRawUp);
          if (pickedRawUp && "topCandidates" in pickedRawUp) {
            for (const c of pickedRawUp.topCandidates) {
              if (usedTitleKeysByMealTypeUpgrade[mealKey]?.has(c.titleKey)) continue;
              if (excludeProteinKeysForSlot.length > 0 && c.proteinKey && c.proteinKey !== "veg" && excludeProteinKeysForSlot.includes(c.proteinKey)) continue;
              if (mealKey === "breakfast" && c.categoryKey === "porridge" && breakfastPorridgeCountUpgrade >= MAX_PORRIDGE_PER_WEEK_BREAKFAST) continue;
              if (lastCategoryByMealTypeUpgrade[mealKey] === c.categoryKey) continue;
              picked = { id: c.id, title: c.title, categoryKey: c.categoryKey };
              break;
            }
          } else if (pickedRawUp && "id" in pickedRawUp) {
            picked = { id: pickedRawUp.id, title: pickedRawUp.title };
          }
          if (!picked && hadCandidates && (excludeProteinKeysForSlot.length > 0 || excludedMainForSlot.length > 0)) {
            pickedRawUp = await pickFromPool(supabase, userId, memberId, mealKey, memberDataPool, usedRecipeIds, usedTitleKeys, 60, {
              logPrefix: "[POOL UPGRADE fallback]",
              hadRecipeId: hadRecipeId ?? undefined,
              excludeProteinKeys: [],
              proteinKeyCounts,
              debugPool,
              excludedMainIngredients: [],
              returnTopCandidates: useRerankUp ? 10 : undefined,
              preloadedCandidates: poolCandidates,
            });
            if (pickedRawUp && "topCandidates" in pickedRawUp) {
              for (const c of pickedRawUp.topCandidates) {
                if (usedTitleKeysByMealTypeUpgrade[mealKey]?.has(c.titleKey)) continue;
                if (mealKey === "breakfast" && c.categoryKey === "porridge" && breakfastPorridgeCountUpgrade >= MAX_PORRIDGE_PER_WEEK_BREAKFAST) continue;
                if (lastCategoryByMealTypeUpgrade[mealKey] === c.categoryKey) continue;
                picked = { id: c.id, title: c.title, categoryKey: c.categoryKey };
                break;
              }
            } else if (pickedRawUp && "id" in pickedRawUp) {
              picked = { id: pickedRawUp.id, title: pickedRawUp.title };
            }
          }
          const needAiFallback = !picked && isPremiumOrTrialUpgrade && (pickedRawUp == null || ("topCandidates" in pickedRawUp && (pickedRawUp.topCandidates?.length ?? 0) > 0));

          if (picked) {
            poolPicks[mealKey] = { id: picked.id, title: picked.title };
            newMeals[mealKey] = {
              recipe_id: picked.id,
              title: picked.title,
              plan_source: "pool",
              ...(hadRecipeId ? { replaced_from_recipe_id: hadRecipeId } : {}),
            };
            usedRecipeIds.push(picked.id);
            usedTitleKeys.push(normalizeTitleKey(picked.title));
            usedTitleKeysByMealTypeUpgrade[mealKey].add(normalizeTitleKey(picked.title));
            const cat = picked.categoryKey ?? inferDishCategoryKey(picked.title, null, null);
            usedCategoriesByMealTypeUpgrade[mealKey].add(cat);
            dayCategoriesUpgrade[mealKey] = cat;
            if (mealKey === "breakfast" && cat === "porridge") breakfastPorridgeCountUpgrade++;
            const pk = inferProteinKey(picked.title, null);
            if (pk) {
              proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
              if (pk !== "veg") dayUsedProteinKeys.add(pk);
            }
            const mik = inferMainIngredientKey(picked.title, null, null);
            if (mik) dayExcludedMainIngredientsUpgrade.push(mik);
            replacedCount++;
            weekContext.push(picked.title);
          } else {
            if (debugPool && pickedRawUp && "topCandidates" in pickedRawUp && (pickedRawUp.topCandidates?.length ?? 0) > 0) {
              const allSkippedProtein = pickedRawUp.topCandidates.every(
                (c) => c.proteinKey && c.proteinKey !== "veg" && (dayUsedProteinKeys.has(c.proteinKey) || excludeProteinKeysFromPrevDay.includes(c.proteinKey))
              );
              if (allSkippedProtein) safeLog("[POOL UPGRADE] slot empty", { dayKey, mealKey, reason: "protein_repeat_day" });
            }
          }
          if (needAiFallback && !picked) {
            const mealLabel = mealKey === "breakfast" ? "Р·Р°РІС‚СЂР°Рє" : mealKey === "lunch" ? "РѕР±РµРґ" : mealKey === "snack" ? "РїРѕР»РґРЅРёРє" : "СѓР¶РёРЅ";
            const excludeStr = usedTitleKeys.length > 0 ? ` РќРµ РїРѕРІС‚РѕСЂСЏР№ Р±Р»СЋРґР°: ${usedTitleKeys.slice(-20).join(", ")}.` : "";
            const mainIngStr = dayExcludedMainIngredientsUpgrade.length > 0 ? ` Р’ СЌС‚РѕС‚ РґРµРЅСЊ СѓР¶Рµ РµСЃС‚СЊ: ${[...new Set(dayExcludedMainIngredientsUpgrade)].join(", ")} вЂ” РЅРµ РёСЃРїРѕР»СЊР·СѓР№.` : "";
            const proteinStr = excludeProteinKeysForSlot.length > 0 ? ` Р’С‡РµСЂР° СѓР¶Рµ Р±С‹Р» СЌС‚РѕС‚ РїСЂРёС‘Рј СЃ: ${excludeProteinKeysForSlot.join(", ")} вЂ” РґСЂСѓРіРѕР№ Р±РµР»РѕРє.` : "";
            const lunchHint = mealKey === "lunch" ? " Р”Р»СЏ РѕР±РµРґР° РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРѕ РїРµСЂРІРѕРµ Р±Р»СЋРґРѕ (СЃСѓРї/Р±СѓР»СЊРѕРЅ/РєСЂРµРј-СЃСѓРї)." : "";
            const slotForbidden: Record<string, string> = {
              breakfast: "СЃСѓРїС‹, СЂР°РіСѓ, РїР»РѕРІ. РўРѕР»СЊРєРѕ Р·Р°РІС‚СЂР°РєРё: РєР°С€Рё, РѕРјР»РµС‚С‹, СЃС‹СЂРЅРёРєРё, С‚РѕСЃС‚С‹.",
              lunch: "СЃС‹СЂРЅРёРєРё, РѕР»Р°РґСЊРё, РєР°С€Сѓ. РўРѕР»СЊРєРѕ РѕР±РµРґС‹: СЃСѓРїС‹, РІС‚РѕСЂС‹Рµ Р±Р»СЋРґР°.",
              snack: "СЃСѓРїС‹, СЂР°РіСѓ, РєР°С€Рё. РўРѕР»СЊРєРѕ РїРµСЂРµРєСѓСЃС‹: С„СЂСѓРєС‚С‹, РїРµС‡РµРЅСЊРµ, СЃРјСѓР·Рё.",
              dinner: "Р№РѕРіСѓСЂС‚, С‚РІРѕСЂРѕРі, РґРѕР»СЊРєРё, РїРµС‡РµРЅСЊРµ РєР°Рє РµРґРёРЅСЃС‚РІРµРЅРЅРѕРµ. РўРѕР»СЊРєРѕ СѓР¶РёРЅС‹: РІС‚РѕСЂС‹Рµ Р±Р»СЋРґР°.",
            };
            const allergyHintUp = allergyTokens.length > 0 ? " РЎРўР РћР“Рћ Р±РµР· РјРѕР»РѕС‡РЅС‹С…: РјРѕР»РѕРєРѕ, С‚РІРѕСЂРѕРі, Р№РѕРіСѓСЂС‚, СЃС‹СЂ, РєРµС„РёСЂ, СЃР»РёРІРєРё, СЃРјРµС‚Р°РЅР°. " : "";
            const aiResUp = await fetchWithRetry(
              deepseekUrlUpgrade,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: authHeader },
                body: JSON.stringify({
                  type: "recipe",
                  stream: false,
                  from_plan_replace: true,
                  memberData: memberData ?? undefined,
                  mealType: mealKey,
                  messages: [{ role: "user", content: `РЎРіРµРЅРµСЂРёСЂСѓР№ РѕРґРёРЅ СЂРµС†РµРїС‚ РґР»СЏ ${mealLabel}.${excludeStr}${mainIngStr}${proteinStr} ${slotForbidden[mealKey] ?? ""}.${lunchHint}${allergyHintUp} РРЅРіСЂРµРґРёРµРЅС‚С‹: РєР°Р¶РґС‹Р№ СЃ РєРѕР»РёС‡РµСЃС‚РІРѕРј Рё РµРґРёРЅРёС†РµР№ (Рі, РјР», С€С‚., СЃС‚.Р»., С‡.Р».). Р’РµСЂРЅРё С‚РѕР»СЊРєРѕ JSON.` }],
                }),
              },
              { timeoutMs: FETCH_TIMEOUT_MS, retries: 1 }
            );
            if (aiResUp.ok) {
              const aiDataUp = (await aiResUp.json()) as { message?: string; recipes?: Array<{ title?: string; ingredients?: Array<{ name?: string; amount?: string }>; steps?: string[] }> };
              const firstUp = Array.isArray(aiDataUp.recipes) && aiDataUp.recipes.length > 0 ? aiDataUp.recipes[0] : null;
              let titleUp = firstUp?.title ?? (typeof aiDataUp.message === "string" ? aiDataUp.message.slice(0, 100) : "Р РµС†РµРїС‚");
              let ingredientsUp: Array<{ name: string; amount: string }> = [];
              let stepsUp: string[] = [];
              if (typeof aiDataUp.message === "string") {
                const jsonStrUp = extractFirstJsonObject(aiDataUp.message);
                if (jsonStrUp) {
                  try {
                    const parsedUp = JSON.parse(jsonStrUp) as { title?: string; ingredients?: Array<{ name?: string; amount?: string }>; steps?: string[] };
                    titleUp = parsedUp.title ?? titleUp;
                    ingredientsUp = (parsedUp.ingredients ?? []).map((ing) =>
                      typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
                    );
                    stepsUp = (parsedUp.steps ?? []).filter(Boolean).map((s) => String(s));
                  } catch {
                    if (firstUp) {
                      ingredientsUp = (firstUp.ingredients ?? []).map((ing) => (typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }));
                      stepsUp = (firstUp.steps ?? []).filter(Boolean).map((s) => String(s));
                    }
                  }
                } else if (firstUp) {
                  ingredientsUp = (firstUp.ingredients ?? []).map((ing) => (typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }));
                  stepsUp = (firstUp.steps ?? []).filter(Boolean).map((s) => String(s));
                }
              } else if (firstUp) {
                ingredientsUp = (firstUp.ingredients ?? []).map((ing) => (typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }));
                stepsUp = (firstUp.steps ?? []).filter(Boolean).map((s) => String(s));
              }
              const failUp = validateAiMeal(titleUp, ingredientsUp, stepsUp, mealKey, memberDataPool);
              if (!failUp) {
                while (stepsUp.length < 3) stepsUp.push(`РЁР°Рі ${stepsUp.length + 1}`);
                while (ingredientsUp.length < 3) ingredientsUp.push({ name: `РРЅРіСЂРµРґРёРµРЅС‚ ${ingredientsUp.length + 1}`, amount: "" });
                const payloadUp = canonicalizeRecipePayload({
                  user_id: userId,
                  member_id: memberId,
                  child_id: memberId,
                  source: "week_ai",
                  contextMealType: mealKey,
                  title: titleUp,
                  description: "",
                  cooking_time_minutes: null,
                  chef_advice: null,
                  advice: null,
                  steps: stepsUp.slice(0, 7).map((instruction, idx) => ({ instruction, step_number: idx + 1 })),
                  ingredients: ingredientsUp.slice(0, 20).map((ing, idx) => ({
                    name: ing.name,
                    display_text: ing.amount ? `${ing.name} вЂ” ${ing.amount}` : ing.name,
                    amount: null,
                    unit: null,
                    order_index: idx,
                    category: "other",
                  })),
                  sourceTag: "plan",
                });
                const { data: recipeIdUp, error: rpcErrUp } = await supabase.rpc("create_recipe_with_steps", { payload: payloadUp });
                if (!rpcErrUp && recipeIdUp) {
                  newMeals[mealKey] = { recipe_id: recipeIdUp, title: titleUp, plan_source: "ai" };
                  usedRecipeIds.push(recipeIdUp);
                  usedTitleKeys.push(normalizeTitleKey(titleUp));
                  usedTitleKeysByMealTypeUpgrade[mealKey].add(normalizeTitleKey(titleUp));
                  const catUp = inferDishCategoryKey(titleUp, null, null);
                  usedCategoriesByMealTypeUpgrade[mealKey].add(catUp);
                  dayCategoriesUpgrade[mealKey] = catUp;
                  if (mealKey === "breakfast" && catUp === "porridge") breakfastPorridgeCountUpgrade++;
                  const pkUp = inferProteinKey(titleUp, null);
                  if (pkUp) proteinKeyCounts[pkUp] = (proteinKeyCounts[pkUp] ?? 0) + 1;
                  const mikUp = inferMainIngredientKey(titleUp, null, null);
                  if (mikUp) dayExcludedMainIngredientsUpgrade.push(mikUp);
                  aiFallbackCount++;
                  replacedCount++;
                  weekContext.push(titleUp);
                }
              }
            }
            if (!poolPicks[mealKey] && !newMeals[mealKey]?.recipe_id) {
              unchangedCount++;
              if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
              if (slot?.title) {
                usedTitleKeys.push(normalizeTitleKey(slot.title));
                const pk = inferProteinKey(slot.title, null);
                if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
                const mik = inferMainIngredientKey(slot.title, null, null);
                if (mik) dayExcludedMainIngredientsUpgrade.push(mik);
                weekContext.push(slot.title);
              }
            }
          } else if (!picked) {
            unchangedCount++;
            if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
            if (slot?.title) {
              usedTitleKeys.push(normalizeTitleKey(slot.title));
              const pk = inferProteinKey(slot.title, null);
              if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
              const mik = inferMainIngredientKey(slot.title, null, null);
              if (mik) dayExcludedMainIngredientsUpgrade.push(mik);
              weekContext.push(slot.title);
            }
          }
        }
        lastCategoryByMealTypeUpgrade = { ...dayCategoriesUpgrade };

        if (debugPool && MEAL_KEYS.some((k) => !poolPicks[k] && !currentMeals[k]?.recipe_id)) {
          safeLog("[POOL UPGRADE] slots left empty or filled by AI", { dayKey, emptySlots: MEAL_KEYS.filter((k) => !newMeals[k]?.recipe_id) });
        }

        const upsertResult = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals, { runControlSelect: debugPlanUpgrade, debugPlan: debugPlanUpgrade });
        if (upsertResult.error) {
          safeWarn("[POOL UPGRADE] meal_plans_v2 upsert failed", dayKey, upsertResult.error);
        }
        if (debugPlanUpgrade && upsertResult.mergedEmpty) {
          const picksThisDay = MEAL_KEYS.filter((k) => poolPicks[k]).length;
          safeWarn("[POOL UPGRADE] merged_empty_meals", { dayKey, memberId: memberId ?? "null", picksThisDay });
        }
        const filledThisDay = MEAL_KEYS.filter((k) => newMeals[k]?.recipe_id).length;
        filledSlotsCountUpgrade += filledThisDay;
        if (filledThisDay > 0) filledDaysCountUpgrade++;
        if (debugPlanUpgrade) {
          const filledKeys = MEAL_KEYS.filter((k) => newMeals[k]?.recipe_id);
          const dayProteinKeys = filledKeys.map((k) => inferProteinKey(newMeals[k]?.title, null)).filter(Boolean);
          safeLog("[POOL UPGRADE] day", { dayKey, filledKeys, dayProteinKeys });
        }
      }

      const totalSlots = dayKeys.length * MEAL_KEYS.length;
      const assignedCount = replacedCount;
      const emptySlotsCountUpgrade = totalSlots - filledSlotsCountUpgrade;
      const emptyDaysCountUpgrade = dayKeys.length - filledDaysCountUpgrade;
      const partialUpgrade = emptySlotsCountUpgrade > 0;
      if (debugPlanUpgrade) {
        safeLog("[WEEK DONE]", { requestId, ms: Date.now() - startedAt, filledDaysCount: filledDaysCountUpgrade, filledSlotsCount: filledSlotsCountUpgrade });
      }
      if (debugPool) {
        safeLog("[POOL UPGRADE] totals", { totalSlots, replacedCount: assignedCount, unchangedCount, aiFallbackCount, filledSlotsCountUpgrade, filledDaysCountUpgrade });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          replacedCount: assignedCount,
          unchangedCount,
          aiFallbackCount,
          totalSlots,
          assignedCount,
          filledSlotsCount: filledSlotsCountUpgrade,
          emptySlotsCount: emptySlotsCountUpgrade,
          filledDaysCount: filledDaysCountUpgrade,
          emptyDaysCount: emptyDaysCountUpgrade,
          partial: partialUpgrade,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "start") {
      const existing = await supabase
        .from("plan_generation_jobs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("member_id", memberId)
        .eq("type", type)
        .eq("status", "running")
        .maybeSingle();
      if (existing.data?.id) {
        return new Response(
          JSON.stringify({ job_id: existing.data.id, status: "running" }),
          { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: job, error: jobInsertError } = await supabase
        .from("plan_generation_jobs")
        .insert({
          user_id: userId,
          member_id: memberId,
          type,
          status: "running",
          progress_total: dayKeys.length,
          progress_done: 0,
        })
        .select("id")
        .single();
      if (jobInsertError || !job?.id) {
        safeError("generate-plan job insert", jobInsertError?.message);
        return new Response(
          JSON.stringify({ error: "job_insert_failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ job_id: job.id, status: "running" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "run": require job_id, verify ownership, then run generation
    const runJobId = typeof body.job_id === "string" ? body.job_id : null;
    if (!runJobId) {
      return new Response(
        JSON.stringify({ error: "job_id_required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: runJob, error: runJobErr } = await supabase
      .from("plan_generation_jobs")
      .select("id, user_id, status")
      .eq("id", runJobId)
      .single();
    if (runJobErr || !runJob || runJob.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (runJob.status !== "running") {
      return new Response(
        JSON.stringify({ job_id: runJobId, status: runJob.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = runJobId;
    const deepseekUrl = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/deepseek-chat";
    let weekContext: string[] = [];
    let lastDayKey: string | null = null;

    const memberDataPool: MemberDataPool | null = memberData
      ? { allergies: memberData.allergies ?? [], preferences: memberData.preferences ?? [], age_months: memberData.age_months }
      : null;

    const { data: profileRow } = await supabase
      .from("profiles_v2")
      .select("status, premium_until, trial_until")
      .eq("user_id", userId)
      .maybeSingle();
    const prof = profileRow as { status?: string; premium_until?: string | null; trial_until?: string | null } | null;
    const hasPremium = prof?.premium_until && new Date(prof.premium_until) > new Date();
    const hasTrial = prof?.trial_until && new Date(prof.trial_until) > new Date();
    const isPremiumOrTrial = prof?.status === "premium" || prof?.status === "trial" || hasPremium || hasTrial;

    let usedRecipeIds: string[] = [];
    let usedTitleKeys: string[] = [];
    let usedTitleKeysByMealType: Record<string, Set<string>> = {};
    for (const k of MEAL_KEYS) usedTitleKeysByMealType[k] = new Set<string>();
    let usedCategoriesByMealType: Record<string, Set<string>> = {};
    for (const k of MEAL_KEYS) usedCategoriesByMealType[k] = new Set<string>();
    let breakfastPorridgeCount = 0;
    let lastCategoryByMealType: Record<string, string> = {};
    const proteinKeyCounts: Record<string, number> = {};
    const rejectsByReason: Record<string, number> = {};
    let totalDbCount = 0;
    let totalAiCount = 0;
    const weekStats = { candidatesSeen: 0 };
    let totalSlotsProcessed = 0;
    let totalRejectedBySanity = 0;
    let totalRejectedByAllergy = 0;
    let totalRejectedByMealType = 0;
    let totalRejectedByProteinDiversity = 0;
    const slotDiagnostics: Record<string, unknown>[] = [];
    if (dayKeys.length > 0) {
      let weekQ = supabase
        .from("meal_plans_v2")
        .select("planned_date, meals")
        .eq("user_id", userId)
        .gte("planned_date", dayKeys[0])
        .lte("planned_date", dayKeys[dayKeys.length - 1]);
      if (memberId == null) weekQ = weekQ.is("member_id", null);
      else weekQ = weekQ.eq("member_id", memberId);
      const { data: weekRows } = await weekQ;
      (weekRows ?? []).forEach((row: { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }) => {
        const meals = row.meals ?? {};
        MEAL_KEYS.forEach((k) => {
          const slot = meals[k];
          if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
          if (slot?.title) {
            usedTitleKeys.push(normalizeTitleKey(slot.title));
            const pk = inferProteinKey(slot.title, null);
            if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
          }
        });
      });
      const last4Keys = getLastNDaysKeys(dayKeys[0], 4);
      const { recipeIds: prev4RecipeIds, titleKeys: prev4TitleKeys } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, memberId, last4Keys);
      usedRecipeIds = [...usedRecipeIds, ...prev4RecipeIds];
      usedTitleKeys = [...usedTitleKeys, ...prev4TitleKeys];
      const last4TitleKeysByMealType = await fetchTitleKeysByMealTypeFromPlans(supabase, userId, memberId, last4Keys);
      for (const k of MEAL_KEYS) usedTitleKeysByMealType[k] = new Set([...(usedTitleKeysByMealType[k] ?? []), ...(last4TitleKeysByMealType[k] ?? [])]);
      (weekRows ?? []).forEach((row: { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }) => {
        const meals = row.meals ?? {};
        MEAL_KEYS.forEach((k) => {
          const title = meals[k]?.title;
          if (title) {
            usedTitleKeysByMealType[k].add(normalizeTitleKey(title));
            const cat = inferDishCategoryKey(title, null, null);
            usedCategoriesByMealType[k].add(cat);
            if (k === "breakfast" && cat === "porridge") breakfastPorridgeCount++;
          }
        });
      });
      const last4CategoriesByMealType = await fetchCategoriesByMealTypeFromPlans(supabase, userId, memberId, last4Keys);
      for (const k of MEAL_KEYS) {
        usedCategoriesByMealType[k] = new Set([...(usedCategoriesByMealType[k] ?? []), ...(last4CategoriesByMealType[k] ?? [])]);
      }
      let qLast4 = supabase.from("meal_plans_v2").select("meals").eq("user_id", userId).in("planned_date", last4Keys);
      if (memberId == null) qLast4 = qLast4.is("member_id", null);
      else qLast4 = qLast4.eq("member_id", memberId);
      const { data: last4Rows } = await qLast4;
      (last4Rows ?? []).forEach((row: { meals?: Record<string, { title?: string }> }) => {
        const title = row.meals?.breakfast?.title;
        if (title && inferDishCategoryKey(title, null, null) === "porridge") breakfastPorridgeCount++;
      });
    }

    const allergyTokens = getAllergyTokens(memberDataPool);
    const allergyWeekHint =
      allergyTokens.length > 0
        ? " РЎРўР РћР“Рћ Р‘Р•Р— РњРћР›РћР§РќР«РҐ РџР РћР”РЈРљРўРћР’: РјРѕР»РѕРєРѕ, С‚РІРѕСЂРѕРі, Р№РѕРіСѓСЂС‚, СЃС‹СЂ, РєРµС„РёСЂ, СЃР»РёРІРєРё, СЃРјРµС‚Р°РЅР°, РјР°СЃР»Рѕ, СЂСЏР¶РµРЅРєР°, РјРѕСЂРѕР¶РµРЅРѕРµ, СЃРіСѓС‰РµРЅРєР°. "
        : "";

    const poolCandidatesRun = await fetchPoolCandidates(supabase, userId, memberId, 120);
    const jobStartedAt = Date.now();
    const BUDGET_MS_RUN = 25000;
    const runDebug = body.debug_pool ?? (typeof Deno !== "undefined" && Deno.env?.get?.("GENERATE_PLAN_DEBUG") === "1");
    let filledSlotsCountRun = 0;

    for (let i = 0; i < dayKeys.length; i++) {
      if (Date.now() - jobStartedAt > BUDGET_MS_RUN) {
        const totalSlotsRun = dayKeys.length * MEAL_KEYS.length;
        const emptySlotsRun = totalSlotsRun - filledSlotsCountRun;
        const filledDaysRun = Math.floor(filledSlotsCountRun / MEAL_KEYS.length);
        const emptyDaysRun = dayKeys.length - filledDaysRun;
        await supabase
          .from("plan_generation_jobs")
          .update({
            status: "done",
            error_text: "partial:time_budget",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            progress_done: filledDaysRun,
            progress_total: dayKeys.length,
          })
          .eq("id", jobId);
        if (runDebug) safeLog("[JOB] time_budget partial", { filledSlotsCountRun, totalSlotsRun, filledDaysRun });
        return new Response(
          JSON.stringify({
            ok: true,
            partial: true,
            reason: "time_budget",
            job_id: jobId,
            status: "done",
            totalSlots: totalSlotsRun,
            filledSlotsCount: filledSlotsCountRun,
            emptySlotsCount: emptySlotsRun,
            filledDaysCount: filledDaysRun,
            emptyDaysCount: emptyDaysRun,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const dayKey = dayKeys[i];
      const dayName = getDayName(dayKey);
      lastDayKey = dayKey;
      const prevDayKey = i > 0 ? dayKeys[i - 1] : null;
      const dayStartAt = Date.now();
      if (runDebug) safeLog("[JOB] day start", { dayKey, index: i + 1, total: dayKeys.length });
      let excludeProteinKeysFromPrevDay: string[] = [];
      if (prevDayKey) {
        const prevDateRow = await supabase
          .from("meal_plans_v2")
          .select("meals")
          .eq("user_id", userId)
          .eq("planned_date", prevDayKey)
          .is("member_id", memberId)
          .maybeSingle();
        const prevMeals = (prevDateRow.data as { meals?: Record<string, { title?: string }> } | null)?.meals ?? {};
        for (const k of MEAL_KEYS) {
          const pk = inferProteinKey(prevMeals[k]?.title, null);
          if (pk && pk !== "veg") excludeProteinKeysFromPrevDay.push(pk);
        }
      }
      const dayUsedProteinKeys = new Set<string>();

      await supabase
        .from("plan_generation_jobs")
        .update({ progress_done: i, last_day_key: dayKey, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      const poolPicks: Record<string, { id: string; title: string } | null> = {};
      const dayCategories: Record<string, string> = {};
      const totalSlotsForWeek = dayKeys.length * MEAL_KEYS.length;
      const filledSlotsSoFar = i * MEAL_KEYS.length;
      const adaptiveParams: AdaptiveParams = {};
      if (totalSlotsProcessed >= 4 && totalSlotsProcessed > 0) {
        const poolRate = totalDbCount / totalSlotsProcessed;
        if (poolRate < 0.3) adaptiveParams.softenProtein = true;
      }
      if ((rejectsByReason.allergy ?? 0) > 0) adaptiveParams.allergyPenalty = -200;
      let dayExcludedMainIngredients: string[] = [];
      for (const mealKey of MEAL_KEYS) {
        const slotStats: Record<string, unknown> = {};
        const useRerank = isPremiumOrTrial;
        const excludeProteinKeysForSlotRun =
          mealKey === "breakfast"
            ? []
            : [...excludeProteinKeysFromPrevDay, ...dayUsedProteinKeys].filter((pk) => pk !== "veg");
        const excludedMainForSlotRun = dayExcludedMainIngredients;
        let pickedRaw = await pickFromPool(
          supabase,
          userId,
          memberId,
          mealKey,
          memberDataPool,
          usedRecipeIds,
          usedTitleKeys,
          60,
          {
            excludeProteinKeys: excludeProteinKeysForSlotRun,
            proteinKeyCounts,
            excludedMainIngredients: excludedMainForSlotRun,
            debugPool,
            adaptiveParams,
            weekProgress: { filled: filledSlotsSoFar, total: totalSlotsForWeek },
            debugSlotStats: debugPool ? slotStats : undefined,
            weekStats: debugPool ? weekStats : undefined,
            returnTopCandidates: useRerank ? 10 : undefined,
            preloadedCandidates: poolCandidatesRun,
          }
        );
        let picked: { id: string; title: string; categoryKey?: string } | null = null;
        let qualityGateReason: string | undefined;
        const hadCandidatesRun = pickedRaw != null && ("topCandidates" in pickedRaw ? (pickedRaw.topCandidates?.length ?? 0) > 0 : "id" in pickedRaw);
        if (pickedRaw && "topCandidates" in pickedRaw) {
          const { topCandidates } = pickedRaw;
          for (const c of topCandidates) {
            if (usedTitleKeysByMealType[mealKey]?.has(c.titleKey)) {
              qualityGateReason = "title_repeat";
              continue;
            }
            if (excludeProteinKeysForSlotRun.length > 0 && c.proteinKey && c.proteinKey !== "veg" && excludeProteinKeysForSlotRun.includes(c.proteinKey)) {
              qualityGateReason = "protein_streak";
              continue;
            }
            if (mealKey === "breakfast" && c.categoryKey === "porridge" && breakfastPorridgeCount >= MAX_PORRIDGE_PER_WEEK_BREAKFAST) {
              qualityGateReason = "porridge_cap";
              continue;
            }
            if (lastCategoryByMealType[mealKey] === c.categoryKey) {
              qualityGateReason = "category_streak";
              continue;
            }
            picked = { id: c.id, title: c.title, categoryKey: c.categoryKey };
            break;
          }
        } else if (pickedRaw && "id" in pickedRaw) {
          picked = { id: pickedRaw.id, title: pickedRaw.title };
        }
        if (!picked && hadCandidatesRun && (excludeProteinKeysForSlotRun.length > 0 || excludedMainForSlotRun.length > 0)) {
          pickedRaw = await pickFromPool(supabase, userId, memberId, mealKey, memberDataPool, usedRecipeIds, usedTitleKeys, 60, {
            excludeProteinKeys: [],
            proteinKeyCounts,
            excludedMainIngredients: [],
            debugPool,
            adaptiveParams,
            weekProgress: { filled: filledSlotsSoFar, total: totalSlotsForWeek },
            debugSlotStats: debugPool ? slotStats : undefined,
            weekStats: debugPool ? weekStats : undefined,
            returnTopCandidates: useRerank ? 10 : undefined,
            preloadedCandidates: poolCandidatesRun,
          });
          if (pickedRaw && "topCandidates" in pickedRaw) {
            for (const c of pickedRaw.topCandidates) {
              if (usedTitleKeysByMealType[mealKey]?.has(c.titleKey)) continue;
              if (mealKey === "breakfast" && c.categoryKey === "porridge" && breakfastPorridgeCount >= MAX_PORRIDGE_PER_WEEK_BREAKFAST) continue;
              if (lastCategoryByMealType[mealKey] === c.categoryKey) continue;
              picked = { id: c.id, title: c.title, categoryKey: c.categoryKey };
              break;
            }
          } else if (pickedRaw && "id" in pickedRaw) {
            picked = { id: pickedRaw.id, title: pickedRaw.title };
          }
        }
        const qualityGateTriggered = !!pickedRaw && "topCandidates" in pickedRaw && !picked && (pickedRaw.topCandidates?.length ?? 0) > 0;
        poolPicks[mealKey] = picked ? { id: picked.id, title: picked.title } : null;
        if (debugPool && Object.keys(slotStats).length > 0) {
          slotDiagnostics.push({
            ...slotStats,
            wasRecoveredFromTitle: slotStats.mealTypeRecoveredFromTitle,
            qualityGateTriggered: qualityGateTriggered || undefined,
            qualityGateReason: qualityGateReason ?? undefined,
            breakfastPorridgeCount,
            usedCategoriesByMealType: Object.fromEntries(Object.entries(usedCategoriesByMealType).map(([k, s]) => [k, s.size])),
          });
        }
        if (picked) {
          usedRecipeIds.push(picked.id);
          usedTitleKeys.push(normalizeTitleKey(picked.title));
          usedTitleKeysByMealType[mealKey].add(normalizeTitleKey(picked.title));
          const cat = picked.categoryKey ?? inferDishCategoryKey(picked.title, null, null);
          usedCategoriesByMealType[mealKey].add(cat);
          dayCategories[mealKey] = cat;
          if (mealKey === "breakfast" && cat === "porridge") breakfastPorridgeCount++;
          const pk = inferProteinKey(picked.title, null);
          if (pk) {
            proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
            if (pk !== "veg") dayUsedProteinKeys.add(pk);
          }
          const mainKey = inferMainIngredientKey(picked.title, null, null);
          if (mainKey) dayExcludedMainIngredients = [...dayExcludedMainIngredients, mainKey];
        } else {
          if (runDebug && pickedRaw && "topCandidates" in pickedRaw && (pickedRaw.topCandidates?.length ?? 0) > 0) {
            const allSkippedProtein = pickedRaw.topCandidates.every(
              (c) => c.proteinKey && c.proteinKey !== "veg" && (dayUsedProteinKeys.has(c.proteinKey) || excludeProteinKeysFromPrevDay.includes(c.proteinKey))
            );
            if (allSkippedProtein) safeLog("[JOB] slot empty", { dayKey, mealKey, reason: "protein_repeat_day" });
          }
          if (runDebug) {
            safeLog("[JOB] pool_exhausted_free_or_premium_fallback", {
              dayKey,
              mealKey,
              isPremiumOrTrial,
              reason: qualityGateTriggered ? "quality_gate" : "pool_exhausted_free",
              qualityGateReason: qualityGateReason ?? undefined,
              aiFallbackTriggered: qualityGateTriggered && isPremiumOrTrial,
            });
          }
        }
      }
      lastCategoryByMealType = { ...dayCategories };
      totalSlotsProcessed += MEAL_KEYS.length;

      let dayDbCount = 0;
      let dayAiCount = 0;
      const existingRow = await supabase
        .from("meal_plans_v2")
        .select("id, meals")
        .eq("user_id", userId)
        .eq("planned_date", dayKey)
        .is("member_id", memberId)
        .maybeSingle();
      const currentMeals = (existingRow.data as { meals?: Record<string, { recipe_id?: string; title?: string; plan_source?: "pool" | "ai" }> } | null)?.meals ?? {};
      const newMeals = { ...currentMeals };

      for (const mealKey of MEAL_KEYS) {
        const fromPool = poolPicks[mealKey];
        if (fromPool) {
          newMeals[mealKey] = { recipe_id: fromPool.id, title: fromPool.title, plan_source: "pool" };
          dayDbCount++;
          totalDbCount++;
          weekContext.push(fromPool.title);
          continue;
        }
        if (!isPremiumOrTrial) {
          if (runDebug) safeLog("[JOB] pool_exhausted_free", { dayKey, mealKey, reason: "pool_exhausted_free" });
          continue;
        }
        const mealLabel = mealKey === "breakfast" ? "Р·Р°РІС‚СЂР°Рє" : mealKey === "lunch" ? "РѕР±РµРґ" : mealKey === "snack" ? "РїРѕР»РґРЅРёРє" : "СѓР¶РёРЅ";
        const excludeStr = usedTitleKeys.length > 0 ? ` РќРµ РїРѕРІС‚РѕСЂСЏР№ Р±Р»СЋРґР°: ${usedTitleKeys.slice(-20).join(", ")}.` : "";
        const mainIngredientExcludeStr =
          dayExcludedMainIngredients.length > 0 ? ` Р’ СЌС‚РѕС‚ РґРµРЅСЊ СѓР¶Рµ РµСЃС‚СЊ Р±Р»СЋРґР° СЃ: ${[...new Set(dayExcludedMainIngredients)].join(", ")} вЂ” РЅРµ РёСЃРїРѕР»СЊР·СѓР№ РёС….` : "";
        const proteinExcludeStr = excludeProteinKeysForSlotRun.length > 0 ? ` Р’С‡РµСЂР° СѓР¶Рµ Р±С‹Р» СЌС‚РѕС‚ РїСЂРёС‘Рј СЃ: ${excludeProteinKeysForSlotRun.join(", ")} вЂ” РїСЂРµРґР»РѕР¶Рё РґСЂСѓРіРѕР№ Р±РµР»РѕРє.` : "";
        const slotForbidden: Record<string, string> = {
          breakfast: "СЃСѓРїС‹, СЂР°РіСѓ, РїР»РѕРІ. РўРѕР»СЊРєРѕ Р·Р°РІС‚СЂР°РєРё: РєР°С€Рё, РѕРјР»РµС‚С‹, СЃС‹СЂРЅРёРєРё, С‚РѕСЃС‚С‹.",
          lunch: "СЃС‹СЂРЅРёРєРё, РѕР»Р°РґСЊРё, РєР°С€Сѓ. РўРѕР»СЊРєРѕ РѕР±РµРґС‹: СЃСѓРїС‹, РІС‚РѕСЂС‹Рµ Р±Р»СЋРґР°.",
          snack: "СЃСѓРїС‹, СЂР°РіСѓ, РєР°С€Рё. РўРѕР»СЊРєРѕ РїРµСЂРµРєСѓСЃС‹: С„СЂСѓРєС‚С‹, РїРµС‡РµРЅСЊРµ, СЃРјСѓР·Рё.",
          dinner: "Р№РѕРіСѓСЂС‚, С‚РІРѕСЂРѕРі, РґРѕР»СЊРєРё, РїРµС‡РµРЅСЊРµ РєР°Рє РµРґРёРЅСЃС‚РІРµРЅРЅРѕРµ. РўРѕР»СЊРєРѕ СѓР¶РёРЅС‹: РІС‚РѕСЂС‹Рµ Р±Р»СЋРґР°.",
        };
        const lunchSoupHint =
          mealKey === "lunch"
            ? " Р”Р»СЏ РѕР±РµРґР° РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРѕ РїРµСЂРІРѕРµ Р±Р»СЋРґРѕ (СЃСѓРї/Р±СѓР»СЊРѕРЅ/РєСЂРµРј-СЃСѓРї), РµСЃР»Рё РЅРµ РєРѕРЅС„Р»РёРєС‚СѓРµС‚ СЃ Р°Р»Р»РµСЂРіРёСЏРјРё/РїСЂРµРґРїРѕС‡С‚РµРЅРёСЏРјРё."
            : "";
        const allergyHint = allergyTokens.length > 0 ? " РЎРўР РћР“Рћ Р±РµР· РјРѕР»РѕС‡РЅС‹С…: РјРѕР»РѕРєРѕ, С‚РІРѕСЂРѕРі, Р№РѕРіСѓСЂС‚, СЃС‹СЂ, РєРµС„РёСЂ, СЃР»РёРІРєРё, СЃРјРµС‚Р°РЅР°. " : "";
        const aiRes = await fetchWithRetry(
          deepseekUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              type: "recipe",
              stream: false,
              from_plan_replace: true,
              memberData: memberData ?? undefined,
              mealType: mealKey,
              messages: [{ role: "user", content: `РЎРіРµРЅРµСЂРёСЂСѓР№ РѕРґРёРЅ СЂРµС†РµРїС‚ РґР»СЏ ${mealLabel}.${excludeStr}${mainIngredientExcludeStr}${proteinExcludeStr} ${slotForbidden[mealKey] ?? ""}.${lunchSoupHint}${allergyHint} РРЅРіСЂРµРґРёРµРЅС‚С‹: РєР°Р¶РґС‹Р№ СЃ РєРѕР»РёС‡РµСЃС‚РІРѕРј Рё РµРґРёРЅРёС†РµР№ (Рі, РјР», С€С‚., СЃС‚.Р»., С‡.Р».). Р’РµСЂРЅРё С‚РѕР»СЊРєРѕ JSON.` }],
            }),
          },
          { timeoutMs: FETCH_TIMEOUT_MS, retries: 1 }
        );
        if (!aiRes.ok) {
          safeWarn("[JOB] AI fallback failed for slot", dayKey, mealKey, aiRes.status);
          continue;
        }
        const aiData = (await aiRes.json()) as { message?: string; recipes?: Array<{ title?: string; ingredients?: Array<{ name?: string; amount?: string }>; steps?: string[] }> };
        const firstRecipe = Array.isArray(aiData.recipes) && aiData.recipes.length > 0 ? aiData.recipes[0] : null;
        let title = firstRecipe?.title ?? (typeof aiData.message === "string" ? aiData.message.slice(0, 100) : "Р РµС†РµРїС‚");
        let ingredients: Array<{ name: string; amount: string }> = [];
        let steps: string[] = [];
        if (typeof aiData.message === "string") {
          const jsonStr = extractFirstJsonObject(aiData.message);
          if (jsonStr) {
            try {
              const parsed = JSON.parse(jsonStr) as { title?: string; ingredients?: Array<{ name?: string; amount?: string }>; steps?: string[] };
              title = parsed.title ?? title;
              ingredients = (parsed.ingredients ?? []).map((ing) =>
                typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
              );
              steps = (parsed.steps ?? []).filter(Boolean).map((s) => String(s));
            } catch {
              if (firstRecipe) {
                ingredients = (firstRecipe.ingredients ?? []).map((ing) =>
                  typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
                );
                steps = (firstRecipe.steps ?? []).filter(Boolean).map((s) => String(s));
              }
            }
          } else if (firstRecipe) {
            ingredients = (firstRecipe.ingredients ?? []).map((ing) =>
              typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
            );
            steps = (firstRecipe.steps ?? []).filter(Boolean).map((s) => String(s));
          }
        } else if (firstRecipe) {
          ingredients = (firstRecipe.ingredients ?? []).map((ing) =>
            typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
          );
          steps = (firstRecipe.steps ?? []).filter(Boolean).map((s) => String(s));
        }
        const failReason = validateAiMeal(title, ingredients, steps, mealKey, memberDataPool);
        if (failReason) {
          rejectsByReason[failReason] = (rejectsByReason[failReason] ?? 0) + 1;
          continue;
        }
        while (steps.length < 3) steps.push(`РЁР°Рі ${steps.length + 1}`);
        while (ingredients.length < 3) ingredients.push({ name: `РРЅРіСЂРµРґРёРµРЅС‚ ${ingredients.length + 1}`, amount: "" });
        const description = getDescriptionWithFallback({ description: (firstRecipe as { description?: string })?.description, intro: (firstRecipe as { intro?: string })?.intro, steps });
        const payload = canonicalizeRecipePayload({
          user_id: userId,
          member_id: memberId,
          child_id: memberId,
          source: "week_ai",
          contextMealType: mealKey,
          title,
          description: description || null,
          cooking_time_minutes: null,
          chef_advice: null,
          advice: null,
          steps: steps.slice(0, 7).map((instruction, idx) => ({ instruction, step_number: idx + 1 })),
          ingredients: ingredients.slice(0, 20).map((ing, idx) => ({
            name: ing.name,
            display_text: ing.amount ? `${ing.name} вЂ” ${ing.amount}` : ing.name,
            amount: null,
            unit: null,
            order_index: idx,
            category: "other",
          })),
          sourceTag: "week_ai",
        });
        const { data: recipeId, error: rpcErr } = await supabase.rpc("create_recipe_with_steps", { payload });
        if (rpcErr || !recipeId) {
          safeWarn("[JOB] AI fallback create_recipe failed", dayKey, mealKey, rpcErr?.message);
          continue;
        }
        newMeals[mealKey] = { recipe_id: recipeId, title, plan_source: "ai" };
        dayAiCount++;
        totalAiCount++;
        usedRecipeIds.push(recipeId);
        usedTitleKeys.push(normalizeTitleKey(title));
        usedTitleKeysByMealType[mealKey].add(normalizeTitleKey(title));
        const pk = inferProteinKey(title, null);
        if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
        weekContext.push(title);
      }

      safeLog("[POOL DEBUG] day summary", { dayKey, dbCount: dayDbCount, aiCount: dayAiCount });
      if (runDebug) safeLog("[JOB] day done", { dayKey, tookMs: Date.now() - dayStartAt, dbCount: dayDbCount, aiCount: dayAiCount });

      if (runDebug && i === dayKeys.length - 1) {
        const lastDaySlotStart = (dayKeys.length - 1) * MEAL_KEYS.length;
        const slotSummary = MEAL_KEYS.map((slotType, idx) => {
          const slot = newMeals[slotType];
          const diag = slotDiagnostics[lastDaySlotStart + idx] as Record<string, unknown> | undefined;
          return {
            slotType,
            pickedSource: slot?.plan_source ?? "empty",
            pickedRecipeId: slot?.recipe_id ?? null,
            pickedTitle: slot?.title ?? null,
            pickedMealTypeNorm: diag?.pickedMealTypeNorm ?? null,
            proteinKey: slot?.title ? inferProteinKey(slot.title, null) : (diag?.proteinKey ?? null),
            score: diag?.score ?? null,
            sanityRejectedCount: diag?.sanityRejectedCount ?? 0,
            allergyRejectedCount: diag?.allergyRejectedCount ?? 0,
            proteinRejectedCount: diag?.proteinRejectedCount ?? 0,
            mealTypeRejectedCount: diag?.mealTypeRejectedCount ?? 0,
          };
        });
        safeLog("[PLAN QUALITY] slotSummary (last day)", { dayKey, slotSummary });
      }

      const upsertResult = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals);
      if (upsertResult.error) {
        safeWarn("[JOB] meal_plans_v2 upsert failed", dayKey, upsertResult.error);
      }
      if (runDebug && upsertResult.mergedEmpty) {
        safeWarn("[JOB] merged_empty_meals", { dayKey, memberId: memberId ?? "null" });
      }
      const filledThisDayRun = MEAL_KEYS.filter((k) => newMeals[k]?.recipe_id).length;
      filledSlotsCountRun += filledThisDayRun;
    }

    const totalSlotsRun = dayKeys.length * MEAL_KEYS.length;
    const filledSlotsFinal = totalDbCount + totalAiCount;
    const emptySlotsCountRun = totalSlotsRun - filledSlotsFinal;
    const partialRun = emptySlotsCountRun > 0;

    await supabase
      .from("plan_generation_jobs")
      .update({
        status: "done",
        error_text: partialRun ? "partial:pool_exhausted" : null,
        progress_done: dayKeys.length,
        last_day_key: lastDayKey,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const totalSlots = totalDbCount + totalAiCount;
    const poolFillRate = totalSlots > 0 ? Math.round((totalDbCount / totalSlots) * 100) : 0;
    const aiFallbackRate = totalSlots > 0 ? Math.round((totalAiCount / totalSlots) * 100) : 0;
    slotDiagnostics.forEach((d) => {
      totalRejectedBySanity += (d.sanityRejectedCount as number) ?? 0;
      totalRejectedByAllergy += (d.allergyRejectedCount as number) ?? 0;
      totalRejectedByMealType += (d.mealTypeRejectedCount as number) ?? 0;
      totalRejectedByProteinDiversity += (d.proteinRejectedCount as number) ?? 0;
    });
    const qualityPayload: Record<string, unknown> = {
      dbCount: totalDbCount,
      aiCount: totalAiCount,
      rejectsByReason,
      proteinCounts: { ...proteinKeyCounts },
      usedTitleKeysCount: usedTitleKeys.length,
    };
    if (runDebug) {
      const topRepeatedProteinKeys = Object.entries(proteinKeyCounts)
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, c]) => `${k}:${c}`);
      qualityPayload.weekSummary = {
        totalCandidatesSeen: weekStats.candidatesSeen,
        totalRejectedBySanity,
        totalRejectedByAllergy,
        totalRejectedByMealType,
        totalRejectedByProteinDiversity,
        poolFillRate,
        aiFallbackRate,
        proteinCounts: { ...proteinKeyCounts },
        topRepeatedProteinKeys,
      };
      qualityPayload.slotDiagnostics = slotDiagnostics;
    }
    safeLog("[PLAN QUALITY]", qualityPayload);
    if (runDebug) safeLog("[JOB] completed", { totalMs: Date.now() - jobStartedAt });

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: jobId,
        status: "done",
        totalSlots: totalSlotsRun,
        filledSlotsCount: filledSlotsFinal,
        emptySlotsCount: emptySlotsCountRun,
        filledDaysCount: dayKeys.length,
        emptyDaysCount: 0,
        partial: partialRun,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    safeError("generate-plan", e instanceof Error ? e.message : String(e));
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
