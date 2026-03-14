/**
 * Edge Function: generate-plan (rewrite).
 *
 * Architecture:
 * - Single entry: POST JSON body. Actions: cancel, replace_slot, start, run.
 * - mode=upgrade is an alias: same pipeline as run but without job_id; response shape is upgrade (replacedCount, filledSlotsCount, etc.).
 * - dayKeys from type + day_key / day_keys / start_key. If dayKeys.length === 1 -> SINGLE-DAY path (no week DB, in-memory pick only). If dayKeys.length > 1 -> WEEK path (buildExcludeSets only when poolSuitableCount >= 8).
 * - Single-day path DB count: 2 (profile + usage in parallel), 1 fetchPoolCandidates, 1 meal_plans_v2 select + 1 upsert => 5 DB calls for one day.
 * - No sleep/delay/time budget/per-slot job updates. Logs: [RUN MODE], [TIMING] done, [TIMING WARN] only if totalMs > 2000.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { safeError, safeLog, safeWarn } from "../_shared/safeLogger.ts";
import { getMemberAgeContext, isAdultContext } from "../_shared/memberAgeContext.ts";
import { buildFamilyMemberDataForPlan } from "../_shared/familyMode.ts";
import { normalizeSlotForWrite } from "../_shared/mealJson.ts";
import { isFamilyDinnerCandidate } from "../_shared/plan/familyDinnerFilter.ts";
import { inferPrimaryBase } from "../_shared/primaryBase.ts";
import { buildLikeTokens, hasLikeMatch, hasLikedTitlesMatch, passesPreferenceFilters, scoreLikeSignal, type LikeMode } from "./preferenceRules.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;
type NormalizedMealType = (typeof MEAL_KEYS)[number];
const MEAL_TYPE_ALIASES: Record<string, NormalizedMealType> = {
  breakfast: "breakfast", lunch: "lunch", snack: "snack", dinner: "dinner",
  "завтрак": "breakfast", "обед": "lunch", "полдник": "snack", "перекус": "snack", "ужин": "dinner",
  supper: "dinner", afternoon_snack: "snack",
};
function normalizeMealType(value: string | null | undefined): NormalizedMealType | null {
  if (value == null || typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? MEAL_TYPE_ALIASES[value.trim()] ?? null;
}

type MemberDataPool = { allergies?: string[]; preferences?: string[]; likes?: string[]; dislikes?: string[]; age_months?: number; type?: string | null };
type RecipeRowPool = {
  id: string; title: string; description: string | null; meal_type?: string | null;
  is_soup?: boolean | null;
  max_age_months?: number | null; min_age_months?: number | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
};
type MealSlot = { recipe_id?: string; title?: string; plan_source?: "pool" | "ai" };

const SANITY_BREAKFAST = ["суп", "борщ", "рагу", "плов"];
const SANITY_LUNCH = ["сырник", "оладь", "каша", "гранола", "тост"];
/** Супы только на обед; в слот ужина супоподобные блюда не ставим. */
const SANITY_DINNER = ["йогурт", "творог", "печенье", "батончик", "смузи", "суп", "борщ", "щи", "солянк", "рассольник", "окрошк", "гаспачо"];
const SANITY_SNACK = ["суп", "борщ", "рагу", "плов", "каша", "сырник"];
function slotSanityCheck(slotType: NormalizedMealType, text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.toLowerCase();
  if (slotType === "breakfast" && SANITY_BREAKFAST.some((tok) => t.includes(tok))) return false;
  if (slotType === "lunch" && SANITY_LUNCH.some((tok) => t.includes(tok))) return false;
  if (slotType === "dinner" && SANITY_DINNER.some((tok) => t.includes(tok))) return false;
  if (slotType === "snack" && SANITY_SNACK.some((tok) => t.includes(tok))) return false;
  return true;
}

function getTodayKey(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function getRolling7Dates(startKey: string): string[] {
  const [y, m, d] = startKey.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(start);
    d2.setDate(d2.getDate() + i);
    out.push(`${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`);
  }
  return out;
}
function getLastNDaysKeys(firstDayKey: string, n: number): string[] {
  const [y, m, d] = firstDayKey.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - i);
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  }
  return out;
}
function getPrevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeTitleKey(title: string): string {
  return (title ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}
/** Shuffle array in place for variety when re-filling plan (same pool order would yield same recipes). */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const rnd = typeof crypto !== "undefined" && crypto.getRandomValues
      ? (crypto.getRandomValues(new Uint32Array(1))[0] as number) / 0x100000000
      : Math.random();
    const j = Math.floor(rnd * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
}
function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = haystack.toLowerCase();
  return tokens.some((t) => t.length >= 2 && h.includes(t));
}
const AGE_RESTRICTED = ["острый", "кофе", "гриб"];
const INFANT_FORBIDDEN_12 = ["свинина", "говядина", "стейк", "жарен", "копчен", "колбас"];
/** Hard-guard для 12–24 мес: без жёстких кусочков, стейка, жареного, котлет, запеканок (грубая текстура). */
const TODDLER_UNDER_24_FORBIDDEN = ["стейк", "жарен", "копчен", "колбас", "бекон", "отбивн", "котлет", "запеканк", "кусоч"];
function recipeFitsAgeRange(r: RecipeRowPool, ageMonths: number): boolean {
  const max = r.max_age_months;
  if (max != null && ageMonths > max) return false;
  const min = r.min_age_months;
  if (min != null && ageMonths < min) return false;
  return true;
}
function recipeBlockedByInfantKeywords(r: RecipeRowPool, ageMonths: number): boolean {
  const text = [r.title ?? "", r.description ?? ""].join(" ").toLowerCase();
  if (ageMonths < 36 && AGE_RESTRICTED.some((t) => text.includes(t))) return true;
  if (ageMonths <= 12 && INFANT_FORBIDDEN_12.some((t) => text.includes(t))) return true;
  if (ageMonths < 24 && TODDLER_UNDER_24_FORBIDDEN.some((t) => text.includes(t))) return true;
  return false;
}
function passesProfileFilter(r: RecipeRowPool, memberData: MemberDataPool | null | undefined): boolean {
  if (!passesPreferenceFilters(r, memberData)) return false;
  const ageMonths = memberData?.age_months;
  if (ageMonths != null && ageMonths < 36) {
    const text = [r.title ?? "", r.description ?? ""].join(" ");
    if (containsAnyToken(text, AGE_RESTRICTED)) return false;
  }
  return true;
}

