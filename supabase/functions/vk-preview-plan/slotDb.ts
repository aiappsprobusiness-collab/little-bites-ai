/**
 * DB-first slot filling for VK preview (curated pool only).
 * Reuses allergy/dislike filters from generate-plan preferenceRules.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  passesPreferenceFilters,
  countMatchedPreferenceTokens,
  buildRecipePreferenceText,
} from "../generate-plan/preferenceRules.ts";
import { getMemberAgeContext, isAdultContext } from "../_shared/memberAgeContext.ts";
import { normalizeNutritionGoalsFromDb } from "../_shared/recipeGoals.ts";
import type { MealSlot, MemberDataPool, RecipeRowPool, VkPreviewMeal } from "./types.ts";

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

function normalizeMealType(value: string | null | undefined): NormalizedMealType | null {
  if (value == null || typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? null;
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

const DISH_CATEGORY_TOKENS = [
  { token: "каша", key: "porridge" },
  { token: "овсян", key: "porridge" },
  { token: "гречн", key: "porridge" },
  { token: "суп", key: "soup" },
  { token: "борщ", key: "soup" },
  { token: "щи", key: "soup" },
  { token: "солянк", key: "soup" },
  { token: "рассольник", key: "soup" },
  { token: "окрошк", key: "soup" },
  { token: "гаспачо", key: "soup" },
];

function inferDishCategoryKey(title: string | null | undefined): string {
  const text = (title ?? "").toLowerCase();
  if (!text.trim()) return "other";
  for (const { token, key } of DISH_CATEGORY_TOKENS) {
    if (text.includes(token)) return key;
  }
  return "other";
}

function getResolvedMealType(r: RecipeRowPool): NormalizedMealType | null {
  const raw = normalizeMealType(r.meal_type);
  if (raw != null) return raw;
  const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
  return inferMealTypeFromTitle(r.title, r.description, ing);
}

const SANITY_BREAKFAST = ["суп", "борщ", "рагу", "плов"];
const SANITY_LUNCH = ["сырник", "оладь", "каша", "гранола", "тост"];
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

const AGE_RESTRICTED = ["острый", "кофе", "гриб"];
const INFANT_FORBIDDEN_12 = ["свинина", "говядина", "стейк", "жарен", "копчен", "колбас"];
const TODDLER_UNDER_24_FORBIDDEN = ["стейк", "жарен", "копчен", "колбас", "бекон", "отбивн"];

function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = haystack.toLowerCase();
  return tokens.some((t) => t.length >= 2 && h.includes(t));
}

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

function normalizeTitleKey(title: string): string {
  return (title ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function recipeTitleDedupeKey(r: { norm_title?: string | null; title?: string | null }): string {
  const raw = (r.norm_title?.trim() || r.title || "").trim();
  return normalizeTitleKey(raw);
}

function likeBoostScore(r: RecipeRowPool, likes: string[]): number {
  if (!likes.length) return 0;
  const text = buildRecipePreferenceText(r, true);
  const tokens = likes.flatMap((x) => x.trim().toLowerCase().split(/\s+/)).filter((t) => t.length >= 3);
  if (!tokens.length) return 0;
  return countMatchedPreferenceTokens(text, tokens);
}

const POOL_SELECT_FIELDS =
  "id, title, norm_title, description, source, meal_type, is_soup, min_age_months, max_age_months, calories, proteins, fats, carbs, nutrition_goals, score, trust_level, recipe_ingredients(name, display_text, category)";
const POOL_TRUST_OR = "trust_level.is.null,trust_level.neq.blocked";
const POOL_SEED_CATALOG_FETCH_LIMIT = 600;

export async function fetchVkPreviewPool(
  supabase: SupabaseClient,
  opts: { infantSeedCoreOnly?: boolean },
): Promise<RecipeRowPool[]> {
  if (opts.infantSeedCoreOnly) {
    const { data, error } = await supabase
      .from("recipes")
      .select(POOL_SELECT_FIELDS)
      .eq("source", "seed")
      .eq("trust_level", "core")
      .order("score", { ascending: false })
      .limit(POOL_SEED_CATALOG_FETCH_LIMIT);
    if (error) return [];
    return (data ?? []) as RecipeRowPool[];
  }
  const { data, error } = await supabase
    .from("recipes")
    .select(POOL_SELECT_FIELDS)
    .in("source", ["seed", "starter"])
    .or(POOL_TRUST_OR)
    .order("score", { ascending: false })
    .limit(POOL_SEED_CATALOG_FETCH_LIMIT);
  if (error) return [];
  return (data ?? []) as RecipeRowPool[];
}

/** UI order: breakfast, lunch, dinner, snack — map to internal pick order. */
const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function mapSlotToNormalized(slot: MealSlot): NormalizedMealType {
  if (slot === "dinner") return "dinner";
  if (slot === "snack") return "snack";
  return slot;
}

