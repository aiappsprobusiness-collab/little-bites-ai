/**
 * Edge Function: generate-plan (rewrite).
 *
 * Architecture:
 * - Single entry: POST JSON body. Actions: cancel, replace_slot, start, run.
 * - mode=upgrade is an alias: same pipeline as run but without job_id; response shape is upgrade (replacedCount, filledSlotsCount, etc.).
 * - dayKeys from type + day_key / day_keys / start_key. If dayKeys.length === 1 -> SINGLE-DAY path (no week DB, in-memory pick only). If dayKeys.length > 1 -> WEEK path (buildExcludeSets: неделя + 4 дня, всегда).
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
import {
  collectRecipeSlotsFromMealPlansExcludingSlot,
  fetchAndMergeKeyIngredientCountsForSlotEntries,
  fetchKeyIngredientSlotEntriesForDateKeys,
} from "../_shared/plan/planIngredientCounts.ts";
import { inferPrimaryBase } from "../_shared/primaryBase.ts";
import {
  addKeyIngredientKeysToCounts,
  computeWeeklyKeyIngredientPenaltyCalibrated,
  deriveKeyIngredientSignals,
} from "../../../shared/keyIngredientSignals.ts";
import {
  evaluateInfantRecipeComplementaryRules,
  evaluateInfantSecondaryFamiliarOnly,
  isInfantComplementarySeedCorePoolAge,
} from "../../../shared/infantComplementaryRules.ts";
import { passesPreferenceFilters } from "./preferenceRules.ts";
import {
  type CulturalFamiliarityCountKey,
  computeCulturalFamiliarityBonus,
  countCulturalFamiliarityInRecipes,
  culturalFamiliarityCountKey,
} from "./culturalPlanScoring.ts";
import {
  type CulturalPickComparison,
  type CulturalSummaryAccumulator,
  accumulateCulturalSummary,
  buildCulturalPickComparison,
  compareScoredForSlot,
  createEmptyCulturalSummaryAccumulator,
  finalizeCulturalSummary,
  type ScoredCandidateRow,
} from "./culturalPlanDebug.ts";
import { trustOrder } from "./trustLevelTier.ts";
import {
  buildAlignedRankSalt,
  buildRankSalt,
  computeCompositeScore,
  explainRankingTail,
  explorationPickActive,
  rankJitter,
  stableSortPoolForRanking,
} from "./planRankComposite.ts";

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

type MemberDataPool = {
  allergies?: string[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
  age_months?: number;
  type?: string | null;
  introduced_product_keys?: string[];
  introducing_product_key?: string | null;
  introducing_started_at?: string | null;
};
type RecipeRowPool = {
  id: string; title: string; norm_title?: string | null; description: string | null; meal_type?: string | null;
  is_soup?: boolean | null;
  max_age_months?: number | null; min_age_months?: number | null;
  nutrition_goals?: unknown;
  recipe_ingredients?: Array<{ name?: string; display_text?: string; category?: string | null }> | null;
  score?: number | null;
  trust_level?: string | null;
  /** Stage 4.4: культурные метаданные (scoring только familiarity на MVP). */
  cuisine?: string | null;
  region?: string | null;
  familiarity?: string | null;
};
type MealSlot = { recipe_id?: string; title?: string; plan_source?: "pool" | "ai" };

const ALLOWED_NUTRITION_GOALS = [
  "balanced",
  "iron_support",
  "brain_development",
  "weight_gain",
  "gentle_digestion",
  "energy_boost",
] as const;
type NutritionGoal = (typeof ALLOWED_NUTRITION_GOALS)[number];
const GOAL_SET = new Set<string>(ALLOWED_NUTRITION_GOALS);

/** Stage 4.3: family flags + age/soft scoring (no pool narrowing). */
type FamilyScoringContext = {
  hasInfant: boolean;
  hasToddler: boolean;
  hasMembers: boolean;
  /** any(member.age < 3): age_months < 36 */
  softMode: boolean;
  /** age_months ≥ 12 only; infants excluded from age_bonus */
  eligibleMembers: { ageMonths: number }[];
  ageGroupsDistribution: Record<string, number>;
  /** average age in years (members with known age_months only) */
  avgAgeYears: number | null;
  membersCount: number;
};

function buildFamilyScoringContext(
  memberRows: Array<{ age_months?: number | null }>,
): FamilyScoringContext {
  const membersCount = memberRows.length;
  const hasMembers = membersCount > 0;
  const dist: Record<string, number> = {
    infant_lt_1y: 0,
    toddler_1_3y: 0,
    child_3_10y: 0,
    adult_10p: 0,
    unknown: 0,
  };
  let hasInfant = false;
  let hasToddler = false;
  const eligibleMembers: { ageMonths: number }[] = [];
  let sumMonthsForAvg = 0;
  let nKnownAge = 0;

  for (const row of memberRows) {
    const raw = row.age_months;
    if (raw == null || !Number.isFinite(Number(raw))) {
      dist.unknown++;
      continue;
    }
    const ageMonths = Math.max(0, Math.round(Number(raw)));
    sumMonthsForAvg += ageMonths;
    nKnownAge++;
    if (ageMonths < 12) {
      hasInfant = true;
      dist.infant_lt_1y++;
    } else {
      eligibleMembers.push({ ageMonths });
    }
    if (ageMonths < 36) hasToddler = true;
    if (ageMonths >= 12 && ageMonths < 36) dist.toddler_1_3y++;
    else if (ageMonths >= 36 && ageMonths < 120) dist.child_3_10y++;
    else if (ageMonths >= 120) dist.adult_10p++;
  }

  const avgAgeYears = nKnownAge > 0 ? sumMonthsForAvg / nKnownAge / 12 : null;

  return {
    hasInfant,
    hasToddler,
    hasMembers,
    softMode: hasToddler,
    eligibleMembers,
    ageGroupsDistribution: dist,
    avgAgeYears,
    membersCount,
  };
}

/** Age buckets for scoring: only members with age ≥ 12 months (1y). */
function ageScoringBucket(ageMonths: number): "toddler" | "child" | "adult" | null {
  if (ageMonths < 12) return null;
  if (ageMonths < 36) return "toddler";
  if (ageMonths < 120) return "child";
  return "adult";
}

function ageGoalContribution(bucket: "toddler" | "child" | "adult", goal: NutritionGoal): number {
  if (bucket === "toddler") {
    if (goal === "iron_support") return 2;
    if (goal === "gentle_digestion") return 1;
    return 0;
  }
  if (bucket === "child") {
    if (goal === "balanced") return 2;
    if (goal === "iron_support") return 1;
    return 0;
  }
  if (goal === "balanced") return 2;
  if (goal === "energy_boost") return 1;
  return 0;
}

const AGE_BONUS_CAP = 3;
const SOFT_BONUS_CAP = 2;

/** Stage 4.3: sum across eligible members and recipe goals, cap +3 */
function computeAgeBonusForRecipe(goals: NutritionGoal[], eligibleMembers: { ageMonths: number }[]): number {
  if (eligibleMembers.length === 0 || goals.length === 0) return 0;
  let sum = 0;
  for (const m of eligibleMembers) {
    const bucket = ageScoringBucket(m.ageMonths);
    if (!bucket) continue;
    for (const g of goals) {
      sum += ageGoalContribution(bucket, g);
    }
  }
  return Math.min(AGE_BONUS_CAP, sum);
}

/** Stage 4.3: toddler soft-mode only; gentle_digestion +2, balanced +1, cap +2 */
function computeSoftBonusForRecipe(goals: NutritionGoal[], softMode: boolean): number {
  if (!softMode) return 0;
  let s = 0;
  if (goals.includes("gentle_digestion")) s += 2;
  if (goals.includes("balanced")) s += 1;
  return Math.min(SOFT_BONUS_CAP, s);
}

function normalizeNutritionGoals(input: unknown): NutritionGoal[] {
  if (!Array.isArray(input)) return [];
  const out: NutritionGoal[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (!GOAL_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as NutritionGoal);
  }
  return out;
}

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
/** Ключ дедупа пула: `norm_title` из БД (если есть), иначе `title` — та же нормализация, что для слотов плана. */
function recipeTitleDedupeKey(r: { norm_title?: string | null; title?: string | null }): string {
  const raw = (r.norm_title?.trim() || r.title || "").trim();
  return normalizeTitleKey(raw);
}
function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = haystack.toLowerCase();
  return tokens.some((t) => t.length >= 2 && h.includes(t));
}
const AGE_RESTRICTED = ["острый", "кофе", "гриб"];
const INFANT_FORBIDDEN_12 = ["свинина", "говядина", "стейк", "жарен", "копчен", "колбас"];
/** Hard-guard до 24 мес: обработанное/жёсткое мясо и жареное (подстроки в title+description). Без «кусоч»/«котлет»/«запеканк» — ложные срабатывания на «мягкие кусочки», котлетки, творожную запеканку. */
const TODDLER_UNDER_24_FORBIDDEN = ["стейк", "жарен", "копчен", "колбас", "бекон", "отбивн"];
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
  filtered = filtered.filter((r) => !excludeTitleSet.has(recipeTitleDedupeKey(r)));
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