const SOUP_TOKENS = ["суп", "борщ", "щи", "soup"];
const BREAKFAST_TOKENS = ["каша", "овсян", "омлет", "сырник", "тост", "гранола"];
const SNACK_TOKENS = ["фрукт", "яблок", "груш", "банан", "печенье", "смузи"];
const LUNCH_DINNER_TOKENS = ["суп", "борщ", "рагу", "котлет", "плов", "паста", "рыба"];
function inferMealTypeFromTitle(title: string | null, description: string | null, ingredientsText: string): NormalizedMealType | null {
  const text = [title ?? "", description ?? "", ingredientsText].join(" ").toLowerCase();
  if (!text.trim()) return null;
  if (SOUP_TOKENS.some((t) => text.includes(t))) return "lunch";
  if (BREAKFAST_TOKENS.some((t) => text.includes(t))) return "breakfast";
  if (SNACK_TOKENS.some((t) => text.includes(t))) return "snack";
  if (LUNCH_DINNER_TOKENS.some((t) => text.includes(t))) return "dinner";
  return null;
}
function getResolvedMealType(r: RecipeRowPool): { resolved: NormalizedMealType | null } {
  const raw = normalizeMealType(r.meal_type);
  if (raw != null) return { resolved: raw };
  const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
  const inferred = inferMealTypeFromTitle(r.title, r.description, ing);
  return { resolved: inferred };
}

const DISH_CATEGORY_TOKENS = [
  { token: "каша", key: "porridge" }, { token: "овсян", key: "porridge" }, { token: "гречн", key: "porridge" },
  { token: "суп", key: "soup" }, { token: "борщ", key: "soup" }, { token: "щи", key: "soup" },
  { token: "солянк", key: "soup" }, { token: "рассольник", key: "soup" }, { token: "окрошк", key: "soup" }, { token: "гаспачо", key: "soup" },
];
function inferDishCategoryKey(title: string | null | undefined, _d?: string | null, _i?: string | null): string {
  const text = (title ?? "").toLowerCase();
  if (!text.trim()) return "other";
  for (const { token, key } of DISH_CATEGORY_TOKENS) {
    if (text.includes(token)) return key;
  }
  return "other";
}

function getCheapFilteredCount(
  pool: RecipeRowPool[],
  mealKey: string,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  memberData: MemberDataPool | null
): number {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const slot = normalizeMealType(mealKey) ?? (mealKey as NormalizedMealType);
  let filtered = pool.filter((r) => !excludeSet.has(r.id));
  filtered = filtered.filter((r) => !excludeTitleSet.has(normalizeTitleKey(r.title ?? "")));
  const ageContext = getMemberAgeContext(memberData);
  if (ageContext.applyFilter && ageContext.ageMonths != null) {
    filtered = filtered.filter((r) => recipeFitsAgeRange(r, ageContext.ageMonths!));
    filtered = filtered.filter((r) => !recipeBlockedByInfantKeywords(r, ageContext.ageMonths!));
  }
  if (isAdultContext(memberData)) {
    filtered = filtered.filter((r) => r.max_age_months == null || r.max_age_months > 12);
  }
  filtered = filtered.filter((r) => {
    const { resolved } = getResolvedMealType(r);
    return resolved != null && resolved === slot;
  });
  if (slot === "lunch") {
    filtered = filtered.filter((r) => r.is_soup === true || inferDishCategoryKey(r.title, r.description, null) === "soup");
  }
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData));
  filtered = filtered.filter((r) => {
    const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
    return slotSanityCheck(slot, [r.title ?? "", r.description ?? "", ing].join(" "));
  });
  return filtered.length;
}

async function fetchPoolCandidates(supabase: SupabaseClient, _userId: string, _memberId: string | null, limitCandidates: number): Promise<RecipeRowPool[]> {
  const { data: rows, error } = await supabase
    .from("recipes")
    .select("id, title, description, meal_type, is_soup, min_age_months, max_age_months, recipe_ingredients(name, display_text)")
    .in("source", ["seed", "starter", "manual", "week_ai", "chat_ai"])
    .order("created_at", { ascending: false })
    .limit(limitCandidates);
  if (error) {
    safeWarn("generate-plan fetchPoolCandidates", error.message);
    return [];
  }
  return (rows ?? []) as RecipeRowPool[];
}