export function pickDbSlots(
  pool: RecipeRowPool[],
  memberData: MemberDataPool,
): { meals: Partial<Record<MealSlot, VkPreviewMeal>>; filledCount: number } {
  const memberWithType: MemberDataPool = { ...memberData, type: memberData.type ?? "child" };
  const usedIds = new Set<string>();
  const usedTitleKeys = new Set<string>();
  const meals: Partial<Record<MealSlot, VkPreviewMeal>> = {};
  for (const slot of SLOT_ORDER) {
    const normSlot = mapSlotToNormalized(slot);
    const ageContext = getMemberAgeContext(memberWithType);
    let candidates = pool.filter((r) => !usedIds.has(r.id));
    candidates = candidates.filter((r) => !usedTitleKeys.has(recipeTitleDedupeKey(r)));
    if (ageContext.applyFilter && ageContext.ageMonths != null) {
      const am = ageContext.ageMonths;
      candidates = candidates.filter((r) => recipeFitsAgeRange(r, am));
      candidates = candidates.filter((r) => !recipeBlockedByInfantKeywords(r, am));
    }
    if (isAdultContext(memberWithType)) {
      candidates = candidates.filter((r) => r.max_age_months == null || r.max_age_months > 12);
    }
    candidates = candidates.filter((r) => {
      const resolved = getResolvedMealType(r);
      return resolved != null && resolved === normSlot;
    });
    if (normSlot === "lunch") {
      candidates = candidates.filter(
        (r) => r.is_soup === true || inferDishCategoryKey(r.title) === "soup",
      );
    }
    candidates = candidates.filter((r) => passesProfileFilter(r, memberWithType));
    candidates = candidates.filter((r) => {
      const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
      return slotSanityCheck(normSlot, [r.title ?? "", r.description ?? "", ing].join(" "));
    });
    const likes = memberWithType.likes ?? [];
    candidates.sort((a, b) => {
      const lb = likeBoostScore(b, likes);
      const la = likeBoostScore(a, likes);
      if (lb !== la) return lb - la;
      const sb = Number(b.score ?? 0);
      const sa = Number(a.score ?? 0);
      return sb - sa;
    });
    const pick = candidates[0];
    if (!pick) continue;
    usedIds.add(pick.id);
    usedTitleKeys.add(recipeTitleDedupeKey(pick));
    const desc = (pick.description ?? "").trim() || undefined;
    const cal = pick.calories != null ? Number(pick.calories) : undefined;
    const protein = pick.proteins != null ? Number(pick.proteins) : undefined;
    const fat = pick.fats != null ? Number(pick.fats) : undefined;
    const carbs = pick.carbs != null ? Number(pick.carbs) : undefined;
    const goals = normalizeNutritionGoalsFromDb(pick.nutrition_goals);
    meals[slot] = {
      type: slot,
      title: (pick.title ?? "Блюдо").trim(),
      ...(desc ? { description: desc.slice(0, 500) } : {}),
      ...(Number.isFinite(cal) ? { calories: Math.round(cal!) } : {}),
      ...(Number.isFinite(protein) ? { protein: Math.round(protein!) } : {}),
      ...(Number.isFinite(fat) ? { fat: Math.round(fat!) } : {}),
      ...(Number.isFinite(carbs) ? { carbs: Math.round(carbs!) } : {}),
      ...(goals.length ? { nutrition_goals: [...goals] } : {}),
    };
  }

  const filledCount = SLOT_ORDER.filter((s) => meals[s] != null).length;
  return { meals, filledCount };
}
