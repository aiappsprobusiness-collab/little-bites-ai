/**
 * Pool-first v1: подбор рецептов из пула (seed, manual, week_ai) для Premium weekly генерации.
 * Используется при подборе рецептов по кнопке «Подобрать рецепты».
 * Токены аллергенов — из allergenTokens (в унисон с Edge _shared/allergens).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBlockedTokens, containsAnyToken } from "@/utils/allergenTokens";

const IS_DEV = import.meta.env.DEV;

/** [POOL DEBUG] логи только при ?debugPool=1 (не спамим в проде). */
function isDebugPool(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugPool") === "1";
}

/** Нормализованный ключ названия для сравнения и исключения дублей. */
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
  age_months?: number;
  age_years?: number;
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
}

type RecipeRow = {
  id: string;
  title: string;
  tags: string[] | null;
  description: string | null;
  cooking_time_minutes: number | null;
  source?: string | null;
  meal_type?: string | null;
};

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

/** Токены для возраста < 3: остро, кофе, грибы. */
const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];

/** Фильтрация кандидата по профилю (аллергии, предпочтения, возраст). */
export function passesProfileFilter(
  recipe: { title?: string | null; description?: string | null; tags?: string[] | null },
  memberData: MemberDataForPool | null | undefined
): { pass: boolean; reason?: string } {
  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ").toLowerCase();
    if (containsAnyToken(text, allergyTokens).hit) {
      if (IS_DEV) console.log("[DEBUG] pool filter: allergy hit", { title: recipe.title, tokens: allergyTokens });
      return { pass: false, reason: "allergy" };
    }
  }

  const dislikeTokens = getDislikeTokens(memberData);
  if (dislikeTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, dislikeTokens).hit) {
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

/** Выбрать рецепт из пула по слоту приёма пищи. */
export async function pickRecipeFromPool(
  args: PickRecipeFromPoolArgs
): Promise<{ id: string; title: string } | null> {
  const {
    supabase,
    userId,
    memberId,
    mealType,
    memberData,
    excludeRecipeIds,
    excludeTitleKeys,
    limitCandidates = 60,
  } = args;

  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));

  const slotNorm = normalizeMealType(mealType) ?? (mealType as MealType);

  let q = supabase
    .from("recipes")
    .select("id, title, tags, description, cooking_time_minutes, source, meal_type")
    .in("source", ["seed", "manual", "week_ai", "chat_ai"])
    .order("created_at", { ascending: false })
    .limit(limitCandidates);

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
  let filtered = rawCandidates;

  if (excludeRecipeIds.length >= 50 || excludeSet.size > 0) {
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }

  filtered = filtered.filter((r) => {
    const key = normalizeTitleKey(r.title);
    return !excludeTitleSet.has(key);
  });

  filtered = filtered.filter((r) => {
    const recNorm = normalizeMealType(r.meal_type);
    return recNorm !== null && recNorm === slotNorm;
  });
  const candidatesAfterMealType = filtered.length;

  if (slotNorm === "breakfast") {
    filtered = filtered.filter((r) => !isSoupLikeTitle(r.title));
  }

  filtered = filtered.filter((r) => getSanityBlockedReasons(r.title, slotNorm).length === 0);

  for (const r of filtered) {
    const { pass } = passesProfileFilter(r, memberData);
    if (!pass) filtered = filtered.filter((x) => x.id !== r.id);
  }
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData).pass);

  const afterFiltersCount = filtered.length;

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

  const topN = Math.min(15, filtered.length);
  const fromTop = filtered.slice(0, topN);
  const idx = Math.floor(Math.random() * fromTop.length);
  const picked = fromTop[idx];

  if (isDebugPool()) {
    console.log("[POOL DEBUG]", {
      mealType,
      memberId,
      candidatesFromDb,
      candidatesAfterMealType,
      afterFiltersCount,
      pickedSource: "db",
      pickedRecipeId: picked.id,
      rejectReason: undefined,
    });
  }

  return { id: picked.id, title: picked.title };
}