const POOL_SELECT_FIELDS =
  "id, title, norm_title, description, meal_type, is_soup, min_age_months, max_age_months, nutrition_goals, score, trust_level, cuisine, region, familiarity, recipe_ingredients(name, display_text, category)";
const POOL_TRUST_OR = "trust_level.is.null,trust_level.neq.blocked";
/** Все curated seed/starter должны попадать в память: при одном LIMIT по score почти все рецепты имеют score=0, и первые N строк из БД — случайные, без каталога infant/toddler. */
const POOL_SEED_CATALOG_FETCH_LIMIT = 600;

/**
 * Pool: две выборки (seed/starter целиком + manual/week_ai/chat_ai с лимитом), merge по id;
 * сортировка: trust tier, затем score DESC.
 * `infantSeedCoreOnly`: прикорм 4–11 мес — только curated каталог (`source=seed`, `trust_level=core`).
 */
async function fetchPoolCandidates(
  supabase: SupabaseClient,
  _userId: string,
  _memberId: string | null,
  limitCandidates: number,
  options?: { infantSeedCoreOnly?: boolean },
): Promise<RecipeRowPool[]> {
  if (options?.infantSeedCoreOnly) {
    const { data, error } = await supabase
      .from("recipes")
      .select(POOL_SELECT_FIELDS)
      .eq("source", "seed")
      .eq("trust_level", "core")
      .order("score", { ascending: false })
      .limit(POOL_SEED_CATALOG_FETCH_LIMIT);
    if (error) {
      safeWarn("generate-plan fetchPoolCandidates infant seed/core", error.message);
      return [];
    }
    const list = (data ?? []) as RecipeRowPool[];
    list.sort((a, b) => {
      const oa = trustOrder(a.trust_level);
      const ob = trustOrder(b.trust_level);
      if (oa !== ob) return oa - ob;
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      return sb - sa;
    });
    return list;
  }

  const [seedRes, otherRes] = await Promise.all([
    supabase
      .from("recipes")
      .select(POOL_SELECT_FIELDS)
      .in("source", ["seed", "starter"])
      .or(POOL_TRUST_OR)
      .order("score", { ascending: false })
      .limit(POOL_SEED_CATALOG_FETCH_LIMIT),
    supabase
      .from("recipes")
      .select(POOL_SELECT_FIELDS)
      .in("source", ["manual", "week_ai", "chat_ai"])
      .or(POOL_TRUST_OR)
      .order("score", { ascending: false })
      .limit(Math.max(limitCandidates, 200)),
  ]);
  if (seedRes.error) safeWarn("generate-plan fetchPoolCandidates seed", seedRes.error.message);
  if (otherRes.error) safeWarn("generate-plan fetchPoolCandidates other", otherRes.error.message);
  if (seedRes.error && otherRes.error) return [];

  const byId = new Map<string, RecipeRowPool>();
  for (const row of (seedRes.data ?? []) as RecipeRowPool[]) {
    byId.set(row.id, row);
  }
  for (const row of (otherRes.data ?? []) as RecipeRowPool[]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const list = [...byId.values()];
  list.sort((a, b) => {
    const oa = trustOrder(a.trust_level);
    const ob = trustOrder(b.trust_level);
    if (oa !== ob) return oa - ob;
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    return sb - sa;
  });
  return list;
}

/** In-memory only: no await. Filters pool and returns best match for slot (scoring: recency, variety, base diversity, goals; likes не участвуют). */
function pickFromPoolInMemory(
  pool: RecipeRowPool[],
  mealType: string,
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  usedBaseCounts?: Record<string, number>,
  goalHints?: {
    preferredGoals?: Set<string>;
    blockedGoals?: Set<string>;
    requireBalanced?: boolean;
    /** Опционально: явный `selected_goal` в запросе (не balanced) — малый бонус к скору; клиент Плана не передаёт. */
    selectedGoalForScoring?: string;
    /** Stage 4.2: сколько раз цель уже встретилась в приёмах пищи этого дня (мягкий анти-повтор). */
    dayGoalUsage?: Record<string, number>;
    /** Stage 4.3: возраст/семья/soft-mode — только скоринг. */
    familyScoring?: FamilyScoringContext | null;
    /** Неделя / replace: счётчики ключевых продуктов (мягкий штраф, не фильтр). */
    usedKeyIngredientCounts?: Record<string, number>;
    /** Задел: счётчики по типу приёма (пока не дают отдельного штрафа). */
    usedKeyIngredientCountsByMealType?: Record<string, Record<string, number>>;
    /** Stage 4.4.2 / ranking: day_key, request_id, meal_slot (salt для exploration). */
    planPickDebug?: { day_key?: string; request_id?: string; meal_slot?: string; rank_salt?: string };
    /** Тесты: фиксированный RNG для детерминированного ranking. */
    rankRng?: () => number;
    /** Stage 4.4.3: накопление CHAT_PLAN_CULTURAL_SUMMARY (только при CHAT_PLAN_CULTURAL_DEBUG). */
    culturalSummaryAccumulator?: CulturalSummaryAccumulator | null;
  }
): {
  id: string;
  title: string;
  primaryBase: string;
  goalBonus: number;
  ageBonus: number;
  softBonus: number;
  culturalFamiliarityKey: CulturalFamiliarityCountKey;
} | null {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const slot = normalizeMealType(mealType) ?? (mealType as NormalizedMealType);
  let filtered = pool.filter((r) => !excludeSet.has(r.id));
  filtered = filtered.filter((r) => !excludeTitleSet.has(recipeTitleDedupeKey(r)));
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
  const work = filtered;
  const recentSignatures = buildRecentSignatureSet(excludeTitleKeys);
  const selectedGoal = goalHints?.selectedGoalForScoring;
  const dayGoalUsage = goalHints?.dayGoalUsage;
  const familyScoring = goalHints?.familyScoring ?? null;
  if (familyScoring?.hasInfant && debugPool()) {
    safeLog("CHAT_PLAN_FAMILY_INFANT_PRESENT", { hasInfant: true });
  }
  if (selectedGoal) {
    let poolCountSel = 0;
    let poolCountBal = 0;
    for (const r of work) {
      const g = normalizeNutritionGoals(r.nutrition_goals);
      if (g.includes(selectedGoal as NutritionGoal)) poolCountSel++;
      if (g.includes("balanced")) poolCountBal++;
    }
    safeLog("CHAT_PLAN_GOAL_DEBUG", {
      selected_goal: selectedGoal,
      count_selected_goal: poolCountSel,
      count_balanced: poolCountBal,
      total_candidates: work.length,
      day_usage_selected: dayGoalUsage?.[selectedGoal] ?? 0,
    });
  }
  const ctx: ScoreRecipeCtx = {
    recentSignatures,
    usedBaseCounts,
    usedKeyIngredientCounts: goalHints?.usedKeyIngredientCounts,
    usedKeyIngredientCountsByMealType: goalHints?.usedKeyIngredientCountsByMealType ?? null,
    ingredientPenaltyMealSlot: slot,
    preferredGoals: goalHints?.preferredGoals,
    blockedGoals: goalHints?.blockedGoals,
    requireBalanced: goalHints?.requireBalanced,
  };
  const includeCulturalComparison = debugCulturalPlan();
  const scoredPick = pickBestRecipeForSlotWithGoalScoring(
    work,
    ctx,
    selectedGoal,
    dayGoalUsage,
    familyScoring,
    {
      includeCulturalComparison,
      planPickDebug: { ...goalHints?.planPickDebug, meal_slot: slot },
      rng: goalHints?.rankRng,
    },
  );
  if (!scoredPick) return null;
  const {
    r: best,
    goalBonus,
    ageBonus,
    softBonus,
    culturalBonus,
    baseScore,
    finalBeforeCultural,
    finalScoreAfterCultural,
    culturalComparison,
  } = scoredPick;
  const primaryBase = inferPrimaryBase(best);
  const poolFamiliarityCounts = countCulturalFamiliarityInRecipes(work);
  const winnerKey = culturalFamiliarityCountKey(best.familiarity);
  if (debugCulturalPlan()) {
    safeLog("CHAT_PLAN_CULTURAL_DEBUG", {
      kind: "pick",
      request_id: goalHints?.planPickDebug?.request_id,
      day_key: goalHints?.planPickDebug?.day_key,
      meal_slot: slot,
      selected_goal: selectedGoal ?? null,
      trust_level: best.trust_level ?? null,
      familiarity: best.familiarity ?? null,
      cuisine: best.cuisine ?? null,
      region: best.region ?? null,
      base_score: baseScore,
      cultural_bonus: culturalBonus,
      final_score_before_cultural: finalBeforeCultural,
      final_score_after_cultural: finalScoreAfterCultural,
      pool_familiarity_counts: poolFamiliarityCounts,
      winner_familiarity_key: winnerKey,
      changed_by_cultural: culturalComparison?.changed_by_cultural ?? null,
    });
    if (culturalComparison) {
      safeLog("CHAT_PLAN_CULTURAL_SAMPLE", {
        request_id: goalHints?.planPickDebug?.request_id ?? null,
        day_key: goalHints?.planPickDebug?.day_key ?? null,
        meal_slot: slot,
        selected_goal: selectedGoal ?? null,
        pool_size: work.length,
        trust_level: best.trust_level ?? null,
        winner_without_cultural: {
          id: culturalComparison.winner_without_cultural.id,
          title: culturalComparison.winner_without_cultural.title,
          familiarity: culturalComparison.winner_without_cultural.familiarity,
          trust_level: culturalComparison.winner_without_cultural.trust_level,
          final_before_cultural: culturalComparison.winner_without_cultural.final_before_cultural,
        },
        winner_with_cultural: {
          id: culturalComparison.winner_with_cultural.id,
          title: culturalComparison.winner_with_cultural.title,
          familiarity: culturalComparison.winner_with_cultural.familiarity,
          trust_level: culturalComparison.winner_with_cultural.trust_level,
          final_after_cultural: culturalComparison.winner_with_cultural.final_after_cultural,
        },
        changed_by_cultural: culturalComparison.changed_by_cultural,
        score_delta_for_winner: culturalComparison.score_delta_for_winner,
        top_candidates_before_cultural: culturalComparison.top_candidates_before_cultural,
        top_candidates_after_cultural: culturalComparison.top_candidates_after_cultural,
      });
    }
    const acc = goalHints?.culturalSummaryAccumulator;
    if (culturalComparison && acc) {
      accumulateCulturalSummary(acc, culturalComparison, poolFamiliarityCounts, culturalBonus);
    }
  }
  return {
    id: best.id,
    title: best.title,
    primaryBase,
    goalBonus,
    ageBonus,
    softBonus,
    culturalFamiliarityKey: winnerKey,
  };
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
  /** Явный `null` — удалить ключ из meals (очистить слот при частичном подборе). */
  const keysToDelete: string[] = [];
  for (const [k, v] of Object.entries(meals)) {
    if (v === null) keysToDelete.push(k);
  }
  const normalized = normalizeMealsForWrite(meals);
  let q = supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: existing } = await q.maybeSingle();
  const current = (existing as { meals?: Record<string, unknown> } | null)?.meals ?? {};
  const merged = { ...current };
  for (const k of keysToDelete) delete merged[k];
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

const FREE_PLAN_FILL_LIMIT = 2;
const SUPABASE_TIMEOUT_MS = 8000;
/** Single-day pool size. */
const POOL_LIMIT_ONE_DAY = 120;
/** Week plan: need at least 7 per meal type (breakfast/lunch/snack/dinner); family dinner filter and meal-type inference reduce effective pool — use larger fetch. */
const POOL_LIMIT_WEEK = 280;
/** Min candidates for family dinner before we fall back to pool without family-dinner filter. */
const MIN_FAMILY_DINNER = 5;
const debugPool = () => typeof Deno !== "undefined" && Deno.env?.get?.("DEBUG_POOL") === "true";
/** Лог финального composite-ranking (победитель, trust, db score, exploration). */
const debugPlanRank = () =>
  typeof Deno !== "undefined" &&
  (Deno.env?.get?.("CHAT_PLAN_RANK_DEBUG") === "true" || Deno.env?.get?.("DEBUG_POOL") === "true");
/** Ключевые продукты / weekly ingredient diversity (без спама в проде). */
const debugPlanKeyIngredients = () =>
  typeof Deno !== "undefined" && Deno.env?.get?.("DEBUG_PLAN_KEY_INGREDIENTS") === "true";
/** Stage 4.4.2: подробные логи familiarity / cultural bonus (Supabase secrets / env function). */
const debugCulturalPlan = () => typeof Deno !== "undefined" && Deno.env?.get?.("CHAT_PLAN_CULTURAL_DEBUG") === "true";

/** Weekly diversity: max uses of same primary base (e.g. cottage cheese, oatmeal) per week. */
const MAX_BASE_PER_WEEK = 5;
/** Penalty per slot when base is already at or over cap (diminishing priority). */
const DIVERSITY_BASE_PENALTY = 6;

// ——— Scoring helpers (recency, variety penalty, base diversity) ———
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
  recentSignatures: Set<string>;
  /** Week only: counts per primary base for diversity penalty. */
  usedBaseCounts?: Record<string, number>;
  /**
   * Week / replace_slot: сколько раз канонический ключ продукта уже встретился в других блюдах окна.
   * Мягкий штраф в scoreRecipeForSlot (не hard filter).
   */
  usedKeyIngredientCounts?: Record<string, number> | null;
  /** Счётчики по слоту приёма (breakfast/snack — доп. мягкий штраф для степлеров). */
  usedKeyIngredientCountsByMealType?: Record<string, Record<string, number>> | null;
  /** Текущий слот для meal-aware штрафа (совпадает с нормализованным meal_type). */
  ingredientPenaltyMealSlot?: string | null;
  preferredGoals?: Set<string>;
  blockedGoals?: Set<string>;
  requireBalanced?: boolean;
};

