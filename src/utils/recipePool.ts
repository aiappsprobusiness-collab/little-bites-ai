/**
 * Pool-first v1: подбор из пула (источники как в Edge generate-plan: seed, starter, manual, week_ai, chat_ai).
 * Токены аллергенов — из allergenTokens (в унисон с Edge _shared/allergens).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBlockedTokens, containsAnyToken, containsAnyTokenForAllergy } from "@/utils/allergenTokens";
import { POOL_SOURCES } from "@/utils/recipeCanonical";
import {
  isIntroducingPeriodActive,
  extractAllKeyProductKeysFromIngredients,
  evaluateInfantRecipeComplementaryRules,
  evaluateInfantSecondaryFamiliarOnly,
  isInfantComplementaryFeedDebug,
  scoreInfantIntroducedMatch,
  scoreInfantIntroducingPeriodSort,
  type IngredientForProductKey,
} from "@/utils/introducedProducts";
import {
  addKeyIngredientKeysToCounts,
  computeWeeklyKeyIngredientPenaltyCalibrated,
  deriveKeyIngredientSignals,
} from "@shared/keyIngredientSignals";
import { buildAlignedRankSalt } from "@shared/planRankTrustShared";
import { pickFromPoolRankingLite, type PoolRankLiteRow } from "@/utils/poolRankLite";

const IS_DEV = import.meta.env.DEV;

/** Как Edge `POOL_TRUST_OR`: в пул подбора не попадают рецепты с `trust_level = blocked`. */
export const POOL_TRUST_OR = "trust_level.is.null,trust_level.neq.blocked";

/** [POOL DEBUG] логи только при ?debugPool=1 (не спамим в проде). */
function isDebugPool(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugPool") === "1";
}

/** Нормализованный ключ названия для сравнения и исключения дублей. */
const PLAN_INGREDIENT_FETCH_CHUNK = 80;

const MEAL_PLAN_SLOT_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;