/** In-memory only: no await. Filters pool and returns best match for slot (scoring: likes, recency, variety, base diversity). */
function pickFromPoolInMemory(
  pool: RecipeRowPool[],
  mealType: string,
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  likeMode: LikeMode = "neutral",
  usedBaseCounts?: Record<string, number>
): { id: string; title: string; matchedLike: boolean; primaryBase: string } | null {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const slot = normalizeMealType(mealType) ?? (mealType as NormalizedMealType);
  let filtered = pool.filter((r) => !excludeSet.has(r.id));
  filtered = filtered.filter((r) => !excludeTitleSet.has(normalizeTitleKey(r.title ?? "")));
  const ageContext = getMemberAgeContext(memberData);
  if (ageContext.applyFilter && ageContext.ageMonths != null) {
    filtered = filtered.filter((r) => recipeFitsAgeRange(r, ageContext.ageMonths!));
    filtered = filtered.filter((r) => !recipeBlockedByInfantKeywords(r, ageContext.ageMonths!));
  }
  if (isAdultContext(memberData)) {
    filtered = filtered.filter((r) => r.max_age_months == null || r.max_age_months > 12);
  }
  filtered = filtered.filter((r) => {
    const { resolved } = getResolvedMealType(r);
    return resolved != null && resolved === slot;
  });
  /** Обед: только супы (и аналоги). Если подходящего нет — слот остаётся пустым. */
  if (slot === "lunch") {
    filtered = filtered.filter((r) => r.is_soup === true || inferDishCategoryKey(r.title, r.description, null) === "soup");
  }
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData));
  filtered = filtered.filter((r) => {
    const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
    return slotSanityCheck(slot, [r.title ?? "", r.description ?? "", ing].join(" "));
  });
  const likeTokens = buildLikeTokens(memberData);
  const recentSignatures = buildRecentSignatureSet(excludeTitleKeys);
  shuffleArray(filtered);
  const best = pickBestRecipeForSlot(filtered, { likeTokens, likeMode, recentSignatures, usedBaseCounts });
  if (!best) return null;
  const primaryBase = inferPrimaryBase(best);
  return { id: best.id, title: best.title, matchedLike: hasLikeMatch(best, likeTokens), primaryBase };
}

function normalizeMealsForWrite(meals: Record<string, MealSlot | null | undefined>): Record<string, MealSlot> {
  const out: Record<string, MealSlot> = {};
  for (const [key, slot] of Object.entries(meals)) {
    const normalized = normalizeSlotForWrite(slot as import("../_shared/mealJson.ts").MealSlotValue);
    if (normalized) out[key] = normalized as MealSlot;
  }
  return out;
}

async function upsertMealPlanRow(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dayKey: string,
  meals: Record<string, MealSlot | null | undefined>
): Promise<{ error?: string }> {
  const normalized = normalizeMealsForWrite(meals);
  let q = supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: existing } = await q.maybeSingle();
  const current = (existing as { meals?: Record<string, unknown> } | null)?.meals ?? {};
  const merged = { ...current };
  for (const [k, v] of Object.entries(normalized)) merged[k] = v;
  if ((existing as { id?: string } | null)?.id) {
    const { error: updateErr } = await supabase.from("meal_plans_v2").update({ meals: merged }).eq("id", (existing as { id: string }).id);
    return updateErr ? { error: updateErr.message } : {};
  }
  const { error: insertErr } = await supabase.from("meal_plans_v2").insert({ user_id: userId, member_id: memberId, planned_date: dayKey, meals: merged });
  return insertErr ? { error: insertErr.message } : {};
}

async function fetchRecipeAndTitleKeysFromPlans(supabase: SupabaseClient, userId: string, memberId: string | null, dateKeys: string[]): Promise<{ recipeIds: string[]; titleKeys: string[] }> {
  if (dateKeys.length === 0) return { recipeIds: [], titleKeys: [] };
  let q = supabase.from("meal_plans_v2").select("meals").eq("user_id", userId).in("planned_date", dateKeys);
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
async function fetchTitleKeysByMealTypeFromPlans(supabase: SupabaseClient, userId: string, memberId: string | null, dateKeys: string[]): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const k of MEAL_KEYS) out[k] = new Set<string>();
  if (dateKeys.length === 0) return out;
  let q = supabase.from("meal_plans_v2").select("meals").eq("user_id", userId).in("planned_date", dateKeys);
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
async function fetchMealTitlesByDateFromPlans(supabase: SupabaseClient, userId: string, memberId: string | null, dateKeys: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (dateKeys.length === 0) return out;
  let q = supabase.from("meal_plans_v2").select("planned_date, meals").eq("user_id", userId).in("planned_date", dateKeys);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: rows } = await q;
  for (const row of rows ?? []) {
    const dayKey = (row as { planned_date?: string }).planned_date;
    if (!dayKey) continue;
    const meals = (row as { meals?: Record<string, { title?: string }> }).meals ?? {};
    const titles: string[] = [];
    for (const mealKey of MEAL_KEYS) {
      const title = meals[mealKey]?.title;
      if (title) titles.push(title);
    }
    out[dayKey] = titles;
  }
  return out;
}
async function fetchCategoriesByMealTypeFromPlans(supabase: SupabaseClient, userId: string, memberId: string | null, dateKeys: string[]): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const k of MEAL_KEYS) out[k] = new Set<string>();
  if (dateKeys.length === 0) return out;
  let q = supabase.from("meal_plans_v2").select("meals").eq("user_id", userId).in("planned_date", dateKeys);
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

const MIN_QUALITY_CANDIDATES = 8;
const FREE_PLAN_FILL_LIMIT = 2;
const SUPABASE_TIMEOUT_MS = 8000;
/** Single-day pool size. */
const POOL_LIMIT_ONE_DAY = 120;
/** Week plan: need at least 7 per meal type (breakfast/lunch/snack/dinner); family dinner filter and meal-type inference reduce effective pool — use larger fetch. */
const POOL_LIMIT_WEEK = 280;
/** Top-K candidates to score (rest filtered but not scored). */
const TOP_K_SCORE = 80;
/** Min candidates for family dinner before we fall back to pool without family-dinner filter. */
const MIN_FAMILY_DINNER = 5;
const debugPool = () => typeof Deno !== "undefined" && Deno.env?.get?.("DEBUG_POOL") === "true";