/**
 * Stage 4.2: только если клиент явно передал `selected_goal` (не balanced): +2 за совпадение тега рецепта
 * и мягкий штраф, если этот тег уже встречался 2+ раза в дне.
 * Без явной цели — 0: теги nutrition_goals не сдвигают ранжирование плана.
 */
function computeGoalPriorityBonus(
  goals: NutritionGoal[],
  selectedGoal: string | undefined,
  dayGoalUsage: Record<string, number> | undefined,
): number {
  const usage = dayGoalUsage ?? {};
  const sel = selectedGoal && GOAL_SET.has(selectedGoal) && selectedGoal !== "balanced" ? selectedGoal : undefined;
  if (!sel) return 0;
  let bonus = 0;
  if (goals.includes(sel as NutritionGoal)) {
    bonus += 2;
  }
  for (const g of goals) {
    if ((usage[g] ?? 0) >= 2) {
      bonus -= 2;
    }
  }
  return bonus;
}

function scoreRecipeForSlot(r: RecipeRowPool, stableIndex: number, ctx: ScoreRecipeCtx): number {
  /** Слабый tie-break по стабильному порядку (после trust/db в merge); не заменяет composite. */
  const recencyScore = Math.max(0, 2 - Math.floor(stableIndex / 55));
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
  const goals = normalizeNutritionGoals(r.nutrition_goals);
  let goalsScore = 0;
  if (ctx.requireBalanced) goalsScore += goals.includes("balanced") ? 10 : -4;
  if (ctx.preferredGoals && goals.some((g) => ctx.preferredGoals!.has(g))) goalsScore += 4;
  if (ctx.blockedGoals && goals.some((g) => ctx.blockedGoals!.has(g))) goalsScore -= 3;
  let ingredientDiversityPenalty = 0;
  if (ctx.usedKeyIngredientCounts != null) {
    const sig = deriveKeyIngredientSignals(r);
    ingredientDiversityPenalty = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
      usedGlobal: ctx.usedKeyIngredientCounts,
      usedByMeal: ctx.usedKeyIngredientCountsByMealType ?? null,
      mealSlot: ctx.ingredientPenaltyMealSlot ?? null,
    }).penalty;
  }
  return (
    recencyScore -
    varietyPenalty -
    baseDiversityPenalty -
    ingredientDiversityPenalty +
    goalsScore
  );
}
/**
 * После eligibility: стабильный порядок → slot-fit → composite через computeCompositeScore (shared).
 * Jitter детерминирован от rank_salt + recipeId (как на клиенте), если не передан rng (тесты).
 */
