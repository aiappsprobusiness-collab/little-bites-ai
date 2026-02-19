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
  завтрак: "breakfast",
  обед: "lunch",
  полдник: "snack",
  перекус: "snack",
  ужин: "dinner",
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
const SOUP_TOKENS = ["суп", "борщ", "щи", "солянк", "soup"];
const BREAKFAST_TOKENS = ["каша", "овсян", "омлет", "блин", "олад", "сырник", "запеканк", "тост", "гранола", "мюсли"];
const SNACK_TOKENS = ["фрукт", "яблок", "груш", "банан", "ягоды", "орех", "перекус", "печенье", "батончик", "пюре", "смузи"];
const LUNCH_DINNER_TOKENS = ["суп", "борщ", "щи", "солянк", "рагу", "тушен", "котлет", "плов", "паста", "фарш", "запеч", "рыба", "мясо"];
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
  const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  return dayNames[date.getDay()];
}

type MealSlot = { recipe_id?: string; title?: string; plan_source?: "pool" | "ai"; replaced_from_recipe_id?: string };

/** Нормализация meals: только слоты с валидным recipe_id, без null/undefined. */
function normalizeMealsForWrite(
  meals: Record<string, MealSlot | null | undefined>
): Record<string, MealSlot> {
  const out: Record<string, MealSlot> = {};
  for (const [key, slot] of Object.entries(meals)) {
    if (slot == null || typeof slot !== "object") continue;
    if (!slot.recipe_id) continue;
    out[key] = { recipe_id: slot.recipe_id, title: slot.title ?? "Рецепт", plan_source: slot.plan_source, ...(slot.replaced_from_recipe_id && { replaced_from_recipe_id: slot.replaced_from_recipe_id }) };
  }
  return out;
}