/** Weekly diversity: max uses of same primary base (e.g. cottage cheese, oatmeal) per week. */
const MAX_BASE_PER_WEEK = 5;
/** Penalty per slot when base is already at or over cap (diminishing priority). */
const DIVERSITY_BASE_PENALTY = 6;

// ——— Scoring helpers (likes bonus, recency, variety penalty, base diversity) ———
const STOP_WORDS = new Set(["и", "в", "на", "с", "по", "для", "из", "к", "о", "у", "без", "от", "до", "the", "and", "with", "for", "from", "with"]);
/** Signatures from week + last days + body.exclude_title_keys (session); used for variety penalty. */
function buildRecentSignatureSet(existingTitleKeys: string[]): Set<string> {
  const out = new Set<string>();
  for (const key of existingTitleKeys) {
    if (!key || typeof key !== "string") continue;
    const tokens = key.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
    const meaningful = tokens.slice(0, 3);
    if (meaningful.length > 0) out.add(meaningful.sort().join(" "));
  }
  return out;
}
type ScoreRecipeCtx = {
  likeTokens: string[];
  likeMode: LikeMode;
  recentSignatures: Set<string>;
  /** Week only: counts per primary base for diversity penalty. */
  usedBaseCounts?: Record<string, number>;
};
function scoreRecipeForSlot(r: RecipeRowPool, rankIndex: number, ctx: ScoreRecipeCtx): number {
  const likeScore = scoreLikeSignal(r, ctx.likeTokens, ctx.likeMode);
  const recencyScore = Math.max(0, 3 - Math.floor(rankIndex / 20));
  const titleTokens = (r.title ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t)).slice(0, 3);
  let varietyPenalty = 0;
  if (titleTokens.length > 0) {
    let overlap = 0;
    for (const t of titleTokens) {
      for (const existing of ctx.recentSignatures) {
        if (existing.includes(t)) {
          overlap++;
          break;
        }
      }
    }
    if (overlap >= 2) varietyPenalty = 4;
    else if (overlap === 1) varietyPenalty = 2;
  }
  let baseDiversityPenalty = 0;
  if (ctx.usedBaseCounts) {
    const base = inferPrimaryBase(r);
    const count = ctx.usedBaseCounts[base] ?? 0;
    if (count >= MAX_BASE_PER_WEEK) {
      baseDiversityPenalty = (count - MAX_BASE_PER_WEEK + 1) * DIVERSITY_BASE_PENALTY;
    }
  }
  return likeScore + recencyScore - varietyPenalty - baseDiversityPenalty;
}
const TOP_K_EXTEND = 120;
function pickBestRecipeForSlot(candidates: RecipeRowPool[], ctx: ScoreRecipeCtx): RecipeRowPool | null {
  if (candidates.length === 0) return null;
  const firstWindow = candidates.slice(0, TOP_K_SCORE);
  let best = firstWindow[0];
  let bestScore = scoreRecipeForSlot(firstWindow[0], 0, ctx);
  let bestIndex = 0;
  for (let i = 1; i < firstWindow.length; i++) {
    const s = scoreRecipeForSlot(firstWindow[i], i, ctx);
    if (s > bestScore || (s === bestScore && i < bestIndex)) {
      bestScore = s;
      best = firstWindow[i];
      bestIndex = i;
    }
  }
  if (bestScore <= 0 && candidates.length > TOP_K_SCORE) {
    const secondWindow = candidates.slice(0, TOP_K_EXTEND);
    for (let i = TOP_K_SCORE; i < secondWindow.length; i++) {
      const s = scoreRecipeForSlot(secondWindow[i], i, ctx);
      if (s > bestScore || (s === bestScore && i < bestIndex)) {
        bestScore = s;
        best = secondWindow[i];
        bestIndex = i;
      }
    }
  }
  return best;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !authHeader) {
      return new Response(JSON.stringify({ error: "missing_config_or_auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const body = (await req.json().catch(() => ({}))) as {
      action?: "start" | "run" | "replace_slot" | "cancel";
      mode?: "autofill" | "upgrade";
      job_id?: string;
      type?: "day" | "week";
      member_id?: string | null;
      member_data?: MemberDataPool;
      day_key?: string;
      day_keys?: string[];
      start_key?: string;
      meal_type?: string;
      exclude_recipe_ids?: string[];
      exclude_title_keys?: string[];
      /** 1 = first try (may return retry_suggested); 2 = second try → then show PoolExhaustedSheet. Default 1. */
      attempt?: number;
    };
    const action = body.action === "run" ? "run" : body.action === "replace_slot" ? "replace_slot" : body.action === "cancel" ? "cancel" : body.action === "start" ? "start" : null;
    const type = body.type === "day" || body.type === "week" ? body.type : "day";
    const memberId = body.member_id ?? null;
    const memberData: MemberDataPool | null = body.member_data ?? null;
    /** Для режима «Семья» (member_id == null) храним план в meal_plans_v2 с member_id = null, чтобы фронт читал по member_id IS NULL. */
    const effectiveMemberId: string | null = memberId;

    safeLog("[generate-plan] request", { action: action ?? "none", mode: body.mode, type, hasDayKey: !!body.day_key, hasJobId: !!body.job_id });

    if (action === "cancel") {
      const cancelJobId = typeof body.job_id === "string" ? body.job_id : null;
      if (!cancelJobId) {
        return new Response(JSON.stringify({ error: "job_id_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: cancelJob, error: cancelErr } = await supabase.from("plan_generation_jobs").select("id, user_id, status").eq("id", cancelJobId).single();
      if (cancelErr || !cancelJob || cancelJob.user_id !== userId) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabase.from("plan_generation_jobs").update({ status: "error", error_text: "cancelled_by_user", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", cancelJobId);
      return new Response(JSON.stringify({ job_id: cancelJobId, status: "error", cancelled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "replace_slot") {
      const dayKey = typeof body.day_key === "string" ? body.day_key : null;
      const mealType = typeof body.meal_type === "string" ? body.meal_type : null;
      if (!dayKey || !mealType || !MEAL_KEYS.includes(mealType as NormalizedMealType)) {
        return new Response(JSON.stringify({ error: "missing_day_key_or_meal_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let replaceMemberData: MemberDataPool | null = memberData;
      if (memberId == null) {
        const { data: membersRows } = await supabase.from("members").select("id, name, age_months, allergies, preferences, likes, dislikes").eq("user_id", userId);
        const membersList = (membersRows ?? []) as Array<{ id: string; name?: string; age_months?: number | null; allergies?: string[] | null; preferences?: string[] | null; likes?: string[] | null; dislikes?: string[] | null }>;
        replaceMemberData = buildFamilyMemberDataForPlan(membersList);
      } else {
        const { data: memberRow } = await supabase.from("members").select("age_months, allergies, likes, dislikes").eq("id", effectiveMemberId).eq("user_id", userId).maybeSingle();
        const m = memberRow as { age_months?: number | null; allergies?: string[] | null; likes?: string[] | null; dislikes?: string[] | null } | null;
        if (m) {
          replaceMemberData = {
            ...(memberData ?? {}),
            age_months: m.age_months ?? memberData?.age_months,
            allergies: Array.isArray(m.allergies) && m.allergies.length > 0 ? m.allergies : (memberData?.allergies ?? []),
            likes: Array.isArray(m.likes) && m.likes.length > 0 ? m.likes : (memberData?.likes ?? []),
            dislikes: Array.isArray(m.dislikes) && m.dislikes.length > 0 ? m.dislikes : (memberData?.dislikes ?? []),
          };
        }
      }
      const { data: existingRow } = await supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey).is("member_id", effectiveMemberId).maybeSingle();
      const currentMeals = (existingRow as { meals?: Record<string, { recipe_id?: string; title?: string }> } | null)?.meals ?? {};
      const dateKeys = [dayKey, ...getLastNDaysKeys(dayKey, 6)];
      const { recipeIds: replaceRecipeIds, titleKeys: replaceTitleKeys } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, effectiveMemberId, dateKeys);
      const excludeRecipeIds = [...(body.exclude_recipe_ids ?? []), ...replaceRecipeIds];
      // include body.exclude_title_keys (session) + week/last days so recentSignatures and exclude set match.
      const excludeTitleKeys = [...new Set([...(body.exclude_title_keys ?? []), ...replaceTitleKeys])];
      const pool = await fetchPoolCandidates(supabase, userId, effectiveMemberId, POOL_LIMIT_ONE_DAY);
      const poolForReplace =
        memberId == null && mealType === "dinner" ? pool.filter((r) => isFamilyDinnerCandidate(r)) : pool;
      let picked = pickFromPoolInMemory(poolForReplace, mealType, replaceMemberData, excludeRecipeIds, excludeTitleKeys);
      if (!picked && memberId == null && mealType === "dinner" && poolForReplace.length < MIN_FAMILY_DINNER) {
        picked = pickFromPoolInMemory(pool, mealType, replaceMemberData, excludeRecipeIds, excludeTitleKeys);
      }
      if (picked) {
        // TODO: when migration + RPC for atomic increment exist, increment recipes.picked_count here only (not in plan fill).
        const newMeals = { ...currentMeals, [mealType]: { recipe_id: picked.id, title: picked.title, plan_source: "pool" as const } };
        const upsertErr = await upsertMealPlanRow(supabase, userId, effectiveMemberId, dayKey, newMeals);
        if (upsertErr.error) {
          return new Response(JSON.stringify({ error: "replace_failed", reason: "attach_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ pickedSource: "pool", newRecipeId: picked.id, title: picked.title, plan_source: "pool", reason: "pool" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const attempt = typeof body.attempt === "number" ? body.attempt : 1;
      const retrySuggested = attempt < 2;
      return new Response(
        JSON.stringify({
          ok: false,
          error: "replace_failed",
          code: retrySuggested ? "pool_exhausted_retry" : "pool_exhausted",
          reason: retrySuggested ? "pool_exhausted_retry" : "pool_exhausted",
          retry_suggested: retrySuggested,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startKey = type === "week" ? (body.start_key ?? getRolling7Dates(getTodayKey())[0]) : null;
    const dayKeys =
      type === "day" && body.day_key
        ? [body.day_key]
        : type === "week"
          ? (Array.isArray(body.day_keys) && body.day_keys.length > 0 ? body.day_keys : getRolling7Dates(startKey ?? getTodayKey()))
          : [];
    if (dayKeys.length === 0) {
      return new Response(JSON.stringify({ error: "missing_day_key_or_start_key" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "start") {
      const { data: existing } = await supabase.from("plan_generation_jobs").select("id, status").eq("user_id", userId).eq("member_id", effectiveMemberId).eq("type", type).eq("status", "running").maybeSingle();
      if ((existing as { id?: string } | null)?.id) {
        return new Response(JSON.stringify({ job_id: (existing as { id: string }).id, status: "running" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: job, error: jobInsertError } = await supabase
        .from("plan_generation_jobs")
        .insert({ user_id: userId, member_id: effectiveMemberId, type, status: "running", progress_total: dayKeys.length, progress_done: 0 })
        .select("id")
        .single();
      if (jobInsertError || !(job as { id?: string })?.id) {
        safeError("generate-plan job insert", jobInsertError?.message);
        return new Response(JSON.stringify({ error: "job_insert_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ job_id: (job as { id: string }).id, status: "running" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isUpgrade = body.mode === "upgrade";
    const runJobId = isUpgrade ? null : (typeof body.job_id === "string" ? body.job_id : null);
    if (action === "run" && !runJobId) {
      return new Response(JSON.stringify({ error: "job_id_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (runJobId) {
      const { data: runJob, error: runJobErr } = await supabase.from("plan_generation_jobs").select("id, user_id, status").eq("id", runJobId).single();
      if (runJobErr || !runJob || runJob.user_id !== userId) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (runJob.status !== "running") {
        return new Response(JSON.stringify({ job_id: runJobId, status: runJob.status }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const jobId = runJobId as string | null;
    const requestId = jobId ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`);
    const tRunStart = Date.now();
    const isSingleDay = dayKeys.length === 1;
    safeLog("[RUN MODE]", { requestId, isSingleDay, dayKeysCount: dayKeys.length, mode: isUpgrade ? "upgrade" : "run" });

    const [profileRow, planFillUsed] = await Promise.all([
      supabase.from("profiles_v2").select("status, premium_until, trial_until").eq("user_id", userId).maybeSingle(),
      supabase.rpc("get_usage_count_today", { p_user_id: userId, p_feature: "plan_fill_day" }),
    ]);
    const prof = (profileRow.data ?? null) as { status?: string; premium_until?: string | null; trial_until?: string | null } | null;
    const hasPremium = prof?.premium_until && new Date(prof.premium_until) > new Date();
    const hasTrial = prof?.trial_until && new Date(prof.trial_until) > new Date();
    const isPremiumOrTrial = prof?.status === "premium" || prof?.status === "trial" || !!hasPremium || !!hasTrial;
    if (!isPremiumOrTrial) {
      const used = typeof planFillUsed.data === "number" ? planFillUsed.data : 0;
      if (used >= FREE_PLAN_FILL_LIMIT) {
        return new Response(
          JSON.stringify({ error: "LIMIT_REACHED", code: "LIMIT_REACHED", message: "Лимит на сегодня исчерпан.", payload: { feature: "plan_fill_day", limit: FREE_PLAN_FILL_LIMIT, used } }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const poolLimit = dayKeys.length > 1 ? POOL_LIMIT_WEEK : POOL_LIMIT_ONE_DAY;
    const poolCandidates = await fetchPoolCandidates(supabase, userId, effectiveMemberId, poolLimit);

    let effectiveMemberData: MemberDataPool | null = memberData;
    if (memberId == null) {
      const { data: membersRows } = await supabase.from("members").select("id, name, age_months, allergies, preferences, likes, dislikes").eq("user_id", userId);
      const membersList = (membersRows ?? []) as Array<{ id: string; name?: string; age_months?: number | null; allergies?: string[] | null; preferences?: string[] | null; likes?: string[] | null; dislikes?: string[] | null }>;
      effectiveMemberData = buildFamilyMemberDataForPlan(membersList);
      safeLog("family_mode", { members_count: membersList.length });
    } else {
      const { data: memberRow } = await supabase.from("members").select("age_months, allergies, likes, dislikes").eq("id", effectiveMemberId).eq("user_id", userId).maybeSingle();
      const m = memberRow as { age_months?: number | null; allergies?: string[] | null; likes?: string[] | null; dislikes?: string[] | null } | null;
      if (m) {
        effectiveMemberData = {
          ...(memberData ?? {}),
          age_months: m.age_months ?? memberData?.age_months,
          allergies: Array.isArray(m.allergies) && m.allergies.length > 0 ? m.allergies : (memberData?.allergies ?? []),
          likes: Array.isArray(m.likes) && m.likes.length > 0 ? m.likes : (memberData?.likes ?? []),
          dislikes: Array.isArray(m.dislikes) && m.dislikes.length > 0 ? m.dislikes : (memberData?.dislikes ?? []),
        };
      }
    }

    const isAdultPlan = isAdultContext(effectiveMemberData);
    const poolSuitableCount = isAdultPlan ? poolCandidates.filter((r) => r.max_age_months == null || r.max_age_months > 12).length : poolCandidates.length;

    if (poolCandidates.length === 0 || (isAdultPlan && poolSuitableCount === 0)) {
      const totalMs = Date.now() - tRunStart;
      safeLog("[TIMING] done", { requestId, totalMs, filledDaysCount: 0, filledSlotsCount: 0, fastFailReason: isAdultPlan ? "adult_no_pool" : "no_pool" });
      if (totalMs > 2000) safeWarn("[TIMING WARN]", { stage: "totalMs", ms: totalMs, requestId });
      if (jobId) {
        await supabase.from("plan_generation_jobs").update({ status: "done", error_text: "No pool candidates", progress_done: 0, progress_total: dayKeys.length, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      const totalSlots = dayKeys.length * MEAL_KEYS.length;
      if (isUpgrade) {
        return new Response(
          JSON.stringify({ ok: true, replacedCount: 0, unchangedCount: 0, aiFallbackCount: 0, totalSlots, assignedCount: 0, filledSlotsCount: 0, emptySlotsCount: totalSlots, filledDaysCount: 0, emptyDaysCount: dayKeys.length, partial: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ ok: true, job_id: jobId, status: "done", totalSlots, filledSlotsCount: 0, emptySlotsCount: totalSlots, filledDaysCount: 0, emptyDaysCount: dayKeys.length, partial: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cheapTotal = 0;
    for (const mk of MEAL_KEYS) cheapTotal += getCheapFilteredCount(poolCandidates, mk, [], [], effectiveMemberData);
    if (cheapTotal === 0) {
      const totalMs = Date.now() - tRunStart;
      safeLog("[TIMING] done", { requestId, totalMs, filledDaysCount: 0, filledSlotsCount: 0, fastFailReason: "cheap_zero" });
      if (totalMs > 2000) safeWarn("[TIMING WARN]", { stage: "totalMs", ms: totalMs, requestId });
      if (jobId) {
        await supabase.from("plan_generation_jobs").update({ status: "done", error_text: "No pool candidates after filters", progress_done: 0, progress_total: dayKeys.length, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      const totalSlots = dayKeys.length * MEAL_KEYS.length;
      if (isUpgrade) {
        return new Response(
          JSON.stringify({ ok: true, replacedCount: 0, unchangedCount: 0, aiFallbackCount: 0, totalSlots, assignedCount: 0, filledSlotsCount: 0, emptySlotsCount: totalSlots, filledDaysCount: 0, emptyDaysCount: dayKeys.length, partial: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ ok: true, job_id: jobId, status: "done", totalSlots, filledSlotsCount: 0, emptySlotsCount: totalSlots, filledDaysCount: 0, emptyDaysCount: dayKeys.length, partial: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let usedRecipeIds: string[] = [];
    let usedTitleKeys: string[] = [];
    let usedTitleKeysByMealType: Record<string, Set<string>> = {};
    let usedCategoriesByMealType: Record<string, Set<string>> = {};
    // "Любит" — мягкий сигнал: максимум один явный like-match в день и не чаще, чем примерно раз в 2-3 дня.
    const likeTokens = buildLikeTokens(effectiveMemberData);
    const recentLikedDayWindow: boolean[] = [];
    for (const k of MEAL_KEYS) {
      usedTitleKeysByMealType[k] = new Set<string>();
      usedCategoriesByMealType[k] = new Set<string>();
    }
    if (likeTokens.length > 0) {
      const lookbackKeys = [...getLastNDaysKeys(dayKeys[0], 2)].reverse();
      const titlesByDate = await fetchMealTitlesByDateFromPlans(supabase, userId, effectiveMemberId, lookbackKeys);
      for (const key of lookbackKeys) {
        recentLikedDayWindow.push(hasLikedTitlesMatch(titlesByDate[key] ?? [], likeTokens));
      }
    }
    if (dayKeys.length === 1 && Array.isArray(body.day_keys) && body.day_keys.length > 0) {
      const otherDayKeys = body.day_keys.filter((k) => typeof k === "string" && k !== dayKeys[0]);
      if (otherDayKeys.length > 0) {
        const { recipeIds: otherIds, titleKeys: otherTitles } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, effectiveMemberId, otherDayKeys);
        usedRecipeIds = [...otherIds];
        usedTitleKeys = [...otherTitles];
      }
    }
    if (dayKeys.length > 1 && poolSuitableCount >= MIN_QUALITY_CANDIDATES) {
      let weekQ = supabase.from("meal_plans_v2").select("planned_date, meals").eq("user_id", userId).gte("planned_date", dayKeys[0]).lte("planned_date", dayKeys[dayKeys.length - 1]);
      if (effectiveMemberId == null) weekQ = weekQ.is("member_id", null);
      else weekQ = weekQ.eq("member_id", effectiveMemberId);
      const { data: weekRows } = await weekQ;
      for (const row of weekRows ?? []) {
        const meals = (row as { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }).meals ?? {};
        for (const k of MEAL_KEYS) {
          const slot = meals[k];
          if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
          if (slot?.title) {
            usedTitleKeys.push(normalizeTitleKey(slot.title));
            usedTitleKeysByMealType[k].add(normalizeTitleKey(slot.title));
            usedCategoriesByMealType[k].add(inferDishCategoryKey(slot.title, null, null));
          }
        }
      }
      const last4Keys = getLastNDaysKeys(dayKeys[0], 4);
      const { recipeIds: prev4RecipeIds, titleKeys: prev4TitleKeys } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, effectiveMemberId, last4Keys);
      usedRecipeIds = [...usedRecipeIds, ...prev4RecipeIds];
      usedTitleKeys = [...usedTitleKeys, ...prev4TitleKeys];
      const last4TitleByMeal = await fetchTitleKeysByMealTypeFromPlans(supabase, userId, effectiveMemberId, last4Keys);
      const last4CatByMeal = await fetchCategoriesByMealTypeFromPlans(supabase, userId, effectiveMemberId, last4Keys);
      for (const k of MEAL_KEYS) {
        usedTitleKeysByMealType[k] = new Set([...usedTitleKeysByMealType[k], ...(last4TitleByMeal[k] ?? [])]);
        usedCategoriesByMealType[k] = new Set([...usedCategoriesByMealType[k], ...(last4CatByMeal[k] ?? [])]);
      }
    }

    let totalDbCount = 0;
    let totalAiCount = 0;
    let lastDayKey: string | null = null;
    /** Week only: counts per primary base for diversity (cap + penalty). */
    const usedBaseCounts: Record<string, number> = dayKeys.length > 1 ? {} : ({} as Record<string, number>);
    const useBaseDiversity = dayKeys.length > 1;

    if (jobId) {
      await supabase.from("plan_generation_jobs").update({ status: "running", progress_total: dayKeys.length, progress_done: 0, updated_at: new Date().toISOString() }).eq("id", jobId);
    }

    for (let i = 0; i < dayKeys.length; i++) {
      const dayKey = dayKeys[i];
      lastDayKey = dayKey;
      let dayLikedRecipeCount = 0;
      if (jobId && !isSingleDay) {
        await supabase.from("plan_generation_jobs").update({ progress_done: i, last_day_key: dayKey, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      const { data: existingRow } = await supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey).is("member_id", effectiveMemberId).maybeSingle();
      const currentMeals = (existingRow as { meals?: Record<string, MealSlot> } | null)?.meals ?? {};
      const newMeals = { ...currentMeals } as Record<string, MealSlot>;

      for (const mealKey of MEAL_KEYS) {
        const poolForSlot =
          memberId == null && mealKey === "dinner"
            ? poolCandidates.filter((r) => isFamilyDinnerCandidate(r))
            : poolCandidates;
        const currentSlot = currentMeals[mealKey];
        const slotLikeMode: LikeMode = likeTokens.length === 0
          ? "neutral"
          : (dayLikedRecipeCount > 0 || recentLikedDayWindow.some(Boolean) ? "avoid" : "favor");
        const excludeIdsForSlot = currentSlot?.recipe_id ? [...usedRecipeIds, currentSlot.recipe_id] : usedRecipeIds;
        const excludeTitlesBase = [...usedTitleKeys, ...(usedTitleKeysByMealType[mealKey] ? [...usedTitleKeysByMealType[mealKey]] : [])];
        const excludeTitlesForSlot = currentSlot?.title ? [...excludeTitlesBase, normalizeTitleKey(currentSlot.title)] : excludeTitlesBase;
        const baseCountsForSlot = useBaseDiversity ? usedBaseCounts : undefined;
        let picked = pickFromPoolInMemory(poolForSlot, mealKey, effectiveMemberData, excludeIdsForSlot, excludeTitlesForSlot, slotLikeMode, baseCountsForSlot);
        if (!picked && memberId == null && mealKey === "dinner" && poolForSlot.length < MIN_FAMILY_DINNER) {
          picked = pickFromPoolInMemory(poolCandidates, mealKey, effectiveMemberData, excludeIdsForSlot, excludeTitlesForSlot, slotLikeMode, baseCountsForSlot);
        }
        if (picked) {
          newMeals[mealKey] = { recipe_id: picked.id, title: picked.title, plan_source: "pool" };
          if (picked.matchedLike) dayLikedRecipeCount++;
          usedRecipeIds.push(picked.id);
          usedTitleKeys.push(normalizeTitleKey(picked.title));
          usedTitleKeysByMealType[mealKey]?.add(normalizeTitleKey(picked.title));
          usedCategoriesByMealType[mealKey]?.add(inferDishCategoryKey(picked.title, null, null));
          if (useBaseDiversity) {
            usedBaseCounts[picked.primaryBase] = (usedBaseCounts[picked.primaryBase] ?? 0) + 1;
          }
          totalDbCount++;
        }
      }

      const upsertErr = await upsertMealPlanRow(supabase, userId, effectiveMemberId, dayKey, newMeals);
      if (upsertErr.error && debugPool()) safeWarn("[plan] upsert failed", { dayKey, error: upsertErr.error });
      if (likeTokens.length > 0) {
        recentLikedDayWindow.push(dayLikedRecipeCount > 0);
        while (recentLikedDayWindow.length > 2) recentLikedDayWindow.shift();
      }
    }

    if (!isPremiumOrTrial) {
      await supabase.from("usage_events").insert({ user_id: userId, member_id: effectiveMemberId, feature: "plan_fill_day" });
    }

    if (jobId) {
      const filledSlotsFinal = totalDbCount + totalAiCount;
      const totalSlotsRun = dayKeys.length * MEAL_KEYS.length;
      const errorTextFinal = filledSlotsFinal < totalSlotsRun ? "partial:pool_exhausted" : null;
      await supabase
        .from("plan_generation_jobs")
        .update({ status: "done", error_text: errorTextFinal, progress_done: dayKeys.length, last_day_key: lastDayKey, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    const totalMs = Date.now() - tRunStart;
    const filledSlotsCount = totalDbCount + totalAiCount;
    const filledDaysCount = Math.floor(filledSlotsCount / MEAL_KEYS.length);
    safeLog("[TIMING] done", { requestId, totalMs, filledDaysCount, filledSlotsCount });
    if (totalMs > 2000) safeWarn("[TIMING WARN]", { stage: "totalMs", ms: totalMs, requestId });

    const totalSlots = dayKeys.length * MEAL_KEYS.length;
    const emptySlotsCount = totalSlots - filledSlotsCount;
    const partial = emptySlotsCount > 0;

    if (isUpgrade) {
      return new Response(
        JSON.stringify({
          ok: true,
          replacedCount: totalDbCount,
          unchangedCount: 0,
          aiFallbackCount: totalAiCount,
          totalSlots,
          assignedCount: totalDbCount,
          filledSlotsCount,
          emptySlotsCount,
          filledDaysCount,
          emptyDaysCount: dayKeys.length - filledDaysCount,
          partial,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        job_id: jobId,
        status: "done",
        totalSlots,
        filledSlotsCount,
        emptySlotsCount,
        filledDaysCount,
        emptyDaysCount: dayKeys.length - filledDaysCount,
        partial,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    safeError("generate-plan", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