function pickBestRecipeForSlotWithGoalScoring(
  candidates: RecipeRowPool[],
  ctx: ScoreRecipeCtx,
  selectedGoal: string | undefined,
  dayGoalUsage: Record<string, number> | undefined,
  familyScoring: FamilyScoringContext | null | undefined,
  options?: {
    includeCulturalComparison?: boolean;
    planPickDebug?: { day_key?: string; request_id?: string; meal_slot?: string; rank_salt?: string };
    rng?: () => number;
  },
): {
  r: RecipeRowPool;
  goalBonus: number;
  ageBonus: number;
  softBonus: number;
  culturalBonus: number;
  baseScore: number;
  finalBeforeCultural: number;
  finalScoreAfterCultural: number;
  culturalComparison?: CulturalPickComparison | null;
} | null {
  if (candidates.length === 0) return null;
  const stable = stableSortPoolForRanking(candidates);
  const dbg = options?.planPickDebug;
  const rankSalt =
    dbg?.rank_salt != null && String(dbg.rank_salt).length > 0
      ? String(dbg.rank_salt)
      : buildRankSalt(dbg ?? {});
  const exploreSlot = explorationPickActive(rankSalt);

  const sel = selectedGoal && GOAL_SET.has(selectedGoal) && selectedGoal !== "balanced" ? selectedGoal : undefined;
  const eligible = familyScoring?.eligibleMembers ?? [];
  const softMode = familyScoring?.softMode === true;

  const scored: ScoredCandidateRow[] = stable.map((r, stableIndex) => {
    const baseScore = scoreRecipeForSlot(r, stableIndex, ctx);
    const goals = normalizeNutritionGoals(r.nutrition_goals);
    const goalBonus = computeGoalPriorityBonus(goals, sel, dayGoalUsage);
    const ageBonus = computeAgeBonusForRecipe(goals, eligible);
    const softBonus = computeSoftBonusForRecipe(goals, softMode);
    const culturalBonus = computeCulturalFamiliarityBonus(r.familiarity);
    const finalBeforeCultural = baseScore + goalBonus + ageBonus + softBonus;
    const finalScoreAfterCultural = finalBeforeCultural + culturalBonus;
    const jitterOverride = options?.rng ? rankJitter(rng) : undefined;
    const tail = explainRankingTail(r.trust_level, r.score, r.id, rankSalt, jitterOverride);
    const compositeWithoutCultural = computeCompositeScore({
      slotFit: finalBeforeCultural,
      trustLevel: r.trust_level,
      score: r.score,
      recipeId: r.id,
      rankSalt,
      jitterOverride,
    });
    const compositeWithCultural = computeCompositeScore({
      slotFit: finalScoreAfterCultural,
      trustLevel: r.trust_level,
      score: r.score,
      recipeId: r.id,
      rankSalt,
      jitterOverride,
    });
    return {
      r,
      finalScoreAfterCultural,
      goalBonus,
      ageBonus,
      softBonus,
      culturalBonus,
      baseScore,
      finalBeforeCultural,
      trustTier: trustOrder(r.trust_level),
      compositeWithCultural,
      compositeWithoutCultural,
      trustRankingBonus: tail.trustBonus,
      dbScoreContribution: tail.dbContribution,
      explorationBoost: tail.explorationBoost,
      rankJitter: tail.jitter,
    };
  });
  const culturalComparison = options?.includeCulturalComparison ? buildCulturalPickComparison(scored) : undefined;
  const sortedForProd = [...scored].sort((a, b) => compareScoredForSlot(a, b, "with_cultural"));
  const top = sortedForProd[0]!;
  if (debugPlanRank()) {
    const top3 = sortedForProd.slice(0, 3).map((row) => ({
      id: row.r.id,
      title: row.r.title,
      trust_level: row.r.trust_level ?? null,
      recipes_score: (row.r as RecipeRowPool).score ?? null,
      slot_fit_before_cultural: row.finalBeforeCultural,
      slot_fit_after_cultural: row.finalScoreAfterCultural,
      trust_ranking_bonus: row.trustRankingBonus,
      db_score_contribution: row.dbScoreContribution,
      exploration_boost: row.explorationBoost,
      rank_jitter: row.rankJitter,
      composite_final: row.compositeWithCultural,
    }));
    safeLog("CHAT_PLAN_RANK_PICK", {
      rank_salt: rankSalt,
      exploration_slot_active: exploreSlot,
      winner_id: top.r.id,
      winner_title: top.r.title,
      winner_trust_level: top.r.trust_level ?? null,
      winner_recipes_score: (top.r as RecipeRowPool).score ?? null,
      winner_composite: top.compositeWithCultural,
      winner_exploration_boost: top.explorationBoost,
      top3,
    });
    safeLog("RANK_DEBUG", {
      source: "generate-plan",
      rank_salt: rankSalt,
      top3: top3.map((row) => ({
        recipeId: row.id,
        slotFit: row.slot_fit_after_cultural,
        trust_bonus: row.trust_ranking_bonus,
        score_contribution: row.db_score_contribution,
        exploration: row.exploration_boost,
        jitter: row.rank_jitter,
        total: row.composite_final,
      })),
    });
  }
  if (debugPlanKeyIngredients() && ctx.usedKeyIngredientCounts != null) {
    const top3Ing = sortedForProd.slice(0, 3).map((row, idx) => {
      const sig = deriveKeyIngredientSignals(row.r as RecipeRowPool);
      const res = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
        usedGlobal: ctx.usedKeyIngredientCounts,
        usedByMeal: ctx.usedKeyIngredientCountsByMealType ?? null,
        mealSlot: ctx.ingredientPenaltyMealSlot ?? null,
      });
      const rank = idx + 1;
      const winner = rank === 1;
      const next = sortedForProd[idx + 1];
      let vs_next: { next_id: string; delta_penalty: number; delta_composite: number; note: string } | null = null;
      if (winner && next) {
        const sigN = deriveKeyIngredientSignals(next.r as RecipeRowPool);
        const resN = computeWeeklyKeyIngredientPenaltyCalibrated(sigN, {
          usedGlobal: ctx.usedKeyIngredientCounts,
          usedByMeal: ctx.usedKeyIngredientCountsByMealType ?? null,
          mealSlot: ctx.ingredientPenaltyMealSlot ?? null,
        });
        const dPen = resN.penalty - res.penalty;
        const dComp = row.compositeWithCultural - next.compositeWithCultural;
        const note =
          dPen > 0 && dComp >= 0
            ? "lower_ingredient_penalty_vs_next"
            : dComp > 0
              ? "composite_tie_break"
              : "close_call";
        vs_next = {
          next_id: next.r.id,
          delta_penalty: Math.round(dPen * 100) / 100,
          delta_composite: Math.round(dComp * 100) / 100,
          note,
        };
      }
      return {
        id: row.r.id,
        title: row.r.title,
        rank,
        key_ingredients: sig.keys,
        primary_key: sig.primaryKey,
        ingredient_penalty: res.penalty,
        ingredient_primary_subtotal: res.primarySubtotal,
        ingredient_secondary_subtotal: res.secondarySubtotal,
        ingredient_meal_slot_subtotal: res.mealSlotSubtotal,
        ingredient_subtotal_before_total_cap: res.ingredientSubtotalBeforeTotalCap,
        prior_uses: res.priorUses,
        breakdown: res.breakdown,
        base_score_after_ingredient_penalty: row.baseScore,
        composite: row.compositeWithCultural,
        vs_next,
      };
    });
    safeLog("PLAN_KEY_INGREDIENT_RANK_DEBUG", {
      rank_salt: rankSalt,
      meal_slot: ctx.ingredientPenaltyMealSlot ?? null,
      top3: top3Ing,
    });
  }
  return {
    r: top.r,
    goalBonus: top.goalBonus,
    ageBonus: top.ageBonus,
    softBonus: top.softBonus,
    culturalBonus: top.culturalBonus,
    baseScore: top.baseScore,
    finalBeforeCultural: top.finalBeforeCultural,
    finalScoreAfterCultural: top.finalScoreAfterCultural,
    culturalComparison,
  };
}

/** Один профиль ребёнка &lt; 12 мес (не «Семья»): упрощённый прикорм из пула, без четырёх слотов. */
function isInfantComplementaryPlan(memberData: MemberDataPool | null, memberId: string | null): boolean {
  if (memberId == null) return false;
  const t = (memberData?.type ?? "").toLowerCase();
  if (t === "adult" || t === "family") return false;
  const age = memberData?.age_months;
  if (age == null || !Number.isFinite(Number(age))) return false;
  return Math.max(0, Math.round(Number(age))) < 12;
}

function infantSeedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

/** 4–6 мес → 1 блюдо; 7–8 → 1 или 2; 9–11 → чаще 2 (детерминированно от dayKey). */
function getInfantComplementaryDishCount(ageMonths: number, dayKey: string, memberId: string | null): number {
  if (ageMonths < 4) return 1;
  if (ageMonths <= 6) return 1;
  if (ageMonths <= 8) {
    return (infantSeedHash(`${dayKey}|${memberId ?? ""}|c1`) % 2) === 0 ? 1 : 2;
  }
  return (infantSeedHash(`${dayKey}|${memberId ?? ""}|c2`) % 10) < 8 ? 2 : 1;
}