/** 7 календарных дней: `dayKey` и 6 предыдущих (как окно replace_slot на Edge). */
export function buildSevenDayPlanKeysEndingAt(dayKey: string): string[] {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return [dayKey];
  const out: string[] = [];
  for (let delta = 0; delta < 7; delta++) {
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - delta);
    out.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

export async function fetchUsedKeyIngredientCountsForRecipeIds(
  supabase: SupabaseClient,
  recipeIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const ids = [...new Set(recipeIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (let i = 0; i < ids.length; i += PLAN_INGREDIENT_FETCH_CHUNK) {
    const slice = ids.slice(i, i + PLAN_INGREDIENT_FETCH_CHUNK);
    const { data } = await supabase
      .from("recipes")
      .select("id, title, description, recipe_ingredients(name, display_text)")
      .in("id", slice);
    for (const row of data ?? []) {
      const sig = deriveKeyIngredientSignals(row as PoolRecipeRow);
      addKeyIngredientKeysToCounts(sig.keys, counts);
    }
  }
  return counts;
}

export type KeyIngredientClientSlot = { recipeId: string; mealKey: string };

/**
 * Инкремент глобальных и per-meal счётчиков по списку слотов плана (как на Edge).
 */
export async function mergeKeyIngredientCountsFromPlanSlots(
  supabase: SupabaseClient,
  slots: KeyIngredientClientSlot[],
  intoGlobal: Record<string, number>,
  intoByMeal: Record<string, Record<string, number>>,
): Promise<void> {
  if (slots.length === 0) return;
  const idSet = new Set(slots.map((s) => s.recipeId).filter((id) => id.length > 0));
  const ids = [...idSet];
  const idToRow = new Map<string, PoolRecipeRow>();

  for (let i = 0; i < ids.length; i += PLAN_INGREDIENT_FETCH_CHUNK) {
    const slice = ids.slice(i, i + PLAN_INGREDIENT_FETCH_CHUNK);
    const { data } = await supabase
      .from("recipes")
      .select("id, title, description, recipe_ingredients(name, display_text)")
      .in("id", slice);
    for (const row of data ?? []) {
      const r = row as PoolRecipeRow;
      if (r.id) idToRow.set(r.id, r);
    }
  }

  for (const { recipeId, mealKey } of slots) {
    const row = idToRow.get(recipeId);
    if (!row) continue;
    const sig = deriveKeyIngredientSignals(row);
    addKeyIngredientKeysToCounts(sig.keys, intoGlobal, mealKey, intoByMeal);
  }
}

export async function collectRecipeIdsFromPlansExcludingSlotClient(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  plannedDates: string[],
  excludeDayKey: string,
  excludeMealKey: string,
): Promise<string[]> {
  if (plannedDates.length === 0) return [];
  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .in("planned_date", plannedDates);
  if (memberId == null || memberId === "") q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data } = await q;
  const ids: string[] = [];
  for (const row of data ?? []) {
    const dk = (row as { planned_date?: string }).planned_date;
    const meals = (row as { meals?: Record<string, { recipe_id?: string }> }).meals ?? {};
    for (const mk of MEAL_PLAN_SLOT_KEYS) {
      if (dk === excludeDayKey && mk === excludeMealKey) continue;
      const rid = meals[mk]?.recipe_id;
      if (typeof rid === "string" && rid.length > 0) ids.push(rid);
    }
  }
  return ids;
}

/** Пары (recipe_id, meal) для окна плана, исключая один слот — для byMealType + глобальных счётчиков. */
export async function collectRecipeSlotsFromPlansExcludingSlotClient(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  plannedDates: string[],
  excludeDayKey: string,
  excludeMealKey: string,
): Promise<KeyIngredientClientSlot[]> {
  if (plannedDates.length === 0) return [];
  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .in("planned_date", plannedDates);
  if (memberId == null || memberId === "") q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data } = await q;
  const out: KeyIngredientClientSlot[] = [];
  for (const row of data ?? []) {
    const dk = (row as { planned_date?: string }).planned_date;
    const meals = (row as { meals?: Record<string, { recipe_id?: string }> }).meals ?? {};
    for (const mk of MEAL_PLAN_SLOT_KEYS) {
      if (dk === excludeDayKey && mk === excludeMealKey) continue;
      const rid = meals[mk]?.recipe_id;
      if (typeof rid === "string" && rid.length > 0) out.push({ recipeId: rid, mealKey: mk });
    }
  }
  return out;
}

export function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Токенизация текста (RU): lower, убрать пунктуацию, split по пробелам. */
export function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

const MEAL_TYPE_ALIASES: Record<string, MealType> = {
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

/** Нормализация meal_type к enum breakfast | lunch | snack | dinner. */
export function normalizeMealType(value: string | null | undefined): MealType | null {
  if (value == null || typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? MEAL_TYPE_ALIASES[value.trim()] ?? null;
}

const SOUP_TITLE_TOKENS = ["суп", "борщ", "щи", "солянка", "soup"];
/** Не подставлять на завтрак. */
export function isSoupLikeTitle(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return false;
  const t = title.toLowerCase();
  return SOUP_TITLE_TOKENS.some((tok) => t.includes(tok));
}

/** Обед/ужин: не подставлять явные перекусы/десерты. */
const SNACK_DESSERT_TITLE_TOKENS = ["йогурт", "пюре", "дольки", "печенье", "батончик", "пудинг", "творожок", "фруктовый", "яблочн", "перекус", "смузи"];
/** Завтрак: не подставлять явно обеденные/ужинные блюда. */
const DINNER_STYLE_TITLE_TOKENS = ["рагу", "нут", "тушен", "тушён", "плов", "гриль"];

/** Sanity: причины блокировки по слоту. Пустой массив = ок. */
export function getSanityBlockedReasons(title: string | null | undefined, slot: MealType): string[] {
  if (!title || typeof title !== "string") return [];
  const t = title.toLowerCase();
  const reasons: string[] = [];
  if (slot === "dinner" || slot === "lunch") {
    if (SNACK_DESSERT_TITLE_TOKENS.some((tok) => t.includes(tok))) reasons.push("snack_dessert_on_meal");
  }
  if (slot === "breakfast") {
    if (DINNER_STYLE_TITLE_TOKENS.some((tok) => t.includes(tok))) reasons.push("dinner_style_on_breakfast");
  }
  return reasons;
}

export interface MemberDataForPool {
  allergies?: string | string[];
  /** Legacy. Prefer likes for soft, dislikes for hard. */
  preferences?: string | string[];
  likes?: string | string[];
  dislikes?: string | string[];
  introduced_product_keys?: string[];
  /** Период введения одного продукта (клиент): при активном периоде усиливается приоритет рецептов с этим продуктом. */
  introducing_product_key?: string | null;
  introducing_started_at?: string | null;
  age_months?: number;
  age_years?: number;
}

/** Слот прикорма &lt;12 мес: новый продукт (primary) vs только введённые (secondary). */
export type InfantSlotRole = "primary" | "secondary";

/**
 * Если роль не задана и возраст &lt;12 мес — по умолчанию только для **технических** carrier-слотов
 * `breakfast` / `lunch` в строке плана: `breakfast` → primary, `lunch` → secondary.
 * Для `snack`/`dinner` роль не выводится — подбор как у 12+ по `recipes.meal_type` со слотом.
 * Экран прикорма и `pickInfant*` задают роль явно (`mealType: snack` + `infantSlotRole`). Явный `explicit` перекрывает.
 */
export function resolveInfantSlotRoleForPool(
  slotNorm: MealType,
  memberData: MemberDataForPool | null | undefined,
  explicit: InfantSlotRole | null | undefined
): InfantSlotRole | null {
  if (explicit != null) return explicit;
  const ageMonths = memberData?.age_months ?? (memberData?.age_years != null ? memberData.age_years * 12 : null);
  if (ageMonths != null && ageMonths < 12) {
    if (slotNorm === "lunch") return "secondary";
    if (slotNorm === "breakfast") return "primary";
    return null;
  }
  return null;
}

export interface PickRecipeFromPoolArgs {
  supabase: SupabaseClient;
  userId: string;
  memberId: string | null;
  mealType: MealType;
  memberData?: MemberDataForPool | null;
  excludeRecipeIds: string[];
  excludeTitleKeys: string[];
  limitCandidates?: number;
  /** Прикорм: роль слота primary/secondary (новинка vs только введённые), не «завтрак/обед». */
  infantSlotRole?: InfantSlotRole | null;
  /** Соль ранжирования: день плана (как на Edge generate-plan). */
  plannedDayKey?: string;
  /** Суффикс соли (infant_primary / infant_secondary) — см. shared buildAlignedRankSalt. */
  rankVariant?: string;
  /**
   * Недельный контекст: мягкий штраф за повтор ключевых продуктов (как generate-plan).
   * Объект мутируется после удачного pick (инкремент ключей выбранного рецепта).
   */
  usedKeyIngredientCounts?: Record<string, number>;
  /** Счётчики по типу приёма (breakfast/snack — доп. штраф в slot-fit). */
  usedKeyIngredientCountsByMealType?: Record<string, Record<string, number>>;
}

function computeFirstNovelProductKeyForPoolRow(
  row: PoolRecipeRow,
  introducedKeys: string[]
): string | null {
  const keys = extractAllKeyProductKeysFromIngredients(
    (row.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
    100
  );
  if (keys.length === 0) return null;
  const set = new Set(introducedKeys);
  for (const k of keys) {
    if (!set.has(k)) return k;
  }
  return null;
}

export type PoolRecipeRow = {
  id: string;
  title: string;
  tags: string[] | null;
  description: string | null;
  cooking_time_minutes: number | null;
  source?: string | null;
  meal_type?: string | null;
  min_age_months?: number | null;
  max_age_months?: number | null;
  trust_level?: string | null;
  score?: number | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string; category?: string | null }> | null;
};

type RecipeRow = PoolRecipeRow;

/** Согласовано с Edge generate-plan recipeFitsAgeRange. */
export function recipeFitsAgeMonthsRow(
  min: number | null | undefined,
  max: number | null | undefined,
  ageMonths: number
): boolean {
  if (max != null && ageMonths > max) return false;
  if (min != null && ageMonths < min) return false;
  return true;
}

/**
 * PostgREST: AND (min IS NULL OR min ≤ age) AND (max IS NULL OR max ≥ age) — эквивалент recipeFitsAgeMonthsRow до limit/order.
 * Без этого `ORDER BY created_at DESC LIMIT N` забивает выборку недавно импортированными рецептами 12+ мес, и прикорм <12 не попадает в окно.
 */
export function applyUnder12PoolAgeMonthsSqlFilter<T extends { or: (filters: string) => T }>(
  query: T,
  ageMonths: number | null | undefined
): T {
  if (ageMonths == null || !Number.isFinite(ageMonths) || ageMonths >= 12) return query;
  const a = Math.round(ageMonths);
  return query
    .or(`min_age_months.is.null,min_age_months.lte.${a}`)
    .or(`max_age_months.is.null,max_age_months.gte.${a}`);
}

/** Токены аллергенов из allergenTokens (курица→кур/куриц, орехи→орех, молоко→dairy и т.д.). */
function getAllergyTokens(memberData: MemberDataForPool | null | undefined): string[] {
  return buildBlockedTokens(memberData?.allergies);
}

/** Токены для жёсткого исключения: из dislikes (каждый пункт токенизируется). */
function getDislikeTokens(memberData: MemberDataForPool | null | undefined): string[] {
  const list = memberData?.dislikes;
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [String(list)];
  const tokens = new Set<string>();
  for (const item of arr) {
    const s = String(item).trim().toLowerCase();
    if (!s) continue;
    for (const t of tokenize(s)) tokens.add(t);
  }
  return [...tokens];
}

/** Есть ли непустые dislikes — тогда в запросе пула нужны `recipe_ingredients` (паритет с Edge). */
export function memberHasDislikesForPool(memberData: MemberDataForPool | null | undefined): boolean {
  const list = memberData?.dislikes;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((d) => String(d ?? "").trim().length > 0);
}

/** Токены для возраста < 3: остро, кофе, грибы. */
const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];

/** Фильтрация кандидата по профилю (аллергии, предпочтения, возраст). */
export function passesProfileFilter(
  recipe: {
    title?: string | null;
    description?: string | null;
    tags?: string[] | null;
    recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
  },
  memberData: MemberDataForPool | null | undefined
): { pass: boolean; reason?: string } {
  const ingredientsText = (recipe.recipe_ingredients ?? [])
    .map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" "))
    .join(" ");
  const textWithIngredients = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" "), ingredientsText]
    .join(" ")
    .toLowerCase();

  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length > 0) {
    if (containsAnyTokenForAllergy(textWithIngredients, allergyTokens).hit) {
      if (IS_DEV) console.log("[DEBUG] pool filter: allergy hit", { title: recipe.title, tokens: allergyTokens });
      return { pass: false, reason: "allergy" };
    }
  }

  const dislikeTokens = getDislikeTokens(memberData);
  if (dislikeTokens.length > 0) {
    if (containsAnyToken(textWithIngredients, dislikeTokens).hit) {
      if (IS_DEV) console.log("[DEBUG] pool filter: dislike hit", { title: recipe.title, tokens: dislikeTokens });
      return { pass: false, reason: "preference" };
    }
  }

  const ageMonths = memberData?.age_months ?? (memberData?.age_years != null ? memberData.age_years * 12 : null);
  if (ageMonths != null && ageMonths < 36) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, AGE_RESTRICTED_TOKENS).hit) {
      if (IS_DEV) console.log("[DEBUG] pool filter: age < 3 hit", { title: recipe.title });
      return { pass: false, reason: "age" };
    }
  }

  return { pass: true };
}

