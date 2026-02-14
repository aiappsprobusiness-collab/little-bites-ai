/**
 * Pool-first v1: подбор рецептов из пула (seed, manual, week_ai) для Premium weekly генерации.
 * Используется ТОЛЬКО при генерации недельного плана по кнопке «Улучшить с AI».
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const IS_DEV = import.meta.env.DEV;

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

/** Проверка: haystack содержит хотя бы один токен из tokens. */
export function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = (haystack ?? "").toLowerCase();
  for (const t of tokens) {
    if (t.length >= 2 && h.includes(t)) return true;
  }
  return false;
}

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export interface MemberDataForPool {
  allergies?: string | string[];
  preferences?: string | string[];
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

/** Извлечь токены аллергенов из allergies (строка или массив). */
function getAllergyTokens(memberData: MemberDataForPool | null | undefined): string[] {
  if (!memberData?.allergies) return [];
  const raw = memberData.allergies;
  const arr = Array.isArray(raw) ? raw : [String(raw ?? "")];
  const tokens = new Set<string>();
  for (const a of arr) {
    for (const t of tokenize(String(a))) {
      if (t.length >= 2) tokens.add(t);
    }
  }
  return [...tokens];
}

/** Извлечь токены предпочтений "не любит X", "без X" из preferences. */
function getPreferenceExcludeTokens(memberData: MemberDataForPool | null | undefined): string[] {
  const prefs = memberData?.preferences;
  if (!prefs) return [];
  const str = Array.isArray(prefs) ? prefs.join(" ") : String(prefs);
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

/** Токены для возраста < 3: остро, кофе, грибы. */
const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];

/** Фильтрация кандидата по профилю (аллергии, предпочтения, возраст). */
function passesProfileFilter(
  recipe: RecipeRow,
  memberData: MemberDataForPool | null | undefined
): { pass: boolean; reason?: string } {
  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, allergyTokens)) {
      if (IS_DEV) console.log("[DEBUG] pool filter: allergy hit", { title: recipe.title, tokens: allergyTokens });
      return { pass: false, reason: "allergy" };
    }
  }

  const prefTokens = getPreferenceExcludeTokens(memberData);
  if (prefTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, prefTokens)) {
      if (IS_DEV) console.log("[DEBUG] pool filter: preference hit", { title: recipe.title, tokens: prefTokens });
      return { pass: false, reason: "preference" };
    }
  }

  const ageMonths = memberData?.age_months ?? (memberData?.age_years != null ? memberData.age_years * 12 : null);
  if (ageMonths != null && ageMonths < 36) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, AGE_RESTRICTED_TOKENS)) {
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

  let q = supabase
    .from("recipes")
    .select("id, title, tags, description, cooking_time_minutes, source, meal_type")
    .eq("user_id", userId)
    .in("source", ["seed", "manual", "week_ai"])
    .order("created_at", { ascending: false })
    .limit(limitCandidates);

  q = q.or(`meal_type.eq.${mealType},meal_type.is.null`);

  if (memberId == null) {
    q = q.is("member_id", null);
  } else {
    q = q.or(`member_id.eq.${memberId},member_id.is.null`);
  }

  if (excludeRecipeIds.length > 0 && excludeRecipeIds.length < 50) {
    const idsList = excludeRecipeIds.join(",");
    q = q.not("id", "in", `(${idsList})`);
  }

  const { data: rows, error } = await q;

  if (error) {
    if (IS_DEV) console.warn("[DEBUG] pool query error:", error);
    return null;
  }

  const rawCandidates = (rows ?? []) as RecipeRow[];
  let filtered = rawCandidates;

  if (excludeRecipeIds.length >= 50 || excludeSet.size > 0) {
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }

  filtered = filtered.filter((r) => {
    const key = normalizeTitleKey(r.title);
    return !excludeTitleSet.has(key);
  });

  filtered = filtered.filter((r) => {
    if (r.meal_type) return r.meal_type === mealType;
    const tags = (r.tags ?? []) as string[];
    return tags.some((t) => t === `chat_${mealType}` || t === mealType);
  });

  for (const r of filtered) {
    const { pass } = passesProfileFilter(r, memberData);
    if (!pass) filtered = filtered.filter((x) => x.id !== r.id);
  }
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData).pass);

  if (IS_DEV) {
    console.log(
      "[DEBUG] pool candidates meal=%s raw=%s filtered=%s",
      mealType,
      rawCandidates.length,
      filtered.length
    );
  }

  if (filtered.length === 0) return null;

  const topN = Math.min(15, filtered.length);
  const fromTop = filtered.slice(0, topN);
  const idx = Math.floor(Math.random() * fromTop.length);
  const picked = fromTop[idx];
  return { id: picked.id, title: picked.title };
}