function getIntroducedProductKeysForInfant(memberData: MemberDataPool | null): string[] {
  const raw = memberData?.introduced_product_keys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

type InfantComplementarySlotRole = "primary" | "secondary";

function filterInfantComplementaryCandidates(
  pool: RecipeRowPool[],
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  infantSlotRole: InfantComplementarySlotRole,
): RecipeRowPool[] {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  const ageContext = getMemberAgeContext(memberData);
  let filtered = pool.filter((r) => !excludeSet.has(r.id));
  filtered = filtered.filter((r) => !excludeTitleSet.has(recipeTitleDedupeKey(r)));
  if (ageContext.applyFilter && ageContext.ageMonths != null) {
    const am = ageContext.ageMonths;
    filtered = filtered.filter((r) => recipeFitsAgeRange(r, am));
    filtered = filtered.filter((r) => !recipeBlockedByInfantKeywords(r, am));
  }
  if (isAdultContext(memberData)) {
    filtered = filtered.filter((r) => r.max_age_months == null || r.max_age_months > 12);
  }
  filtered = filtered.filter((r) => {
    const { resolved } = getResolvedMealType(r);
    return resolved !== null && resolved !== "dinner";
  });
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData));
  filtered = filtered.filter((r) => {
    const { resolved } = getResolvedMealType(r);
    if (resolved === null) return false;
    const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
    return slotSanityCheck(resolved, [r.title ?? "", r.description ?? "", ing].join(" "));
  });
  const introduced = getIntroducedProductKeysForInfant(memberData);
  if (infantSlotRole === "secondary") {
    if (introduced.length === 0) return [];
    filtered = filtered.filter((r) =>
      evaluateInfantSecondaryFamiliarOnly(r.recipe_ingredients ?? null, introduced, {
        title: r.title,
        description: r.description,
      }).valid
    );
  } else {
    filtered = filtered.filter((r) =>
      evaluateInfantRecipeComplementaryRules(r.recipe_ingredients ?? null, introduced, {
        title: r.title,
        description: r.description,
      }).valid
    );
  }
  return filtered;
}

function pickInfantComplementaryFromPool(
  pool: RecipeRowPool[],
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  infantSlotRole: InfantComplementarySlotRole,
  usedBaseCounts: Record<string, number> | undefined,
  goalHints: {
    preferredGoals?: Set<string>;
    blockedGoals?: Set<string>;
    requireBalanced?: boolean;
    selectedGoalForScoring?: string;
    dayGoalUsage?: Record<string, number>;
    familyScoring?: FamilyScoringContext | null;
    planPickDebug?: { day_key?: string; request_id?: string; meal_slot?: string; rank_salt?: string };
    culturalSummaryAccumulator?: CulturalSummaryAccumulator | null;
    rankRng?: () => number;
  },
): {
  id: string;
  title: string;
  primaryBase: string;
  goalBonus: number;
  ageBonus: number;
  softBonus: number;
  culturalFamiliarityKey: CulturalFamiliarityCountKey;
} | null {
  const work = filterInfantComplementaryCandidates(pool, memberData, excludeRecipeIds, excludeTitleKeys, infantSlotRole);
  if (work.length === 0) return null;
  const recentSignatures = buildRecentSignatureSet(excludeTitleKeys);
  const ctx: ScoreRecipeCtx = {
    recentSignatures,
    usedBaseCounts,
    preferredGoals: goalHints.preferredGoals,
    blockedGoals: goalHints.blockedGoals,
    requireBalanced: goalHints.requireBalanced,
  };
  const scoredPick = pickBestRecipeForSlotWithGoalScoring(
    work,
    ctx,
    goalHints.selectedGoalForScoring,
    goalHints.dayGoalUsage,
    goalHints.familyScoring,
    {
      includeCulturalComparison: debugCulturalPlan(),
      planPickDebug: goalHints.planPickDebug,
      rng: goalHints.rankRng,
    },
  );
  if (!scoredPick) return null;
  const best = scoredPick.r;
  const primaryBase = inferPrimaryBase(best);
  const winnerKey = culturalFamiliarityCountKey(best.familiarity);
  return {
    id: best.id,
    title: best.title,
    primaryBase,
    goalBonus: scoredPick.goalBonus,
    ageBonus: scoredPick.ageBonus,
    softBonus: scoredPick.softBonus,
    culturalFamiliarityKey: winnerKey,
  };
}