export type FilterPoolCandidatesForSlotOptions = {
  slotNorm: MealType;
  memberData?: MemberDataForPool | null;
  excludeRecipeIds: string[];
  excludeTitleKeys: string[];
  infantSlotRole?: InfantSlotRole | null;
};

/**
 * Те же in-memory фильтры, что и в pickRecipeFromPool: слот, возраст &lt;12 (min/max), sanity, аллергии/dislikes.
 */
export function filterPoolCandidatesForSlot(rows: PoolRecipeRow[], options: FilterPoolCandidatesForSlotOptions): PoolRecipeRow[] {
  const { slotNorm, memberData, excludeRecipeIds, excludeTitleKeys, infantSlotRole } = options;
  const role = resolveInfantSlotRoleForPool(slotNorm, memberData ?? null, infantSlotRole ?? null);
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));

  let filtered = rows;
  if (excludeRecipeIds.length >= 50 || excludeSet.size > 0) {
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }

  filtered = filtered.filter((r) => {
    const key = normalizeTitleKey(r.title);
    return !excludeTitleSet.has(key);
  });

  const ageMonths = memberData?.age_months ?? (memberData?.age_years != null ? memberData.age_years * 12 : null);
  /** Прикорм &lt;12: две карточки — «новинка» и «знакомое»; подбор из общего пула, без привязки recipe.meal_type к слоту плана. */
  const infantComplementaryUnifiedPool =
    ageMonths != null && ageMonths < 12 && (role === "primary" || role === "secondary");

  filtered = filtered.filter((r) => {
    const recNorm = normalizeMealType(r.meal_type);
    if (recNorm === null) return false;
    if (infantComplementaryUnifiedPool) {
      return true;
    }
    return recNorm === slotNorm;
  });
  const candidatesAfterMealType = filtered.length;

  if (ageMonths != null && ageMonths < 12) {
    filtered = filtered.filter((r) =>
      recipeFitsAgeMonthsRow(r.min_age_months ?? null, r.max_age_months ?? null, ageMonths)
    );
  }

  /**
   * Прикорм unified: подбор не зависит от «завтрак/обед» как носителей в БД — не режем по slotNorm
   * супом и «завтрачной» санити; для sanity используем нейтральный слот (перекус не добавляет лишних правил).
   */
  const mealSlotFiltersNorm: MealType = infantComplementaryUnifiedPool ? "snack" : slotNorm;

  if (!infantComplementaryUnifiedPool && slotNorm === "breakfast") {
    filtered = filtered.filter((r) => !isSoupLikeTitle(r.title));
  }

  filtered = filtered.filter((r) => getSanityBlockedReasons(r.title, mealSlotFiltersNorm).length === 0);
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData).pass);

  if (isDebugPool() && filtered.length === 0 && rows.length > 0) {
    console.log("[POOL DEBUG] filterPoolCandidatesForSlot: all filtered out", {
      slotNorm,
      mealSlotFiltersNorm,
      candidatesAfterMealType,
      inCount: rows.length,
    });
  }

  const introducedKeys = Array.isArray(memberData?.introduced_product_keys)
    ? memberData.introduced_product_keys.filter((k): k is string => Boolean(k))
    : [];
  const introducingKey = memberData?.introducing_product_key ?? null;
  const introducingStarted = memberData?.introducing_started_at ?? null;
  const introducingPeriodActive =
    !!introducingKey &&
    !!introducingStarted &&
    isIntroducingPeriodActive(introducingKey, introducingStarted, new Date());

  if (ageMonths != null && ageMonths < 12 && role === "secondary") {
    if (introducedKeys.length === 0) {
      return [];
    }
    filtered = filtered.filter((r) => {
      const ev = evaluateInfantSecondaryFamiliarOnly(
        (r.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
        introducedKeys
      );
      if (!ev.valid && isInfantComplementaryFeedDebug()) {
        console.log("[INFANT_RULE]", {
          recipeId: r.id,
          title: r.title,
          introduced_product_keys: introducedKeys,
          canonicalKeys: ev.canonicalKeys,
          novelKeys: ev.novelKeys,
          reason: ev.reason,
          slotRole: "secondary",
        });
      }
      return ev.valid;
    });
    filtered = [...filtered].sort((a, b) => {
      const aScore = scoreInfantIntroducedMatch({
        ageMonths,
        introducedProductKeys: introducedKeys,
        ingredients: (a.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
      });
      const bScore = scoreInfantIntroducedMatch({
        ageMonths,
        introducedProductKeys: introducedKeys,
        ingredients: (b.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
      });
      return bScore - aScore;
    });
    return filtered;
  }

  if (ageMonths != null && ageMonths < 12 && role === "primary") {
    filtered = filtered.filter((r) => {
      const ev = evaluateInfantRecipeComplementaryRules(
        (r.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
        introducedKeys
      );
      if (!ev.valid && isInfantComplementaryFeedDebug()) {
        console.log("[INFANT_RULE]", {
          recipeId: r.id,
          title: r.title,
          introduced_product_keys: introducedKeys,
          canonicalKeys: ev.canonicalKeys,
          novelKeys: ev.novelKeys,
          reason: ev.reason,
          slotRole: "primary",
        });
      }
      return ev.valid;
    });
  }

  if (ageMonths != null && ageMonths < 12 && role !== "secondary" && (introducedKeys.length > 0 || introducingPeriodActive)) {
    filtered = [...filtered].sort((a, b) => {
      const aScore = scoreInfantIntroducingPeriodSort({
        ageMonths,
        introducedProductKeys: introducedKeys,
        introducingProductKey: introducingKey,
        introducingPeriodActive,
        ingredients: (a.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
      });
      const bScore = scoreInfantIntroducingPeriodSort({
        ageMonths,
        introducedProductKeys: introducedKeys,
        introducingProductKey: introducingKey,
        introducingPeriodActive,
        ingredients: (b.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
      });
      return bScore - aScore;
    });
  }

  return filtered;
}

/**
 * Proxy slot-fit для client ranking-lite (согласован по масштабу с trust/db в shared/planRankTrustShared).
 * Прикорм: те же сигналы, что сортировка в filterPoolCandidatesForSlot; 12+ — лёгкий бонус по времени готовки.
 */
export function computeSlotFitForPoolRow(
  r: PoolRecipeRow,
  ctx: {
    slotNorm: MealType;
    memberData?: MemberDataForPool | null;
    infantSlotRole?: InfantSlotRole | null;
    usedKeyIngredientCounts?: Record<string, number> | null;
    usedKeyIngredientCountsByMealType?: Record<string, Record<string, number>> | null;
  },
): number {
  const ageMonths =
    ctx.memberData?.age_months ??
    (ctx.memberData?.age_years != null ? ctx.memberData.age_years * 12 : null);
  const role = resolveInfantSlotRoleForPool(ctx.slotNorm, ctx.memberData ?? null, ctx.infantSlotRole ?? null);

  if (ageMonths != null && ageMonths < 12 && role === "secondary") {
    const introducedKeys = Array.isArray(ctx.memberData?.introduced_product_keys)
      ? ctx.memberData.introduced_product_keys.filter((k): k is string => Boolean(k))
      : [];
    const raw = scoreInfantIntroducedMatch({
      ageMonths,
      introducedProductKeys: introducedKeys,
      ingredients: (r.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
    });
    return 10 + Math.max(-12, Math.min(28, raw * 0.35));
  }

  if (ageMonths != null && ageMonths < 12 && role === "primary") {
    const introducedKeys = Array.isArray(ctx.memberData?.introduced_product_keys)
      ? ctx.memberData.introduced_product_keys.filter((k): k is string => Boolean(k))
      : [];
    const introducingKey = ctx.memberData?.introducing_product_key ?? null;
    const introducingStarted = ctx.memberData?.introducing_started_at ?? null;
    const introducingPeriodActive =
      !!introducingKey &&
      !!introducingStarted &&
      isIntroducingPeriodActive(introducingKey, introducingStarted, new Date());
    const raw = scoreInfantIntroducingPeriodSort({
      ageMonths,
      introducedProductKeys: introducedKeys,
      introducingProductKey: introducingKey,
      introducingPeriodActive,
      ingredients: (r.recipe_ingredients ?? null) as IngredientForProductKey[] | null,
    });
    return 8 + Math.max(-15, Math.min(32, raw * 0.22));
  }

  let f = 12;
  const c = r.cooking_time_minutes;
  if (c != null && c > 0) {
    if (c > 40) f -= 4;
    else if (c <= 20) f += 5;
    else if (c <= 45) f += 2;
  }
  const infantUnified =
    ageMonths != null && ageMonths < 12 && (role === "primary" || role === "secondary");
  if (!infantUnified) {
    const recNorm = normalizeMealType(r.meal_type);
    if (recNorm === ctx.slotNorm) f += 3;
  }
  if (ctx.usedKeyIngredientCounts != null) {
    const sig = deriveKeyIngredientSignals(r);
    const { penalty } = computeWeeklyKeyIngredientPenaltyCalibrated(sig, {
      usedGlobal: ctx.usedKeyIngredientCounts,
      usedByMeal: ctx.usedKeyIngredientCountsByMealType ?? null,
      mealSlot: ctx.slotNorm,
    });
    f -= penalty;
  }
  return f;
}

export type ListFilteredPoolRecipesArgs = Omit<PickRecipeFromPoolArgs, "excludeRecipeIds" | "excludeTitleKeys"> & {
  excludeRecipeIds?: string[];
  excludeTitleKeys?: string[];
  limitCandidates?: number;
};

/** Список рецептов пула после тех же фильтров, что pickRecipeFromPool (для подсчёта «ещё варианты» / fallback). */
export async function listFilteredPoolRecipesForPlanSlot(args: ListFilteredPoolRecipesArgs): Promise<PoolRecipeRow[]> {
  const {
    supabase,
    mealType,
    memberData,
    excludeRecipeIds = [],
    excludeTitleKeys = [],
    limitCandidates = 150,
    infantSlotRole,
    usedKeyIngredientCounts,
    usedKeyIngredientCountsByMealType,
  } = args;

  const slotNorm = normalizeMealType(mealType) ?? (mealType as MealType);
  const hasAllergies = Array.isArray(memberData?.allergies) && memberData.allergies.length > 0;
  const hasDislikes = memberHasDislikesForPool(memberData ?? null);
  const hasIntroduced = Array.isArray(memberData?.introduced_product_keys) && memberData.introduced_product_keys.length > 0;
  const hasIntroducing =
    !!memberData?.introducing_product_key &&
    !!memberData?.introducing_started_at &&
    isIntroducingPeriodActive(
      memberData.introducing_product_key,
      memberData.introducing_started_at,
      new Date()
    );

  const resolvedListInfantRole = resolveInfantSlotRoleForPool(slotNorm, memberData ?? null, infantSlotRole ?? null);
  const needsIngredientsForInfantRole =
    resolvedListInfantRole === "primary" || resolvedListInfantRole === "secondary";
  const needsIngredientsForWeeklyDiversity =
    usedKeyIngredientCounts != null || usedKeyIngredientCountsByMealType != null;

  const selectFields =
    hasAllergies ||
    hasDislikes ||
    hasIntroduced ||
    hasIntroducing ||
    needsIngredientsForInfantRole ||
    needsIngredientsForWeeklyDiversity
      ? "id, title, tags, description, cooking_time_minutes, source, meal_type, min_age_months, max_age_months, trust_level, score, recipe_ingredients(name, display_text, category)"
      : "id, title, tags, description, cooking_time_minutes, source, meal_type, min_age_months, max_age_months, trust_level, score";

  const ageMonthsForPool =
    memberData?.age_months ??
    (memberData?.age_years != null && Number.isFinite(memberData.age_years) ? memberData.age_years * 12 : null);

  let poolQuery = supabase
    .from("recipes")
    .select(selectFields)
    .in("source", [...POOL_SOURCES])
    .or(POOL_TRUST_OR);
  poolQuery = applyUnder12PoolAgeMonthsSqlFilter(poolQuery, ageMonthsForPool);
  const { data: rows, error } = await poolQuery.order("created_at", { ascending: false }).limit(limitCandidates);

  if (error || !rows?.length) return [];

  const rawCandidates = rows as PoolRecipeRow[];
  return filterPoolCandidatesForSlot(rawCandidates, {
    slotNorm,
    memberData,
    excludeRecipeIds,
    excludeTitleKeys,
    infantSlotRole: args.infantSlotRole ?? null,
  });
}

export type PickRecipeFromPoolResult = {
  id: string;
  title: string;
  /** Первый «новый» ключ продукта (для primary-слота и confirm при смене introducing). */
  firstNovelProductKey: string | null;
};

/** Выбрать рецепт из пула по слоту приёма пищи. */
export async function pickRecipeFromPool(
  args: PickRecipeFromPoolArgs
): Promise<PickRecipeFromPoolResult | null> {
  const {
    supabase,
    userId,
    memberId,
    mealType,
    memberData,
    excludeRecipeIds,
    excludeTitleKeys,
    limitCandidates = 60,
    infantSlotRole,
    plannedDayKey,
    rankVariant,
    usedKeyIngredientCounts,
    usedKeyIngredientCountsByMealType,
  } = args;

  const excludeSet = new Set(excludeRecipeIds);
  const slotNorm = normalizeMealType(mealType) ?? (mealType as MealType);
  const hasAllergies = Array.isArray(memberData?.allergies) && memberData.allergies.length > 0;
  const hasDislikes = memberHasDislikesForPool(memberData ?? null);
  const hasIntroduced = Array.isArray(memberData?.introduced_product_keys) && memberData.introduced_product_keys.length > 0;
  const hasIntroducing =
    !!memberData?.introducing_product_key &&
    !!memberData?.introducing_started_at &&
    isIntroducingPeriodActive(
      memberData.introducing_product_key,
      memberData.introducing_started_at,
      new Date()
    );

  const resolvedInfantSlotRole = resolveInfantSlotRoleForPool(slotNorm, memberData ?? null, infantSlotRole ?? null);
  const needsIngredientsForInfantRole =
    resolvedInfantSlotRole === "primary" || resolvedInfantSlotRole === "secondary";
  const needsIngredientsForWeeklyDiversity =
    usedKeyIngredientCounts != null || usedKeyIngredientCountsByMealType != null;

  const selectFields =
    hasAllergies ||
    hasDislikes ||
    hasIntroduced ||
    hasIntroducing ||
    needsIngredientsForInfantRole ||
    needsIngredientsForWeeklyDiversity
      ? "id, title, tags, description, cooking_time_minutes, source, meal_type, min_age_months, max_age_months, trust_level, score, recipe_ingredients(name, display_text, category)"
      : "id, title, tags, description, cooking_time_minutes, source, meal_type, min_age_months, max_age_months, trust_level, score";

  const ageMonthsForPool =
    memberData?.age_months ??
    (memberData?.age_years != null && Number.isFinite(memberData.age_years) ? memberData.age_years * 12 : null);

  let q = supabase
    .from("recipes")
    .select(selectFields)
    .in("source", [...POOL_SOURCES])
    .or(POOL_TRUST_OR);
  q = applyUnder12PoolAgeMonthsSqlFilter(q, ageMonthsForPool);
  q = q.order("created_at", { ascending: false }).limit(limitCandidates);

  if (excludeRecipeIds.length > 0 && excludeRecipeIds.length < 50) {
    const idsList = excludeRecipeIds.join(",");
    q = q.not("id", "in", `(${idsList})`);
  }

  const { data: rows, error } = await q;

  if (error) {
    if (isDebugPool()) {
      console.warn("[DEBUG] pool query error:", error);
      console.log("[POOL DEBUG]", {
        mealType,
        memberId,
        candidatesFromDb: 0,
        afterFiltersCount: 0,
        pickedSource: "ai",
        pickedRecipeId: null,
        rejectReason: "query_error",
      });
    }
    return null;
  }

  const rawCandidates = (rows ?? []) as RecipeRow[];
  const candidatesFromDb = rawCandidates.length;

  const filtered = filterPoolCandidatesForSlot(rawCandidates, {
    slotNorm,
    memberData,
    excludeRecipeIds,
    excludeTitleKeys,
    infantSlotRole: infantSlotRole ?? null,
  });

  const candidatesAfterMealType = filtered.length;

  if (filtered.length === 0) {
    if (isDebugPool()) {
      console.log("[POOL DEBUG]", {
        mealType,
        memberId,
        candidatesFromDb,
        candidatesAfterMealType,
        afterFiltersCount: 0,
        pickedSource: "ai",
        pickedRecipeId: null,
        rejectReason: candidatesFromDb === 0 ? "no_candidates" : "all_filtered_out",
      });
    }
    return null;
  }

  const rankSalt = buildAlignedRankSalt({
    kind: "pool",
    userId,
    mealType,
    dayKey: plannedDayKey,
    variant: rankVariant,
  });
  const ranked = pickFromPoolRankingLite(filtered as PoolRankLiteRow[], {
    rankSalt,
    getSlotFit: (row) =>
      computeSlotFitForPoolRow(row as PoolRecipeRow, {
        slotNorm,
        memberData,
        infantSlotRole: infantSlotRole ?? null,
        usedKeyIngredientCounts: usedKeyIngredientCounts ?? null,
        usedKeyIngredientCountsByMealType: usedKeyIngredientCountsByMealType ?? null,
      }),
  });
  if (!ranked) {
    if (isDebugPool()) {
      console.log("[POOL DEBUG]", {
        mealType,
        memberId,
        candidatesFromDb,
        candidatesAfterMealType,
        afterFiltersCount: filtered.length,
        pickedSource: "db",
        pickedRecipeId: null,
        rejectReason: "all_blocked_trust",
      });
    }
    return null;
  }
  const picked = ranked.row as PoolRecipeRow;

  if (isDebugPool()) {
    console.log("[POOL DEBUG]", {
      mealType,
      memberId,
      candidatesFromDb,
      candidatesAfterMealType,
      afterFiltersCount: filtered.length,
      pickedSource: "db",
      pickedRecipeId: picked.id,
      rejectReason: undefined,
      pool_rank_lite: ranked.debug,
    });
  }

  const introducedKeysForNovel = Array.isArray(memberData?.introduced_product_keys)
    ? memberData.introduced_product_keys.filter((k): k is string => Boolean(k))
    : [];
  const firstNovelProductKey = computeFirstNovelProductKeyForPoolRow(picked, introducedKeysForNovel);

  if (usedKeyIngredientCounts != null) {
    const sig = deriveKeyIngredientSignals(picked);
    addKeyIngredientKeysToCounts(
      sig.keys,
      usedKeyIngredientCounts,
      mealType,
      usedKeyIngredientCountsByMealType,
    );
  }

  return { id: picked.id, title: picked.title, firstNovelProductKey };
}

type PickArgsWithoutInfantSlot = Omit<PickRecipeFromPoolArgs, "mealType" | "infantSlotRole">;

/**
 * Прикорм: блок «Сегодня можно попробовать».
 * `mealType` в вызове пула — нейтральный `snack` (только для filterSlot); роль задаёт `infantSlotRole`.
 * Рецепты берутся из всего infant-пула (валидный `recipe.meal_type`), без подмножества breakfast-only / lunch-only по слоту плана.
 */
export async function pickInfantNewRecipe(args: PickArgsWithoutInfantSlot): Promise<PickRecipeFromPoolResult | null> {
  return pickRecipeFromPool({
    ...args,
    mealType: "snack",
    infantSlotRole: "primary",
    rankVariant: args.rankVariant ?? "infant_primary",
  });
}

/** Прикорм: блок «Уже знакомое» — только введённые продукты; пул не ограничен lunch-only в БД. */
export async function pickInfantFamiliarRecipe(args: PickArgsWithoutInfantSlot): Promise<PickRecipeFromPoolResult | null> {
  return pickRecipeFromPool({
    ...args,
    mealType: "snack",
    infantSlotRole: "secondary",
    rankVariant: args.rankVariant ?? "infant_secondary",
  });
}

type ListInfantCandidatesArgs = Omit<ListFilteredPoolRecipesArgs, "mealType" | "infantSlotRole">;

export async function listInfantNewRecipeCandidates(args: ListInfantCandidatesArgs): Promise<PoolRecipeRow[]> {
  return listFilteredPoolRecipesForPlanSlot({
    ...args,
    mealType: "snack",
    infantSlotRole: "primary",
  });
}

export async function listInfantFamiliarRecipeCandidates(args: ListInfantCandidatesArgs): Promise<PoolRecipeRow[]> {
  return listFilteredPoolRecipesForPlanSlot({
    ...args,
    mealType: "snack",
    infantSlotRole: "secondary",
  });
}