/** Upsert meal_plans_v2: одна строка на (user_id, member_id, planned_date). Slot-wise merge, нормализация, контрольный SELECT. */
async function upsertMealPlanRow(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dayKey: string,
  meals: Record<string, MealSlot | null | undefined>
): Promise<{ error?: string; id?: string; mergedEmpty?: boolean; keys?: string[] }> {
  const normalizedNew = normalizeMealsForWrite(meals);
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

function getPrevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

/** Возвращает массив ключей дат за N дней до firstDayKey (не включая firstDayKey). */
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

/** Загружает recipe_id и titleKeys из meal_plans_v2 за указанные даты (для контекста разнообразия). */
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

/** Загружает titleKeys по mealType из meal_plans_v2 (для quality gate: не повторять блюдо по тому же приёму за последние N дней). */
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

/** Ключевые ингредиенты для разнообразия в рамках дня (один ключ на рецепт). Приоритет: первый совпавший токен. */
const MAIN_INGREDIENT_TOKENS: { token: string; key: string }[] = [
  { token: "тыкв", key: "тыква" },
  { token: "кабачок", key: "кабачок" },
  { token: "кабачк", key: "кабачок" },
  { token: "баклажан", key: "баклажан" },
  { token: "куриц", key: "курица" },
  { token: "индейк", key: "индейка" },
  { token: "рыб", key: "рыба" },
  { token: "лосос", key: "лосось" },
  { token: "треск", key: "треска" },
  { token: "говядин", key: "говядина" },
  { token: "свинин", key: "свинина" },
  { token: "фарш", key: "фарш" },
  { token: "творог", key: "творог" },
  { token: "сырник", key: "творог" },
  { token: "нут", key: "нут" },
  { token: "чечевиц", key: "чечевица" },
  { token: "фасол", key: "фасоль" },
  { token: "рис", key: "рис" },
  { token: "гречк", key: "гречка" },
  { token: "овсян", key: "овсянка" },
  { token: "картофел", key: "картофель" },
  { token: "пюре", key: "картофель" },
  { token: "морков", key: "морковь" },
  { token: "свекл", key: "свекла" },
  { token: "капуст", key: "капуста" },
  { token: "яйц", key: "яйца" },
  { token: "омлет", key: "яйца" },
  { token: "молок", key: "молоко" },
  { token: "йогурт", key: "йогурт" },
  { token: "сметан", key: "сметана" },
  { token: "макарон", key: "макароны" },
  { token: "паста", key: "макароны" },
  { token: "суп", key: "суп" },
  { token: "борщ", key: "борщ" },
  { token: "рагу", key: "рагу" },
  { token: "плов", key: "плов" },
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

/** Описание для recipes.description: из description/intro, иначе из chef_advice или первых шагов (макс 200 символов). */
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

// ——— Pool-first: same logic as client recipePool ———
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

/** [3] Расширенные токены для аллергии на молоко/лактозу (RU + EN). Не включать "масло" — банит растительное масло. */
const DAIRY_ALLERGY_TOKENS = [
  "молоко", "молочный", "сливки", "сметана", "творог", "сыр", "йогурт", "кефир", "ряженка", "мороженое", "сгущенка", "лактоза", "казеин",
  "сливочн", "сливочное масло",
  "milk", "dairy", "cream", "sour cream", "curd", "cheese", "yogurt", "kefir", "butter", "ghee", "lactose", "casein",
];

function getAllergyTokens(memberData: MemberDataPool | null | undefined): string[] {
  if (!memberData?.allergies?.length) return [];
  const tokens = new Set<string>();
  const rawLower = memberData.allergies.map((a) => String(a).toLowerCase()).join(" ");
  const isMilkAllergy = /молок|milk|лактоз|lactose|dairy|казеин|casein/.test(rawLower);
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
  const re1 = /не\s+любит\s+([^\.,;!?]+)/gi;
  const re2 = /без\s+([^\.,;!?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  while ((m = re2.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  return [...tokens];
}
const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];
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
  if (/(минтай|треск|хек|судак|лосос|семг|сёмг|форел|тунец|сардин|скумбри|рыб|fish|salmon|cod|tuna|mackerel)/.test(text)) return "fish";
  if (/(куриц|курин|индейк|филе бедра|грудк|птиц|turkey|chicken)/.test(text)) return "chicken";
  if (/(говядин|телят|свинин|бекон|ветчин|мясн|beef|pork|veal|bacon|ham)/.test(text)) return "beef_pork";
  if (/(фарш|minced)/.test(text) && !/рыб/.test(text)) return "beef_pork";
  if (/(чечевиц|нут|фасол|горох|боб|chickpea|lentil|beans|peas)/.test(text)) return "legumes";
  if (/(творог|йогурт|кефир|молок|сыр|сметан|ряженк|dairy|curd|yogurt|cheese|milk|cottage|cream)/.test(text)) return "dairy";
  if (/(яйц|омлет|egg|omelet)/.test(text)) return "egg";
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
type ScoreResult = { finalScore: number; baseScore: number; diversityPenalty: number; proteinKey: ProteinKey; proteinCountBefore: number };
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
  const snackyTokens = ["пюре", "дольки", "батончик", "печенье"];
  if (normalizedSlot !== "snack" && snackyTokens.some((tok) => t.includes(tok))) baseScore -= 3;
  const snackLike = ["йогурт", "творог", "дольки", "печенье", "батончик", "пюре", "смузи"];
  if (normalizedSlot === "dinner" && snackLike.some((tok) => t.includes(tok))) baseScore -= 5;
  const breakfastLike = ["оладь", "сырник", "запеканк", "каша", "гранола", "тост"];
  if ((normalizedSlot === "lunch" || normalizedSlot === "dinner") && breakfastLike.some((tok) => t.includes(tok))) baseScore -= 5;
  if (normalizedSlot === "snack") {
    const snackAllow = ["фрукт", "ягод", "орех", "смузи", "печенье", "батончик", "хлебец", "пюре", "fruit", "berry", "nut"];
    if (snackAllow.some((tok) => t.includes(tok))) baseScore += 2;
    const snackReject = ["каша", "гречк", "рис", "рагу", "тушен", "rice", "oat"];
    if (snackReject.some((tok) => t.includes(tok))) baseScore -= 5;
  }
  const titleK = normalizeTitleKey(recipe.title);
  if (usedTitleKeysSet.has(titleK)) baseScore -= 20;
  const allergyPenaltyVal = typeof adaptiveParams?.allergyPenalty === "number" ? adaptiveParams.allergyPenalty : -100;
  if (allergyTokens.length > 0) {
    const checkText = [recipe.title, recipe.description ?? "", ingredientsText].join(" ");
    if (containsAnyToken(checkText, allergyTokens)) return { finalScore: allergyPenaltyVal, baseScore: 0, diversityPenalty: allergyPenaltyVal, proteinKey: "veg", proteinCountBefore: 0 };
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
  return { finalScore, baseScore, diversityPenalty, proteinKey: pk, proteinCountBefore };
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
    /** Ключи главных ингредиентов уже выбранных в этот день — не повторять (тыква дважды в день). */
    excludedMainIngredients?: string[];
    adaptiveParams?: AdaptiveParams;
    weekProgress?: { filled: number; total: number };
    debugSlotStats?: Record<string, unknown>;
    weekStats?: { candidatesSeen: number };
    /** Для replace_slot: вернуть candidatesAfterAllFilters и topTitleKeys для решения об AI fallback. */
    returnExtra?: boolean;
  }
): Promise<{ id: string; title: string; candidatesAfterAllFilters?: number; topTitleKeys?: string[] } | null> {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const excludeProteinSet = new Set(options?.excludeProteinKeys ?? []);
  const excludedMainIngredientSet = new Set((options?.excludedMainIngredients ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean));
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
  const candidatesStrict = (rowsStrict ?? []).length;

  // Для «Семья» (member_id null) пул = все рецепты пользователя, иначе рецепты ребёнка + семейные (member_id null).
  let qLoose = baseQ();
  if (memberId == null) {
    // Не фильтруем по member_id — в семейный план попадают все рецепты пользователя (в т.ч. chat_ai с member_id ребёнка).
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
  const rawCandidates = (rowsLoose ?? []) as RecipeRowPool[];
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

  const hasMilkAllergy = memberData?.allergies?.length && memberData?.allergies?.some((a) => /молок|milk|лактоз|lactose|dairy|казеин|casein/i.test(String(a)));
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
        const snackLike = ["йогурт", "творог", "дольки", "печенье", "батончик", "пюре", "смузи"];
        const breakfastLike = ["оладь", "сырник", "запеканк", "каша", "гранола", "тост"];
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
  });
  const base = { id: picked.id, title: picked.title };
  if (options?.returnExtra) {
    const topTitleKeys = filtered.slice(0, 5).map((r) => normalizeTitleKey(r.title));
    return { ...base, candidatesAfterAllFilters: afterFiltersCount, topTitleKeys };
  }
  return base;
}

/** [3] Validate AI-generated meal: allergy + slot sanity. Returns null if OK, else reason. */
function validateAiMeal(
  title: string,
  ingredients: Array<{ name?: string } | string>,
  steps: string[],
  mealKey: string,
  memberData: MemberDataPool | null | undefined
): string | null {
  const normSlot = normalizeMealType(mealKey) ?? (mealKey as NormalizedMealType);
  const ingText = ingredients.map((i) => (typeof i === "string" ? i : i.name ?? "")).join(" ");
  const combinedText = [title, ingText, steps.join(" ")].join(" ");
  // Для завтрака проверяем только название: типичный завтрак (оладьи, каша) не должен отклоняться из-за слова в ингредиентах (напр. "нутовая мука").
  const sanityText = normSlot === "breakfast" ? title : combinedText;
  const sanity = slotSanityReject(normSlot, sanityText);
  if (sanity) return sanity;
  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length > 0) {
    const ingText = ingredients.map((i) => (typeof i === "string" ? i : i.name ?? "")).join(" ");
    const text = [title, ingText, steps.join(" ")].join(" ");
    if (containsAnyToken(text, allergyTokens)) return "allergy";
  }
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

      // Replace with AI: only Premium/Trial. Free must not trigger AI from replace_slot.
      if (!isPremiumOrTrialReplace) {
        if (debugPlan) safeLog("[REPLACE_SLOT] AI blocked", { requestId, reason: "free_no_ai" });
        return new Response(
          JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "premium_required", requestId, reason: "premium_required" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const deepseekUrl = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/deepseek-chat";
      const mealLabel =
        mealType === "breakfast" ? "завтрак" : mealType === "lunch" ? "обед" : mealType === "snack" ? "полдник" : "ужин";
      const excludeStr = excludeTitleKeys.length > 0 ? ` Не повторяй блюда: ${excludeTitleKeys.slice(0, 16).join(", ")}.` : "";
      const mainIngredientExcludeStr =
        excludedMainIngredientsReplace.length > 0 ? ` В этот день уже есть: ${excludedMainIngredientsReplace.join(", ")} — не используй.` : "";
      const slotForbiddenByType: Record<string, string> = {
        breakfast: "супы, рагу, плов, рыбу, карри, нут, тушёное",
        lunch: "сырники, оладьи, запеканку, кашу, гранолу, тосты",
        snack: "супы, рагу, плов, каши, гречку, рис, фарш, котлеты, пасту",
        dinner: "йогурт, творог, дольки, печенье, батончик, пюре, смузи",
      };
      const slotConstraint =
        mealType === "breakfast"
          ? " Не предлагай супы, рагу, плов — только блюда для завтрака."
          : ` Для ${mealLabel} НЕЛЬЗЯ: ${slotForbiddenByType[mealType] ?? ""}.`;
      const allergyTokens = getAllergyTokens(memberDataPool);
      const allergyHint =
        allergyTokens.length > 0
          ? ` СТРОГО без: ${["молоко", "творог", "йогурт", "сыр", "кефир", "сливки", "сметана", "ряженка", "масло", "мороженое", "сгущенка", "лактоза", "казеин"].filter((x) => allergyTokens.some((t) => t.includes(x) || x.includes(t))).join(", ")}.`
          : "";

      const doAiRequest = (extraHint: string) =>
        fetchWithRetry(
          deepseekUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              type: "recipe",
              stream: false,
              memberData: memberData ?? undefined,
              mealType,
              messages: [
                {
                  role: "user",
                  content: `Сгенерируй один рецепт для ${mealLabel}.${excludeStr}${mainIngredientExcludeStr}${slotConstraint}${extraHint} Верни только JSON.`,
                },
              ],
            }),
          },
          { timeoutMs: FETCH_TIMEOUT_MS, retries: 2 }
        );

      let aiRes: Response;
      try {
        aiRes = await doAiRequest(allergyHint);
        if (aiRes && !aiRes.ok && aiRes.status >= 500) {
          if (debugPool) safeLog("[REPLACE_SLOT] AI 5xx, retrying once", aiRes.status);
          aiRes = await doAiRequest(allergyHint);
        }
      } catch (e) {
        safeWarn("[REPLACE_SLOT] AI timeout/fetch error", e instanceof Error ? e.message : String(e).slice(0, 80));
        try {
          aiRes = await doAiRequest(allergyHint);
        } catch (e2) {
          if (debugPlan) safeLog("[REPLACE_SLOT] ai_call", { requestId, status: "timeout" });
          return new Response(
            JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "ai_timeout", requestId, reason: "ai_timeout" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        safeWarn("[REPLACE_SLOT] AI request failed", aiRes.status, errText);
        if (debugPlan) safeLog("[REPLACE_SLOT] ai_call", { requestId, status: aiRes.status });
        return new Response(
          JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "ai_request_failed", requestId, reason: "ai_request_failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (debugPlan) safeLog("[REPLACE_SLOT] ai_call", { requestId, status: "ok" });

      const aiData = (await aiRes.json()) as { message?: string; recipe_id?: string | null; recipes?: Array<{ title?: string }> };
      const rawRecipeId = aiData.recipe_id;
      let recipeId: string | null =
        rawRecipeId == null
          ? null
          : typeof rawRecipeId === "string"
            ? rawRecipeId
            : (rawRecipeId as { id?: string })?.id ?? String(rawRecipeId);
      let title = aiData.recipes?.[0]?.title ?? (typeof aiData.message === "string" ? aiData.message.slice(0, 100) : "Рецепт");

      type ParsedAiRecipe = {
        title?: string;
        description?: string;
        intro?: string;
        ingredients?: Array<{ name?: string; amount?: string }>;
        steps?: string[];
      };
      const parseAndValidateAi = (
        msg: string
      ): { parsed: ParsedAiRecipe; failReason: string | null } => {
        const jsonStr = extractFirstJsonObject(msg);
        if (!jsonStr) return { parsed: {}, failReason: "no_json" };
        let parsed: ParsedAiRecipe;
        try {
          parsed = JSON.parse(jsonStr) as ParsedAiRecipe;
        } catch {
          return { parsed: {}, failReason: "no_json" };
        }
        const ingredients = (parsed.ingredients ?? []).map((ing) =>
          typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
        );
        const steps = (parsed.steps ?? []).filter(Boolean).map((s) => String(s));
        const failReason = validateAiMeal(
          parsed.title ?? "",
          ingredients,
          steps,
          mealType,
          memberDataPool
        );
        return { parsed: { ...parsed, ingredients, steps }, failReason };
      };

      let parsedResult: { parsed: { title?: string; ingredients?: Array<{ name?: string; amount?: string }>; steps?: string[] }; failReason: string | null } | null =
        null;
      if (typeof aiData.message === "string") {
        parsedResult = parseAndValidateAi(aiData.message);
        const isAllergyFail = parsedResult.failReason === "allergy";
        const isSanityFail = parsedResult.failReason && !isAllergyFail;
        if (isAllergyFail && allergyTokens.length > 0) {
          try {
            aiRes = await doAiRequest(` СТРОГО БЕЗ МОЛОЧНЫХ ПРОДУКТОВ: молоко, творог, йогурт, сыр, кефир, сливки, сметана, масло, ряженка, мороженое, сгущенка. `);
            if (aiRes.ok) {
              const retryData = (await aiRes.json()) as { message?: string };
              parsedResult = parseAndValidateAi(retryData.message ?? "");
            }
          } catch {
            /* keep original parsedResult with failReason */
          }
        } else if (isSanityFail) {
          try {
            const sanityHint =
              mealType === "breakfast"
                ? " Строго только блюдо для завтрака: каша, омлет, сырники, оладьи, запеканка, тост, яичница, гранола. Никаких супов, борща, рагу, плова, рыбы, карри, нута, тушёного. Верни один рецепт именно для завтрака."
                : ` Для ${mealLabel} нельзя: ${slotForbiddenByType[mealType] ?? ""}. Предложи подходящее блюдо.`;
            aiRes = await doAiRequest(sanityHint);
            if (aiRes.ok) {
              const retryData = (await aiRes.json()) as { message?: string };
              parsedResult = parseAndValidateAi(retryData.message ?? "");
            }
          } catch {
            /* keep original parsedResult with failReason */
          }
        }
        if (parsedResult.failReason) {
          const titleForLog = parsedResult.parsed?.title ?? "";
          const ingText = (parsedResult.parsed?.ingredients ?? []).map((i) => (typeof i === "string" ? i : i.name ?? "")).join(" ");
          const combinedForSanity = [titleForLog, ingText].join(" ");
          const { hitTokens: sanityHitTokens } = slotSanityCheck(mealType as NormalizedMealType, combinedForSanity);
          safeLog("[REPLACE_SLOT] AI meal validation failed", {
            mealType,
            failReason: parsedResult.failReason,
            title: titleForLog.slice(0, 80),
            hitTokens: parsedResult.failReason === "sanity_hit" ? sanityHitTokens : undefined,
          });
          return new Response(
            JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "validation_failed", requestId, reason: "validation_failed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (!recipeId && typeof aiData.message === "string" && parsedResult?.parsed) {
        const { parsed } = parsedResult;
        const ingredients = (parsed.ingredients ?? []).map((ing) =>
          typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
        );
        const steps = (parsed.steps ?? []).filter(Boolean).map((s) => String(s));
        while (steps.length < 3) steps.push(`Шаг ${steps.length + 1}`);
        while (ingredients.length < 3) ingredients.push({ name: `Ингредиент ${ingredients.length + 1}`, amount: "" });
        const chefAdvice = extractChefAdvice(parsed as Record<string, unknown>);
        const adviceVal = extractAdvice(parsed as Record<string, unknown>);
        const description = getDescriptionWithFallback({
          description: parsed.description,
          intro: parsed.intro,
          steps: parsed.steps ?? steps,
          chef_advice: chefAdvice ?? null,
        });
        const payload = canonicalizeRecipePayload({
          user_id: userId,
          member_id: memberId,
          child_id: memberId,
          source: "chat_ai",
          contextMealType: mealType,
          title: parsed.title ?? "Рецепт",
          description,
          cooking_time_minutes: null,
          chef_advice: chefAdvice ?? null,
          advice: adviceVal ?? null,
          steps: steps.slice(0, 7).map((instruction, idx) => ({ instruction, step_number: idx + 1 })),
          ingredients: ingredients.slice(0, 20).map((ing, idx) => ({
            name: ing.name,
            display_text: ing.amount ? `${ing.name} — ${ing.amount}` : ing.name,
            amount: null,
            unit: null,
            order_index: idx,
            category: "other",
          })),
          sourceTag: "plan",
        });
        const { data: createdId, error: rpcErr } = await supabase.rpc("create_recipe_with_steps", { payload });
        if (rpcErr || !createdId) {
          safeWarn("[REPLACE_SLOT] create_recipe failed", rpcErr?.message);
          if (debugPlan) safeLog("[REPLACE_SLOT] create_recipe", { requestId, ok: false });
          return new Response(
            JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "create_recipe_failed", requestId, reason: "create_recipe_failed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (debugPlan) safeLog("[REPLACE_SLOT] create_recipe", { requestId, ok: true, recipeId: createdId, hasDescription: description.length > 0 });
        recipeId = typeof createdId === "string" ? createdId : (createdId as { id?: string })?.id ?? String(createdId);
        title = parsed.title ?? title;
      }

      if (recipeId) {
        const newMeals = { ...currentMeals, [mealType]: { recipe_id: recipeId, title, plan_source: "ai" as const } };
        const upsertErr = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals);
        if (upsertErr.error) {
          safeWarn("[REPLACE_SLOT] attach_failed (upsert)", requestId, upsertErr.error);
          return new Response(
            JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "attach_failed", requestId, reason: "attach_failed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (debugPlan) safeLog("[REPLACE_SLOT] finish", { requestId, ok: true, recipeId, reason: "ai" });
        return new Response(
          JSON.stringify({ pickedSource: "ai", newRecipeId: recipeId, title, plan_source: "ai", requestId, reason: "ai" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const recipesFromResponse = aiData.recipes as Array<{
        title?: string;
        description?: string;
        intro?: string;
        ingredients?: Array<{ name?: string; amount?: string }>;
        steps?: string[];
        chefAdvice?: string;
        chef_advice?: string;
      }> | undefined;
      const firstRecipe = Array.isArray(recipesFromResponse) && recipesFromResponse.length > 0 ? recipesFromResponse[0] : null;
      if (firstRecipe?.title) {
        const ingList = (firstRecipe.ingredients ?? []).map((ing) =>
          typeof ing === "string" ? { name: String(ing).trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
        );
        const stepList = (firstRecipe.steps ?? []).filter(Boolean).map((s) => String(s));
        const failReason = validateAiMeal(firstRecipe.title, ingList, stepList, mealType, memberDataPool);
        if (!failReason) {
          while (stepList.length < 3) stepList.push(`Шаг ${stepList.length + 1}`);
          while (ingList.length < 3) ingList.push({ name: `Ингредиент ${ingList.length + 1}`, amount: "" });
          const chefAdviceFirst = firstRecipe.chefAdvice ?? firstRecipe.chef_advice;
          const descriptionFirst = getDescriptionWithFallback({
            description: firstRecipe.description,
            intro: firstRecipe.intro,
            steps: firstRecipe.steps ?? stepList,
            chef_advice: chefAdviceFirst ?? null,
          });
          const payload = canonicalizeRecipePayload({
            user_id: userId,
            member_id: memberId,
            child_id: memberId,
            source: "chat_ai",
            contextMealType: mealType,
            title: firstRecipe.title,
            description: descriptionFirst,
            cooking_time_minutes: null,
            chef_advice: typeof chefAdviceFirst === "string" && chefAdviceFirst.trim() ? chefAdviceFirst.trim() : null,
            advice: null,
            steps: stepList.slice(0, 7).map((instruction, idx) => ({ instruction, step_number: idx + 1 })),
            ingredients: ingList.slice(0, 20).map((ing, idx) => ({
              name: ing.name,
              display_text: ing.amount ? `${ing.name} — ${ing.amount}` : ing.name,
              amount: null,
              unit: null,
              order_index: idx,
              category: "other",
            })),
            sourceTag: "plan",
          });
          const { data: createdId, error: rpcErr } = await supabase.rpc("create_recipe_with_steps", { payload });
          if (!rpcErr && createdId) {
            const idStr = typeof createdId === "string" ? createdId : (createdId as { id?: string })?.id ?? String(createdId);
            if (debugPlan) safeLog("[REPLACE_SLOT] create_recipe", { requestId, ok: true, recipeId: idStr, hasDescription: descriptionFirst.length > 0 });
            const newMeals = { ...currentMeals, [mealType]: { recipe_id: idStr, title: firstRecipe.title, plan_source: "ai" as const } };
            const upsertErr = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals);
            if (upsertErr.error) {
              safeWarn("[REPLACE_SLOT] attach_failed (upsert)", requestId, upsertErr.error);
              return new Response(
                JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "attach_failed", requestId, reason: "attach_failed" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            if (debugPlan) safeLog("[REPLACE_SLOT] finish", { requestId, ok: true, recipeId: idStr, reason: "ai_recipes_array" });
            return new Response(
              JSON.stringify({ pickedSource: "ai", newRecipeId: idStr, title: firstRecipe.title, plan_source: "ai", requestId, reason: "ai_recipes_array" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      if (debugPlan) safeLog("[REPLACE_SLOT] finish", { requestId, ok: false, reason: "no_recipe_in_response" });
      return new Response(
        JSON.stringify({ error: "replace_failed", pickedSource: "ai", reasonIfAi: "no_recipe_in_response", requestId, reason: "no_recipe_in_response" }),
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
      if (debugPool) {
        safeLog("[POOL UPGRADE] range", { dayKeysCount: dayKeys.length, firstKey: dayKeys[0], lastKey: dayKeys[dayKeys.length - 1] });
      }
      const memberDataPool: MemberDataPool | null = memberData
        ? { allergies: memberData.allergies ?? [], preferences: memberData.preferences ?? [], age_months: memberData.age_months }
        : null;
      const allergyTokens = getAllergyTokens(memberDataPool);
      let weekContext: string[] = [];
      let usedRecipeIds: string[] = [];
      let usedTitleKeys: string[] = [];
      const proteinKeyCounts: Record<string, number> = {};
      let replacedCount = 0;
      let unchangedCount = 0;
      let aiFallbackCount = 0;

      const weekRows = await (async () => {
        let weekQ = supabase
          .from("meal_plans_v2")
          .select("planned_date, meals")
          .eq("user_id", userId)
          .gte("planned_date", dayKeys[0])
          .lte("planned_date", dayKeys[dayKeys.length - 1]);
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
          if (slot?.title) usedTitleKeys.push(normalizeTitleKey(slot.title));
        });
      });
      const last4KeysUpgrade = getLastNDaysKeys(dayKeys[0], 4);
      const { recipeIds: prev4RecipeIdsUpgrade, titleKeys: prev4TitleKeysUpgrade } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, memberId, last4KeysUpgrade);
      usedRecipeIds.push(...prev4RecipeIdsUpgrade);
      usedTitleKeys.push(...prev4TitleKeysUpgrade);

      for (let di = 0; di < dayKeys.length; di++) {
        const dayKey = dayKeys[di];
        const prevDayKey = di > 0 ? dayKeys[di - 1] : null;
        let excludeProteinKeys: string[] = [];
        if (prevDayKey) {
          const prevRow = weekRows.find((r) => r.planned_date === prevDayKey);
          const prevMeals = prevRow?.meals ?? {};
          for (const k of MEAL_KEYS) {
            const pk = inferProteinKey(prevMeals[k]?.title, null);
            if (pk && pk !== "veg") excludeProteinKeys.push(pk);
          }
        }
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

        let dayExcludedMainIngredientsUpgrade: string[] = [];
        const poolPicks: Record<string, { id: string; title: string } | null> = {};
        for (const mealKey of MEAL_KEYS) {
          const slot = currentMeals[mealKey];
          const hadRecipeId = slot?.recipe_id ?? null;
          const picked = await pickFromPool(
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
              excludeProteinKeys,
              proteinKeyCounts,
              debugPool,
              excludedMainIngredients: dayExcludedMainIngredientsUpgrade,
            }
          );
          poolPicks[mealKey] = picked ?? null;
          if (picked) {
            newMeals[mealKey] = {
              recipe_id: picked.id,
              title: picked.title,
              plan_source: "pool",
              ...(hadRecipeId ? { replaced_from_recipe_id: hadRecipeId } : {}),
            };
            usedRecipeIds.push(picked.id);
            usedTitleKeys.push(normalizeTitleKey(picked.title));
            const pk = inferProteinKey(picked.title, null);
            if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
            const mik = inferMainIngredientKey(picked.title, null, null);
            if (mik) dayExcludedMainIngredientsUpgrade.push(mik);
            replacedCount++;
            weekContext.push(picked.title);
          } else {
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

        // Fill Day/Week: POOL only. Slots that pool could not fill stay empty (no AI fallback).
        if (debugPool && MEAL_KEYS.some((k) => !poolPicks[k] && !currentMeals[k]?.recipe_id)) {
          safeLog("[POOL UPGRADE] slots left empty (pool only, no AI)", { dayKey, emptySlots: MEAL_KEYS.filter((k) => !poolPicks[k] && !currentMeals[k]?.recipe_id) });
        }

        const upsertResult = await upsertMealPlanRow(supabase, userId, memberId, dayKey, newMeals);
        if (upsertResult.error) {
          safeWarn("[POOL UPGRADE] meal_plans_v2 upsert failed", dayKey, upsertResult.error);
        }
        if (upsertResult.mergedEmpty) {
          const picksThisDay = MEAL_KEYS.filter((k) => poolPicks[k]).length;
          safeWarn("[POOL UPGRADE] merged_empty_meals", { dayKey, memberId: memberId ?? "null", picksThisDay });
          replacedCount = Math.max(0, replacedCount - picksThisDay);
        }
      }

      const totalSlots = dayKeys.length * MEAL_KEYS.length;
      if (debugPool) {
        safeLog("[POOL UPGRADE] totals", { totalSlots, replacedCount, unchangedCount, aiFallbackCount });
      }
      return new Response(
        JSON.stringify({ replacedCount, unchangedCount, aiFallbackCount, totalSlots }),
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
      for (const k of MEAL_KEYS) usedTitleKeysByMealType[k] = new Set(last4TitleKeysByMealType[k] ?? []);
      (weekRows ?? []).forEach((row: { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }) => {
        const meals = row.meals ?? {};
        MEAL_KEYS.forEach((k) => {
          const title = meals[k]?.title;
          if (title) usedTitleKeysByMealType[k].add(normalizeTitleKey(title));
        });
      });
    }

    const allergyTokens = getAllergyTokens(memberDataPool);
    const allergyWeekHint =
      allergyTokens.length > 0
        ? " СТРОГО БЕЗ МОЛОЧНЫХ ПРОДУКТОВ: молоко, творог, йогурт, сыр, кефир, сливки, сметана, масло, ряженка, мороженое, сгущенка. "
        : "";

    const jobStartedAt = Date.now();
    const stallLimitMs = type === "week" ? JOB_STALL_MS_WEEK : JOB_STALL_MS_DAY;
    const runDebug = body.debug_pool ?? (typeof Deno !== "undefined" && Deno.env?.get?.("GENERATE_PLAN_DEBUG") === "1");

    for (let i = 0; i < dayKeys.length; i++) {
      if (Date.now() - jobStartedAt > stallLimitMs) {
        await supabase
          .from("plan_generation_jobs")
          .update({ status: "error", error_text: "timeout_stalled", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", jobId);
        if (runDebug) safeLog("[JOB] stalled", { elapsedMs: Date.now() - jobStartedAt, stallLimitMs });
        return new Response(
          JSON.stringify({ job_id: jobId, status: "error", error: "timeout_stalled" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const dayKey = dayKeys[i];
      const dayName = getDayName(dayKey);
      lastDayKey = dayKey;
      const prevDayKey = i > 0 ? dayKeys[i - 1] : null;
      const dayStartAt = Date.now();
      if (runDebug) safeLog("[JOB] day start", { dayKey, index: i + 1, total: dayKeys.length });
      let excludeProteinKeys: string[] = [];
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
          if (pk && pk !== "veg") excludeProteinKeys.push(pk);
        }
      }

      await supabase
        .from("plan_generation_jobs")
        .update({ progress_done: i, last_day_key: dayKey, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      const poolPicks: Record<string, { id: string; title: string } | null> = {};
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
        const pickedRaw = await pickFromPool(
          supabase,
          userId,
          memberId,
          mealKey,
          memberDataPool,
          usedRecipeIds,
          usedTitleKeys,
          60,
          {
            excludeProteinKeys,
            proteinKeyCounts,
            excludedMainIngredients: dayExcludedMainIngredients,
            debugPool,
            adaptiveParams,
            weekProgress: { filled: filledSlotsSoFar, total: totalSlotsForWeek },
            debugSlotStats: debugPool ? slotStats : undefined,
            weekStats: debugPool ? weekStats : undefined,
          }
        );
        let picked = pickedRaw ?? null;
        const qualityGateTriggered =
          picked &&
          isPremiumOrTrial &&
          (usedTitleKeysByMealType[mealKey]?.has(normalizeTitleKey(picked!.title)) ||
            (excludeProteinKeys.length > 0 && (() => {
              const pk = inferProteinKey(picked!.title, null);
              return !!pk && pk !== "veg" && excludeProteinKeys.includes(pk);
            })()));
        if (qualityGateTriggered) {
          if (runDebug) safeLog("[JOB] quality_gate", { dayKey, mealKey, reason: usedTitleKeysByMealType[mealKey]?.has(normalizeTitleKey(picked!.title)) ? "title_repeat" : "protein_streak", qualityGateTriggered: true, aiFallbackTriggered: true });
          picked = null;
        }
        poolPicks[mealKey] = picked ?? null;
        if (debugPool && Object.keys(slotStats).length > 0) {
          slotDiagnostics.push({ ...slotStats, wasRecoveredFromTitle: slotStats.mealTypeRecoveredFromTitle, qualityGateTriggered: qualityGateTriggered || undefined });
        }
        if (picked) {
          usedRecipeIds.push(picked.id);
          usedTitleKeys.push(normalizeTitleKey(picked.title));
          usedTitleKeysByMealType[mealKey].add(normalizeTitleKey(picked.title));
          const pk = inferProteinKey(picked.title, null);
          if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] ?? 0) + 1;
          const mainKey = inferMainIngredientKey(picked.title, null, null);
          if (mainKey) dayExcludedMainIngredients = [...dayExcludedMainIngredients, mainKey];
        } else if (runDebug) {
          safeLog("[JOB] pool_exhausted_free_or_premium_fallback", { dayKey, mealKey, isPremiumOrTrial, reason: qualityGateTriggered ? "quality_gate" : "pool_exhausted_free" });
        }
      }
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
        const mealLabel = mealKey === "breakfast" ? "завтрак" : mealKey === "lunch" ? "обед" : mealKey === "snack" ? "полдник" : "ужин";
        const excludeStr = usedTitleKeys.length > 0 ? ` Не повторяй блюда: ${usedTitleKeys.slice(-20).join(", ")}.` : "";
        const mainIngredientExcludeStr =
          dayExcludedMainIngredients.length > 0 ? ` В этот день уже есть блюда с: ${[...new Set(dayExcludedMainIngredients)].join(", ")} — не используй их.` : "";
        const proteinExcludeStr = excludeProteinKeys.length > 0 ? ` Вчера уже был этот приём с: ${excludeProteinKeys.join(", ")} — предложи другой белок.` : "";
        const slotForbidden: Record<string, string> = {
          breakfast: "супы, рагу, плов. Только завтраки: каши, омлеты, сырники, тосты.",
          lunch: "сырники, оладьи, кашу. Только обеды: супы, вторые блюда.",
          snack: "супы, рагу, каши. Только перекусы: фрукты, печенье, смузи.",
          dinner: "йогурт, творог, дольки, печенье как единственное. Только ужины: вторые блюда.",
        };
        const allergyHint = allergyTokens.length > 0 ? " СТРОГО без молочных: молоко, творог, йогурт, сыр, кефир, сливки, сметана. " : "";
        const aiRes = await fetchWithRetry(
          deepseekUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              type: "recipe",
              stream: false,
              memberData: memberData ?? undefined,
              mealType: mealKey,
              messages: [{ role: "user", content: `Сгенерируй один рецепт для ${mealLabel}.${excludeStr}${mainIngredientExcludeStr}${proteinExcludeStr} ${slotForbidden[mealKey] ?? ""}.${allergyHint} Верни только JSON.` }],
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
        let title = firstRecipe?.title ?? (typeof aiData.message === "string" ? aiData.message.slice(0, 100) : "Рецепт");
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
        while (steps.length < 3) steps.push(`Шаг ${steps.length + 1}`);
        while (ingredients.length < 3) ingredients.push({ name: `Ингредиент ${ingredients.length + 1}`, amount: "" });
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
            display_text: ing.amount ? `${ing.name} — ${ing.amount}` : ing.name,
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
      if (upsertResult.mergedEmpty) {
        safeWarn("[JOB] merged_empty_meals", { dayKey, memberId: memberId ?? "null" });
      }
    }

    await supabase
      .from("plan_generation_jobs")
      .update({
        status: "done",
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
      JSON.stringify({ job_id: jobId, status: "done" }),
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