function applyPickedRecipeGoalsToDayWeek(
  recipeId: string,
  pool: RecipeRowPool[],
  dayGoalCounts: Record<string, number>,
  weekGoalCounts: Record<string, number>,
): void {
  const pickedGoals = normalizeNutritionGoals(pool.find((r) => r.id === recipeId)?.nutrition_goals);
  if (pickedGoals.length === 0) {
    dayGoalCounts.balanced = (dayGoalCounts.balanced ?? 0) + 1;
    weekGoalCounts.balanced = (weekGoalCounts.balanced ?? 0) + 1;
  } else {
    for (const g of pickedGoals) {
      dayGoalCounts[g] = (dayGoalCounts[g] ?? 0) + 1;
      weekGoalCounts[g] = (weekGoalCounts[g] ?? 0) + 1;
    }
  }
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
      /** Опционально; для текущего продукта не используется при скоринге пула (теги остаются на рецепте). */
      nutrition_goals?: string[];
      /** Опционально; мягкий приоритет только при явной передаче не-balanced ключа (клиент Плана не шлёт). */
      selected_goal?: string;
    };
    const action = body.action === "run" ? "run" : body.action === "replace_slot" ? "replace_slot" : body.action === "cancel" ? "cancel" : body.action === "start" ? "start" : null;
    const type = body.type === "day" || body.type === "week" ? body.type : "day";
    const rawSelectedGoal = typeof body.selected_goal === "string" ? body.selected_goal.trim().toLowerCase() : "";
    const selectedGoalToken: NutritionGoal | null =
      rawSelectedGoal && GOAL_SET.has(rawSelectedGoal) ? (rawSelectedGoal as NutritionGoal) : null;
    const selectedGoalForScoring =
      selectedGoalToken && selectedGoalToken !== "balanced" ? selectedGoalToken : undefined;
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
      const replaceRankEntropy =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rep_${Date.now()}`;
      let replaceMemberData: MemberDataPool | null = memberData;
      let replaceMembersForScoring: Array<{ age_months?: number | null }> = [];
      if (memberId == null) {
        const { data: membersRows } = await supabase.from("members").select("id, name, age_months, allergies, preferences, dislikes").eq("user_id", userId);
        const membersList = (membersRows ?? []) as Array<{ id: string; name?: string; age_months?: number | null; allergies?: string[] | null; preferences?: string[] | null; dislikes?: string[] | null }>;
        replaceMemberData = buildFamilyMemberDataForPlan(membersList);
        replaceMembersForScoring = membersList;
      } else {
        const { data: memberRow } = await supabase
          .from("members")
          .select("age_months, allergies, dislikes, type, introduced_product_keys, introducing_product_key, introducing_started_at")
          .eq("id", effectiveMemberId)
          .eq("user_id", userId)
          .maybeSingle();
        const m = memberRow as {
          age_months?: number | null;
          allergies?: string[] | null;
          dislikes?: string[] | null;
          type?: string | null;
          introduced_product_keys?: string[] | null;
          introducing_product_key?: string | null;
          introducing_started_at?: string | null;
        } | null;
        if (m) {
          replaceMemberData = {
            ...(memberData ?? {}),
            age_months: m.age_months ?? memberData?.age_months,
            allergies: Array.isArray(m.allergies) && m.allergies.length > 0 ? m.allergies : (memberData?.allergies ?? []),
            dislikes: Array.isArray(m.dislikes) && m.dislikes.length > 0 ? m.dislikes : (memberData?.dislikes ?? []),
            type: m.type ?? memberData?.type,
            introduced_product_keys: Array.isArray(m.introduced_product_keys) ? m.introduced_product_keys : (memberData?.introduced_product_keys ?? []),
            introducing_product_key: m.introducing_product_key ?? memberData?.introducing_product_key ?? null,
            introducing_started_at: m.introducing_started_at ?? memberData?.introducing_started_at ?? null,
          };
          replaceMembersForScoring = [{ age_months: m.age_months ?? memberData?.age_months ?? null }];
        } else if (memberData?.age_months != null) {
          replaceMembersForScoring = [{ age_months: memberData.age_months }];
        }
      }
      const replaceFamilyScoring = buildFamilyScoringContext(replaceMembersForScoring);
      const { data: existingRow } = await supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey).is("member_id", effectiveMemberId).maybeSingle();
      const currentMeals = (existingRow as { meals?: Record<string, { recipe_id?: string; title?: string }> } | null)?.meals ?? {};
      const dateKeys = [dayKey, ...getLastNDaysKeys(dayKey, 6)];
      const { recipeIds: replaceRecipeIds, titleKeys: replaceTitleKeys } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, effectiveMemberId, dateKeys);
      const excludeRecipeIds = [...(body.exclude_recipe_ids ?? []), ...replaceRecipeIds];
      // include body.exclude_title_keys (session) + week/last days so recentSignatures and exclude set match.
      const excludeTitleKeys = [...new Set([...(body.exclude_title_keys ?? []), ...replaceTitleKeys])];
      const infantSeedCoreOnlyReplace = isInfantComplementarySeedCorePoolAge(replaceMemberData, memberId);
      const pool = await fetchPoolCandidates(supabase, userId, effectiveMemberId, POOL_LIMIT_ONE_DAY, {
        infantSeedCoreOnly: infantSeedCoreOnlyReplace,
      });
      const poolForReplace =
        memberId == null && mealType === "dinner" ? pool.filter((r) => isFamilyDinnerCandidate(r)) : pool;
      const replaceCulturalSummaryAcc = debugCulturalPlan() ? createEmptyCulturalSummaryAccumulator() : undefined;
      const isInfantReplace =
        isInfantComplementaryPlan(replaceMemberData, memberId) &&
        (mealType === "breakfast" || mealType === "lunch");
      const replaceRankSalt = buildAlignedRankSalt({
        kind: "replace",
        userId,
        mealType,
        dayKey,
        variant: isInfantReplace ? "infant" : undefined,
        rankEntropy: replaceRankEntropy,
      });
      const replaceUsedKeyIngredientCounts: Record<string, number> = {};
      const replaceUsedKeyIngredientCountsByMealType: Record<string, Record<string, number>> = {};
      const applyReplaceIngredientDiversity = !isInfantComplementaryPlan(replaceMemberData, memberId);
      if (applyReplaceIngredientDiversity) {
        const slotsForIng = await collectRecipeSlotsFromMealPlansExcludingSlot(
          supabase,
          userId,
          effectiveMemberId,
          dateKeys,
          dayKey,
          mealType,
        );
        await fetchAndMergeKeyIngredientCountsForSlotEntries(
          supabase,
          slotsForIng,
          replaceUsedKeyIngredientCounts,
          replaceUsedKeyIngredientCountsByMealType,
        );
      }
      const replaceGoalHints = {
        preferredGoals: undefined,
        blockedGoals: undefined,
        requireBalanced: false,
        selectedGoalForScoring,
        dayGoalUsage: {},
        familyScoring: replaceFamilyScoring,
        usedKeyIngredientCounts: applyReplaceIngredientDiversity ? replaceUsedKeyIngredientCounts : undefined,
        usedKeyIngredientCountsByMealType: applyReplaceIngredientDiversity
          ? replaceUsedKeyIngredientCountsByMealType
          : undefined,
        planPickDebug: {
          day_key: dayKey,
          request_id: "replace_slot",
          meal_slot: mealType,
          rank_salt: replaceRankSalt,
        },
        culturalSummaryAccumulator: replaceCulturalSummaryAcc,
      };
      let picked: { id: string; title: string } | null = null;
      if (isInfantComplementaryPlan(replaceMemberData, memberId)) {
        if (mealType === "breakfast" || mealType === "lunch") {
          const infantReplaceRole: InfantComplementarySlotRole = mealType === "breakfast" ? "primary" : "secondary";
          const ip = pickInfantComplementaryFromPool(
            poolForReplace,
            replaceMemberData,
            excludeRecipeIds,
            excludeTitleKeys,
            infantReplaceRole,
            undefined,
            replaceGoalHints,
          );
          if (ip) picked = { id: ip.id, title: ip.title };
        }
      } else {
        const p1 = pickFromPoolInMemory(poolForReplace, mealType, replaceMemberData, excludeRecipeIds, excludeTitleKeys, undefined, replaceGoalHints);
        picked = p1 ? { id: p1.id, title: p1.title } : null;
        if (!picked && memberId == null && mealType === "dinner" && poolForReplace.length < MIN_FAMILY_DINNER) {
          const p2 = pickFromPoolInMemory(pool, mealType, replaceMemberData, excludeRecipeIds, excludeTitleKeys, undefined, replaceGoalHints);
          picked = p2 ? { id: p2.id, title: p2.title } : null;
        }
      }
      if (picked) {
        const oldRecipeId = currentMeals[mealType]?.recipe_id ?? null;
        const newMeals = { ...currentMeals, [mealType]: { recipe_id: picked.id, title: picked.title, plan_source: "pool" as const } };
        const upsertErr = await upsertMealPlanRow(supabase, userId, effectiveMemberId, dayKey, newMeals);
        if (upsertErr.error) {
          return new Response(JSON.stringify({ error: "replace_failed", reason: "attach_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await supabase.rpc("record_recipe_feedback", { p_recipe_id: picked.id, p_action: "added_to_plan" });
        if (oldRecipeId && oldRecipeId !== picked.id) {
          await supabase.rpc("record_recipe_feedback", { p_recipe_id: oldRecipeId, p_action: "replaced_in_plan" });
        }
        if (debugCulturalPlan() && replaceCulturalSummaryAcc && replaceCulturalSummaryAcc.total_picks > 0) {
          safeLog("CHAT_PLAN_CULTURAL_SUMMARY", finalizeCulturalSummary(replaceCulturalSummaryAcc, "replace_slot"));
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

    let poolRunMemberHint: MemberDataPool | null = memberData;
    if (memberId != null) {
      const { data: mRun } = await supabase
        .from("members")
        .select("age_months, allergies, dislikes, type, introduced_product_keys, introducing_product_key, introducing_started_at")
        .eq("id", effectiveMemberId)
        .eq("user_id", userId)
        .maybeSingle();
      const mr = mRun as {
        age_months?: number | null;
        allergies?: string[] | null;
        dislikes?: string[] | null;
        type?: string | null;
        introduced_product_keys?: string[] | null;
        introducing_product_key?: string | null;
        introducing_started_at?: string | null;
      } | null;
      if (mr) {
        poolRunMemberHint = {
          ...(memberData ?? {}),
          age_months: mr.age_months ?? memberData?.age_months,
          allergies: Array.isArray(mr.allergies) && mr.allergies.length > 0 ? mr.allergies : (memberData?.allergies ?? []),
          dislikes: Array.isArray(mr.dislikes) && mr.dislikes.length > 0 ? mr.dislikes : (memberData?.dislikes ?? []),
          type: mr.type ?? memberData?.type,
          introduced_product_keys: Array.isArray(mr.introduced_product_keys) ? mr.introduced_product_keys : (memberData?.introduced_product_keys ?? []),
          introducing_product_key: mr.introducing_product_key ?? memberData?.introducing_product_key ?? null,
          introducing_started_at: mr.introducing_started_at ?? memberData?.introducing_started_at ?? null,
        };
      }
    }
    const infantSeedCoreOnlyForPoolRun = isInfantComplementarySeedCorePoolAge(poolRunMemberHint, memberId);
    const poolCandidates = await fetchPoolCandidates(supabase, userId, effectiveMemberId, poolLimit, {
      infantSeedCoreOnly: infantSeedCoreOnlyForPoolRun,
    });

    let effectiveMemberData: MemberDataPool | null = memberData;
    let membersForScoring: Array<{ age_months?: number | null }> = [];
    if (memberId == null) {
      const { data: membersRows } = await supabase.from("members").select("id, name, age_months, allergies, preferences, dislikes").eq("user_id", userId);
      const membersList = (membersRows ?? []) as Array<{ id: string; name?: string; age_months?: number | null; allergies?: string[] | null; preferences?: string[] | null; dislikes?: string[] | null }>;
      membersForScoring = membersList;
      effectiveMemberData = buildFamilyMemberDataForPlan(membersList);
      safeLog("family_mode", { members_count: membersList.length });
    } else {
      const { data: memberRow } = await supabase
        .from("members")
        .select("age_months, allergies, dislikes, type, introduced_product_keys, introducing_product_key, introducing_started_at")
        .eq("id", effectiveMemberId)
        .eq("user_id", userId)
        .maybeSingle();
      const m = memberRow as {
        age_months?: number | null;
        allergies?: string[] | null;
        dislikes?: string[] | null;
        type?: string | null;
        introduced_product_keys?: string[] | null;
        introducing_product_key?: string | null;
        introducing_started_at?: string | null;
      } | null;
      if (m) {
        effectiveMemberData = {
          ...(memberData ?? {}),
          age_months: m.age_months ?? memberData?.age_months,
          allergies: Array.isArray(m.allergies) && m.allergies.length > 0 ? m.allergies : (memberData?.allergies ?? []),
          dislikes: Array.isArray(m.dislikes) && m.dislikes.length > 0 ? m.dislikes : (memberData?.dislikes ?? []),
          type: m.type ?? memberData?.type,
          introduced_product_keys: Array.isArray(m.introduced_product_keys) ? m.introduced_product_keys : (memberData?.introduced_product_keys ?? []),
          introducing_product_key: m.introducing_product_key ?? memberData?.introducing_product_key ?? null,
          introducing_started_at: m.introducing_started_at ?? memberData?.introducing_started_at ?? null,
        };
        membersForScoring = [{ age_months: m.age_months ?? memberData?.age_months ?? null }];
      } else if (memberData?.age_months != null) {
        membersForScoring = [{ age_months: memberData.age_months }];
      }
    }
    const familyScoringCtx = buildFamilyScoringContext(membersForScoring);
    const isInfantPlanRun = isInfantComplementaryPlan(effectiveMemberData, effectiveMemberId);

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
    if (isInfantPlanRun && effectiveMemberData?.age_months != null) {
      const ageM = Math.max(0, Math.round(Number(effectiveMemberData.age_months)));
      const firstDayKey = dayKeys[0] ?? getTodayKey();
      const dishCountPreview = getInfantComplementaryDishCount(ageM, firstDayKey, effectiveMemberId);
      const nPrimary = filterInfantComplementaryCandidates(poolCandidates, effectiveMemberData, [], [], "primary").length;
      const nSecondary = filterInfantComplementaryCandidates(poolCandidates, effectiveMemberData, [], [], "secondary").length;
      const primaryOk = nPrimary > 0;
      const secondaryOk = dishCountPreview < 2 || nSecondary > 0;
      cheapTotal = primaryOk && secondaryOk ? 1 : 0;
      if (cheapTotal === 0) {
        safeLog("INFANT_CHEAP_ZERO_DETAIL", {
          requestId,
          n_primary_candidates: nPrimary,
          n_secondary_candidates: nSecondary,
          dish_count_preview: dishCountPreview,
          introduced_count: getIntroducedProductKeysForInfant(effectiveMemberData).length,
        });
      }
    } else {
      for (const mk of MEAL_KEYS) cheapTotal += getCheapFilteredCount(poolCandidates, mk, [], [], effectiveMemberData);
    }
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
    const usedTitleKeysByMealType: Record<string, Set<string>> = {};
    const usedCategoriesByMealType: Record<string, Set<string>> = {};
    for (const k of MEAL_KEYS) {
      usedTitleKeysByMealType[k] = new Set<string>();
      usedCategoriesByMealType[k] = new Set<string>();
    }
    if (dayKeys.length === 1 && Array.isArray(body.day_keys) && body.day_keys.length > 0) {
      const otherDayKeys = body.day_keys.filter((k) => typeof k === "string" && k !== dayKeys[0]);
      if (otherDayKeys.length > 0) {
        const { recipeIds: otherIds, titleKeys: otherTitles } = await fetchRecipeAndTitleKeysFromPlans(supabase, userId, effectiveMemberId, otherDayKeys);
        usedRecipeIds = [...otherIds];
        usedTitleKeys = [...otherTitles];
      }
    }
    if (dayKeys.length > 1) {
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
    const totalAiCount = 0;
    let totalAgeBonusSum = 0;
    let totalSoftBonusSum = 0;
    let lastDayKey: string | null = null;
    /** Week only: counts per primary base for diversity (cap + penalty). */
    const usedBaseCounts: Record<string, number> = dayKeys.length > 1 ? {} : ({} as Record<string, number>);
    const useBaseDiversity = dayKeys.length > 1;
    const usedKeyIngredientCounts: Record<string, number> = {};
    const usedKeyIngredientCountsByMealType: Record<string, Record<string, number>> = {};
    if (useBaseDiversity && dayKeys.length > 0) {
      const ingredientSeedDateKeys = [...new Set([...dayKeys, ...getLastNDaysKeys(dayKeys[0], 4)])];
      const slotEntriesForSeed = await fetchKeyIngredientSlotEntriesForDateKeys(
        supabase,
        userId,
        effectiveMemberId,
        ingredientSeedDateKeys,
      );
      await fetchAndMergeKeyIngredientCountsForSlotEntries(
        supabase,
        slotEntriesForSeed,
        usedKeyIngredientCounts,
        usedKeyIngredientCountsByMealType,
      );
    }
    const weekGoalCounts: Record<string, number> = {};
    const culturalSummaryAcc = debugCulturalPlan() ? createEmptyCulturalSummaryAccumulator() : undefined;
    let infantDaysWithMeal = 0;

    if (jobId) {
      await supabase.from("plan_generation_jobs").update({ status: "running", progress_total: dayKeys.length, progress_done: 0, updated_at: new Date().toISOString() }).eq("id", jobId);
    }

    for (let i = 0; i < dayKeys.length; i++) {
      const dayKey = dayKeys[i];
      lastDayKey = dayKey;
      const dayGoalCounts: Record<string, number> = {};
      if (jobId && !isSingleDay) {
        await supabase.from("plan_generation_jobs").update({ progress_done: i, last_day_key: dayKey, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      const { data: existingRow } = await supabase.from("meal_plans_v2").select("id, meals").eq("user_id", userId).eq("planned_date", dayKey).is("member_id", effectiveMemberId).maybeSingle();
      const currentMeals = (existingRow as { meals?: Record<string, MealSlot> } | null)?.meals ?? {};
      const newMeals: Record<string, MealSlot | null | undefined> = { ...currentMeals };

      if (isInfantPlanRun && effectiveMemberData?.age_months != null) {
        const ageM = Math.max(0, Math.round(Number(effectiveMemberData.age_months)));
        const dishCount = getInfantComplementaryDishCount(ageM, dayKey, effectiveMemberId);
        const baseCountsForSlot = useBaseDiversity ? usedBaseCounts : undefined;
        const goalHintsBase = {
          preferredGoals: undefined,
          blockedGoals: undefined,
          requireBalanced: false,
          selectedGoalForScoring,
          dayGoalUsage: { ...dayGoalCounts },
          familyScoring: familyScoringCtx,
          planPickDebug: {
            day_key: dayKey,
            request_id: requestId,
            meal_slot: "infant_breakfast",
            rank_salt: buildAlignedRankSalt({
              kind: "pool",
              userId,
              mealType: "snack",
              dayKey,
              variant: "infant_primary",
              rankEntropy: requestId,
            }),
          },
          culturalSummaryAccumulator: culturalSummaryAcc,
        };

        const picked1 = pickInfantComplementaryFromPool(
          poolCandidates,
          effectiveMemberData,
          usedRecipeIds,
          [...usedTitleKeys],
          "primary",
          baseCountsForSlot,
          goalHintsBase,
        );
        const currentBreakfast = currentMeals.breakfast;
        if (picked1) {
          newMeals.breakfast = { recipe_id: picked1.id, title: picked1.title, plan_source: "pool" };
          await supabase.rpc("record_recipe_feedback", { p_recipe_id: picked1.id, p_action: "added_to_plan" });
          const oldRecipeId = currentBreakfast?.recipe_id;
          if (oldRecipeId && oldRecipeId !== picked1.id) {
            await supabase.rpc("record_recipe_feedback", { p_recipe_id: oldRecipeId, p_action: "replaced_in_plan" });
          }
          totalAgeBonusSum += picked1.ageBonus;
          totalSoftBonusSum += picked1.softBonus;
          usedRecipeIds.push(picked1.id);
          const rowP1 = poolCandidates.find((r) => r.id === picked1.id);
          const keyP1 = recipeTitleDedupeKey(rowP1 ?? { title: picked1.title });
          usedTitleKeys.push(keyP1);
          usedTitleKeysByMealType.breakfast?.add(keyP1);
          usedCategoriesByMealType.breakfast?.add(inferDishCategoryKey(picked1.title, null, null));
          if (useBaseDiversity) {
            usedBaseCounts[picked1.primaryBase] = (usedBaseCounts[picked1.primaryBase] ?? 0) + 1;
          }
          applyPickedRecipeGoalsToDayWeek(picked1.id, poolCandidates, dayGoalCounts, weekGoalCounts);
          totalDbCount++;
        } else {
          newMeals.breakfast = null;
        }

        if (dishCount >= 2) {
          const goalHints2 = {
            ...goalHintsBase,
            dayGoalUsage: { ...dayGoalCounts },
            planPickDebug: {
              day_key: dayKey,
              request_id: requestId,
              meal_slot: "infant_lunch",
              rank_salt: buildAlignedRankSalt({
                kind: "pool",
                userId,
                mealType: "snack",
                dayKey,
                variant: "infant_secondary",
                rankEntropy: requestId,
              }),
            },
          };
          const picked2 = pickInfantComplementaryFromPool(
            poolCandidates,
            effectiveMemberData,
            usedRecipeIds,
            [...usedTitleKeys],
            "secondary",
            baseCountsForSlot,
            goalHints2,
          );
          const currentLunch = currentMeals.lunch;
          if (picked2) {
            newMeals.lunch = { recipe_id: picked2.id, title: picked2.title, plan_source: "pool" };
            await supabase.rpc("record_recipe_feedback", { p_recipe_id: picked2.id, p_action: "added_to_plan" });
            const oldRecipeId = currentLunch?.recipe_id;
            if (oldRecipeId && oldRecipeId !== picked2.id) {
              await supabase.rpc("record_recipe_feedback", { p_recipe_id: oldRecipeId, p_action: "replaced_in_plan" });
            }
            totalAgeBonusSum += picked2.ageBonus;
            totalSoftBonusSum += picked2.softBonus;
            usedRecipeIds.push(picked2.id);
            const rowP2 = poolCandidates.find((r) => r.id === picked2.id);
            const keyP2 = recipeTitleDedupeKey(rowP2 ?? { title: picked2.title });
            usedTitleKeys.push(keyP2);
            usedTitleKeysByMealType.lunch?.add(keyP2);
            usedCategoriesByMealType.lunch?.add(inferDishCategoryKey(picked2.title, null, null));
            if (useBaseDiversity) {
              usedBaseCounts[picked2.primaryBase] = (usedBaseCounts[picked2.primaryBase] ?? 0) + 1;
            }
            applyPickedRecipeGoalsToDayWeek(picked2.id, poolCandidates, dayGoalCounts, weekGoalCounts);
            totalDbCount++;
          } else {
            newMeals.lunch = null;
          }
        } else {
          newMeals.lunch = null;
        }

        newMeals.snack = null;
        newMeals.dinner = null;

        if (picked1) infantDaysWithMeal++;
      } else {
        for (const mealKey of MEAL_KEYS) {
          const poolForSlot =
            memberId == null && mealKey === "dinner"
              ? poolCandidates.filter((r) => isFamilyDinnerCandidate(r))
              : poolCandidates;
          const currentSlot = currentMeals[mealKey];
          const excludeIdsForSlot = currentSlot?.recipe_id ? [...usedRecipeIds, currentSlot.recipe_id] : usedRecipeIds;
          const excludeTitlesBase = [...usedTitleKeys, ...(usedTitleKeysByMealType[mealKey] ? [...usedTitleKeysByMealType[mealKey]] : [])];
          const excludeTitlesForSlot = currentSlot?.title ? [...excludeTitlesBase, normalizeTitleKey(currentSlot.title)] : excludeTitlesBase;
          const baseCountsForSlot = useBaseDiversity ? usedBaseCounts : undefined;
          const slotGoalHints = {
            preferredGoals: undefined,
            blockedGoals: undefined,
            requireBalanced: false,
            selectedGoalForScoring,
            dayGoalUsage: { ...dayGoalCounts },
            familyScoring: familyScoringCtx,
            usedKeyIngredientCounts: useBaseDiversity ? usedKeyIngredientCounts : undefined,
            usedKeyIngredientCountsByMealType: useBaseDiversity ? usedKeyIngredientCountsByMealType : undefined,
            planPickDebug: {
              day_key: dayKey,
              request_id: requestId,
              meal_slot: mealKey,
              rank_salt: buildAlignedRankSalt({ kind: "pool", userId, mealType: mealKey, dayKey, rankEntropy: requestId }),
            },
            culturalSummaryAccumulator: culturalSummaryAcc,
          };
          let picked = pickFromPoolInMemory(
            poolForSlot,
            mealKey,
            effectiveMemberData,
            excludeIdsForSlot,
            excludeTitlesForSlot,
            baseCountsForSlot,
            slotGoalHints,
          );
          if (!picked && memberId == null && mealKey === "dinner" && poolForSlot.length < MIN_FAMILY_DINNER) {
            picked = pickFromPoolInMemory(
              poolCandidates,
              mealKey,
              effectiveMemberData,
              excludeIdsForSlot,
              excludeTitlesForSlot,
              baseCountsForSlot,
              slotGoalHints,
            );
          }
          if (picked) {
            newMeals[mealKey] = { recipe_id: picked.id, title: picked.title, plan_source: "pool" };
            await supabase.rpc("record_recipe_feedback", { p_recipe_id: picked.id, p_action: "added_to_plan" });
            const oldRecipeId = currentSlot?.recipe_id;
            if (oldRecipeId && oldRecipeId !== picked.id) {
              await supabase.rpc("record_recipe_feedback", { p_recipe_id: oldRecipeId, p_action: "replaced_in_plan" });
            }
            totalAgeBonusSum += picked.ageBonus;
            totalSoftBonusSum += picked.softBonus;
            usedRecipeIds.push(picked.id);
            const rowP = poolForSlot.find((r) => r.id === picked.id) ?? poolCandidates.find((r) => r.id === picked.id);
            const keyP = recipeTitleDedupeKey(rowP ?? { title: picked.title });
            usedTitleKeys.push(keyP);
            usedTitleKeysByMealType[mealKey]?.add(keyP);
            usedCategoriesByMealType[mealKey]?.add(inferDishCategoryKey(picked.title, null, null));
            if (useBaseDiversity) {
              usedBaseCounts[picked.primaryBase] = (usedBaseCounts[picked.primaryBase] ?? 0) + 1;
            }
            if (useBaseDiversity) {
              const pickedRow = poolCandidates.find((r) => r.id === picked.id);
              if (pickedRow) {
                const sig = deriveKeyIngredientSignals(pickedRow);
                addKeyIngredientKeysToCounts(
                  sig.keys,
                  usedKeyIngredientCounts,
                  mealKey,
                  usedKeyIngredientCountsByMealType,
                );
              }
            }
            const pickedGoals = normalizeNutritionGoals(
              poolCandidates.find((r) => r.id === picked!.id)?.nutrition_goals
            );
            if (pickedGoals.length === 0) {
              dayGoalCounts.balanced = (dayGoalCounts.balanced ?? 0) + 1;
              weekGoalCounts.balanced = (weekGoalCounts.balanced ?? 0) + 1;
            } else {
              for (const g of pickedGoals) {
                dayGoalCounts[g] = (dayGoalCounts[g] ?? 0) + 1;
                weekGoalCounts[g] = (weekGoalCounts[g] ?? 0) + 1;
              }
            }
            totalDbCount++;
          } else {
            /** Не смогли подобрать из пула — очищаем слот, иначе остаётся старый рецепт и расходится с filledSlotsCount. */
            newMeals[mealKey] = null;
          }
        }
      }

      const upsertErr = await upsertMealPlanRow(supabase, userId, effectiveMemberId, dayKey, newMeals);
      if (upsertErr.error && debugPool()) safeWarn("[plan] upsert failed", { dayKey, error: upsertErr.error });
    }

    safeLog("CHAT_PLAN_FAMILY_DEBUG", {
      hasInfant: familyScoringCtx.hasInfant,
      hasToddler: familyScoringCtx.hasToddler,
      members_count: familyScoringCtx.membersCount,
      age_groups_distribution: familyScoringCtx.ageGroupsDistribution,
      avg_age: familyScoringCtx.avgAgeYears,
      total_age_bonus: totalAgeBonusSum,
      total_soft_bonus: totalSoftBonusSum,
    });

    if (debugCulturalPlan() && culturalSummaryAcc && culturalSummaryAcc.total_picks > 0) {
      safeLog("CHAT_PLAN_CULTURAL_SUMMARY", finalizeCulturalSummary(culturalSummaryAcc, requestId));
    }

    if (!isPremiumOrTrial) {
      await supabase.from("usage_events").insert({ user_id: userId, member_id: effectiveMemberId, feature: "plan_fill_day" });
    }

    const infantExpectedSlotsTotal =
      isInfantPlanRun && effectiveMemberData?.age_months != null
        ? dayKeys.reduce(
            (sum, dk) =>
              sum +
              getInfantComplementaryDishCount(
                Math.max(0, Math.round(Number(effectiveMemberData.age_months))),
                dk,
                effectiveMemberId,
              ),
            0,
          )
        : dayKeys.length * MEAL_KEYS.length;

    if (jobId) {
      const filledSlotsFinal = totalDbCount + totalAiCount;
      const totalSlotsRun = infantExpectedSlotsTotal;
      const errorTextFinal = filledSlotsFinal < totalSlotsRun ? "partial:pool_exhausted" : null;
      await supabase
        .from("plan_generation_jobs")
        .update({ status: "done", error_text: errorTextFinal, progress_done: dayKeys.length, last_day_key: lastDayKey, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    const totalMs = Date.now() - tRunStart;
    const filledSlotsCount = totalDbCount + totalAiCount;
    const filledDaysCount = isInfantPlanRun ? infantDaysWithMeal : Math.floor(filledSlotsCount / MEAL_KEYS.length);
    safeLog("[TIMING] done", { requestId, totalMs, filledDaysCount, filledSlotsCount });
    if (totalMs > 2000) safeWarn("[TIMING WARN]", { stage: "totalMs", ms: totalMs, requestId });

    const totalSlots = infantExpectedSlotsTotal;
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
