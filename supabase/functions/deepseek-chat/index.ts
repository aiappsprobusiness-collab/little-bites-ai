/**
 * deepseek-chat: recipe latency & PERF.
 *
 * PERF (было → стало):
 * - Было: llm_call ~300ms (только TTFB), parse_response ~23s (фактически чтение тела).
 * - Стало: llm_ttfb (до первого байта), llm_body (чтение тела до конца, с response_chars), llm_total = ttfb + body.
 *
 * Ручной чек-лист:
 * - 5 раз подряд premium: первый символ ответа ≤ 2s (stream даёт быстрый TTFB).
 * - total_ms может быть 12–25s, но UX быстрый за счёт stream.
 * - ingredients_retry не вызывается при RECIPE_INGREDIENTS_RETRY_ENABLED=false (по умолчанию).
 * - PERF показывает llm_ttfb, llm_body, llm_total.
 * - recipe_id сохраняется при авторизации, 401 при отсутствии authHeader.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRelevantQuery, isRelevantPremiumQuery } from "./isRelevantQuery.ts";
import {
  SAFETY_RULES,
  AGE_CONTEXTS,
  FREE_RECIPE_TEMPLATE,
  PREMIUM_RECIPE_TEMPLATE,
  SINGLE_DAY_PLAN_TEMPLATE,
  SOS_PROMPT_TEMPLATE,
  BALANCE_CHECK_TEMPLATE,
  NO_ARTICLES_RULE,
  GREETING_STYLE_RULE,
  FAMILY_RECIPE_INSTRUCTION,
} from "./prompts.ts";
import { getAgeCategory, getAgeCategoryRules } from "./ageCategory.ts";
import { buildPromptByProfileAndTariff } from "./promptByTariff.ts";
import { safeLog, safeError, safeWarn } from "../_shared/safeLogger.ts";
import { canonicalizeRecipePayload } from "../_shared/recipeCanonical.ts";
import { buildBlockedTokenSet, findMatchedTokens, textWithoutExclusionPhrases } from "../_shared/blockedTokens.ts";
import { validateRecipeJson, parseAndValidateRecipeJsonFromString, getRecipeOrFallback, getLastValidationError, ingredientsNeedAmountRetry, applyIngredientsFallbackHeuristic, type RecipeJson } from "./recipeSchema.ts";
import { isExplicitDishRequest, inferMealTypeFromQuery } from "../_shared/mealType/inferMealType.ts";
import { validateRecipe, retryFixJson } from "../_shared/parsing/index.ts";
import { buildRecipeDescription, buildChefAdvice, shouldReplaceDescription, shouldReplaceChefAdvice } from "../_shared/recipeCopy.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const RECIPE_SLOW_MS = 20000;
const RECIPE_MAX_TOKENS = 2048;

const AGE_RANGE_BY_CATEGORY: Record<string, { min: number; max: number }> = {
  infant: { min: 6, max: 12 },
  toddler: { min: 12, max: 60 },
  school: { min: 60, max: 216 },
  adult: { min: 216, max: 1200 },
};

function logPerf(step: string, start: number, requestId?: string, extra?: Record<string, number>): void {
  const obj: Record<string, unknown> = {
    tag: "PERF",
    step,
    ms: Date.now() - start,
    requestId: requestId ?? undefined,
  };
  if (extra) Object.assign(obj, extra);
  console.log(JSON.stringify(obj));
}

const DESCRIPTION_INCOMPLETE_SUFFIXES = [/\sи\s*$/i, /\sили\s*$/i, /\sа также\s*$/i, /[—:]\s*$/];
function isDescriptionIncomplete(desc: string | null | undefined): boolean {
  if (!desc || typeof desc !== "string") return false;
  const t = desc.trim();
  if (t.length < 20) return true;
  if (/\.\.\.\s*$/.test(t)) return true;
  if (DESCRIPTION_INCOMPLETE_SUFFIXES.some((re) => re.test(t))) return true;
  return false;
}

/** Cheap repair: one short LLM call to fix only description. Returns new description or null. */
async function repairDescriptionOnly(current: string, apiKey: string): Promise<string | null> {
  const sys = "Ты исправляешь только поле description. Верни ТОЛЬКО валидный JSON: {\"description\": \"...\"}. 2–4 полных предложения, без обрыва, без троеточий.";
  const user = `Текущее описание (обрывается): «${current.slice(0, 300)}». Допиши до 2–4 законченных предложений.`;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 256,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const match = raw.match(/\{\s*"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/) || raw.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (match && match[1]) {
      return match[1].replace(/\\"/g, '"').slice(0, 500);
    }
    return null;
  } catch {
    return null;
  }
}

/** Fail-safe: strip personal references from description/chefAdvice so recipe is reusable in pool. */
function sanitizeRecipeText(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  const forbiddenPatterns = [
    /your child/gi,
    /your baby/gi,
    /your toddler/gi,
    /for your child/gi,
    /for your baby/gi,
    /for this child/gi,
    /\d+\s*(month|months|year|years)\s*(old)?/gi,
    /toddler/gi,
    /baby/gi,
    /\bchild\b/gi,
    /for children/gi,
    /для ребёнка/gi,
    /для ребенка/gi,
    /для малыша/gi,
    /для детей/gi,
    /\d+\s*(мес|месяц|месяцев|год|года|лет)\s*(\.|,|$)/gi,
    /с аллергией\s+на/gi,
    /аллергией на/gi,
    // Упоминания «готовится без X» / «без X и Y» — особенности профиля (аллергии/dislikes), рецепт не должен попадать в пул с этим.
    /готовится без[^.!?]*[.!?]?/gi,
    /приготовлено без[^.!?]*[.!?]?/gi,
    /,?\s*без\s+[а-яё]+\s+и\s+[а-яё]+[^.!?]*[.!?]?/gi,
  ];
  let result = text;
  for (const pattern of forbiddenPatterns) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/** Fail-safe: strip meal/time mentions so description/chefAdvice are reusable for any meal tag. */
function sanitizeMealMentions(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  const patterns = [
    /breakfast/gi,
    /lunch/gi,
    /dinner/gi,
    /snack/gi,
    /morning/gi,
    /evening/gi,
    /на завтрак/gi,
    /на обед/gi,
    /на ужин/gi,
    /на перекус/gi,
    /для завтрака/gi,
    /для перекуса/gi,
    /для обеда/gi,
    /для ужина/gi,
  ];
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/** Минимальный валидный рецепт для fallback при таймауте или когда провайдер тормозит. */
function getMinimalRecipe(mealType: string): RecipeJson {
  const mt = ["breakfast", "lunch", "snack", "dinner"].includes(mealType) ? mealType : "snack";
  return {
    title: "Простой рецепт",
    description: "Быстрый вариант. Попробуйте запрос ещё раз для полного рецепта.",
    ingredients: [
      { name: "Ингредиент 1", amount: "100 г", displayText: "Ингредиент 1 — 100 г", canonical: { amount: 100, unit: "g" } },
      { name: "Ингредиент 2", amount: "2 шт.", displayText: "Ингредиент 2 — 2 шт.", canonical: { amount: 2, unit: "g" } },
      { name: "Ингредиент 3", amount: "1 ст.л.", displayText: "Ингредиент 3 — 1 ст.л.", canonical: { amount: 1, unit: "ml" } },
    ],
    steps: ["Подготовьте ингредиенты.", "Смешайте и готовьте по инструкции.", "Подавайте."],
    cookingTimeMinutes: 15,
    mealType: mt as "breakfast" | "lunch" | "snack" | "dinner",
    servings: 1,
    chefAdvice: null,
  };
}

/** Единый формат ответа «заблокировано» (аллергия или dislikes). Не вызываем модель, не пишем usage_events. */
type BlockedBy = "allergy" | "dislike";

const BLOCKED_ALTERNATIVES: Record<string, string[]> = {
  куриц: ["индейка", "говядина", "рыба"],
  курица: ["индейка", "говядина", "рыба"],
  chicken: ["индейка", "говядина", "рыба"],
  молок: ["овощной бульон", "вода", "кокосовое молоко"],
  молоко: ["овощной бульон", "вода", "кокосовое молоко"],
  орех: ["семечки", "кунжут", "подсолнечник"],
  орехи: ["семечки", "кунжут", "подсолнечник"],
  лук: ["чеснок", "зелень", "сладкий перец"],
  лука: ["чеснок", "зелень", "сладкий перец"],
  яйц: ["льняная мука", "банан", "йогурт"],
  рыб: ["индейка", "курица", "тофу"],
  глютен: ["рис", "гречка", "киноа"],
  мясо: ["индейка", "рыба", "бобовые"],
  ягод: ["фрукты", "банан", "яблоко"],
  ягоды: ["фрукты", "банан", "яблоко"],
  berry: ["фрукты", "банан", "яблоко"],
  berries: ["фрукты", "банан", "яблоко"],
};

function getSuggestedAlternatives(matchedDisplay: string[]): string[] {
  const lower = matchedDisplay.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  for (const m of lower) {
    for (const [key, alts] of Object.entries(BLOCKED_ALTERNATIVES)) {
      if (m.includes(key) || key.includes(m)) return alts.slice(0, 3);
    }
  }
  return ["другие ингредиенты на ваш выбор"];
}

/** Вытаскивает «блюдо» из запроса: последнее слово или фраза без стопа (для подсказки follow-up). */
function extractIntendedDishHint(originalQuery: string, blockedItem: string): string {
  const q = (originalQuery ?? "").trim();
  if (!q) return "";
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const blockedLower = (blockedItem ?? "").toLowerCase();
  const withoutBlocked = words.filter((w) => !w.toLowerCase().includes(blockedLower) && blockedLower !== w.toLowerCase());
  if (withoutBlocked.length > 0) return withoutBlocked.join(" ");
  return words.length > 0 ? words[words.length - 1]! : q;
}

function buildBlockedMessageEdge(
  profileName: string,
  blockedBy: BlockedBy,
  matchedDisplay: string[],
  suggestedAlternatives: string[],
  intendedDishHint: string
): string {
  const items = matchedDisplay.length > 0 ? matchedDisplay.join(", ") : "это";
  let line1: string;
  if (blockedBy === "allergy") {
    line1 = `У профиля «${profileName}» указана аллергия на: ${items}. Смените профиль или замените аллерген на новый ингредиент.`;
  } else {
    line1 = `Профиль «${profileName}» не любит: ${items}. Смените профиль или замените аллерген на новый ингредиент.`;
  }
  const firstAlt = suggestedAlternatives[0] ?? "банан";
  const dishWord = intendedDishHint || "десерт";
  const line2 = `Напишите: «вариант с ${firstAlt}» или просто «${firstAlt}» — и я предложу тот же ${dishWord} без ${items}.`;
  return `${line1}\n\n${line2}`;
}

/** Нормализация title для сравнения (anti-duplicate). Та же логика, что в pool/diag. */
function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Последние N titleKey из chat_history по (user_id + memberId или family) за 14 дней для anti-duplicate. */
async function fetchRecentTitleKeys(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  memberId: string | null,
  targetIsFamily: boolean
): Promise<string[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString();
    let q = supabase
      .from("chat_history")
      .select("recipe_id")
      .eq("user_id", userId)
      .not("recipe_id", "is", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(50);
    if (targetIsFamily) {
      q = q.is("child_id", null);
    } else if (memberId) {
      q = q.eq("child_id", memberId);
    }
    const { data: rows } = await q;
    const recipeIds = (rows ?? []).map((r: { recipe_id?: string }) => r?.recipe_id).filter(Boolean) as string[];
    if (recipeIds.length === 0) return [];
    const { data: recipes } = await supabase.from("recipes").select("id, title").in("id", recipeIds);
    const seen = new Set<string>();
    const titleKeys: string[] = [];
    for (const r of recipes ?? []) {
      const t = (r as { title?: string }).title;
      if (t && typeof t === "string") {
        const key = normalizeTitleKey(t);
        if (key && !seen.has(key)) {
          seen.add(key);
          titleKeys.push(key);
        }
      }
    }
    return titleKeys.slice(0, 20);
  } catch {
    return [];
  }
}
const FREE_AI_DAILY_LIMIT = 2;

function getAiDailyLimitForStatus(isPremiumOrTrial: boolean): number | null {
  return isPremiumOrTrial ? null : FREE_AI_DAILY_LIMIT;
}

// ——— Кэш: префикс v_template_system, принудительно отключён ———
const CACHE_KEY_PREFIX = "v_template_system";

function getCacheKey(type: string, memberData?: MemberData | null, isPremium?: boolean): string {
  return `${CACHE_KEY_PREFIX}_${type}_${isPremium ? "premium" : "free"}_${JSON.stringify(memberData ?? {})}`;
}

function getCachedSystemPrompt(
  _type: string,
  _memberData?: MemberData | null,
  _isPremium?: boolean
): string | null {
  // const key = getCacheKey(type, memberData, isPremium);
  // const cached = systemPromptCache.get(key);
  // if (cached) return cached;  // временно закомментировано
  return null;
}

/** Возраст по birth_date (YYYY-MM-DD) или по ageMonths. */
function calculateAge(birthDate: string): { years: number; months: number } {
  const s = (birthDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { years: 0, months: 0 };
  const birth = new Date(s);
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

function formatAgeString(birthDate: string): string {
  const { years, months } = calculateAge(birthDate);
  const total = years * 12 + months;
  if (total === 0) return "";
  if (total < 12) return `${total} мес.`;
  if (months === 0) return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`;
  return `${years} г. ${months} мес.`;
}

interface MemberData {
  name?: string;
  birth_date?: string;
  age_months?: number;
  ageMonths?: number;
  ageDescription?: string;
  allergies?: string[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
  difficulty?: string;
}

function getCalculatedAge(memberData?: MemberData | null): string {
  if (!memberData) return "";
  if (memberData.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(memberData.birth_date.trim())) {
    return formatAgeString(memberData.birth_date);
  }
  if (memberData.ageDescription) return memberData.ageDescription;
  const m = memberData.age_months ?? memberData.ageMonths ?? 0;
  if (m < 12) return `${m} мес.`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `${y} г. ${rest} мес.` : `${y} ${y === 1 ? "год" : y < 5 ? "года" : "лет"}`;
}

/** Возвращает возраст в месяцах для MemberData. Проверяет ОБА варианта: age_months (snake) и ageMonths (camelCase от фронта). */
function getAgeMonths(member: MemberData): number {
  const m = member.age_months ?? member.ageMonths;
  if (m != null && typeof m === "number" && !Number.isNaN(m)) return Math.max(0, m);
  const s = (member.birth_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 999;
  const { years, months } = calculateAge(s);
  return years * 12 + months;
}

/** Нормализует объект из запроса: гарантирует наличие age_months и ageMonths (фронт может присылать только camelCase или число строкой). */
function normalizeMemberData(raw: MemberData | null | undefined): MemberData | null | undefined {
  if (raw == null) return raw;
  const months = raw.age_months ?? raw.ageMonths;
  let num: number | undefined;
  if (typeof months === "number" && !Number.isNaN(months)) num = Math.max(0, months);
  else if (typeof months === "string") {
    const parsed = parseInt(months, 10);
    num = !Number.isNaN(parsed) ? Math.max(0, parsed) : undefined;
  }
  return { ...raw, age_months: num, ageMonths: num };
}

/** В семейном режиме для правил возраста используем самого младшего члена семьи (inline, без отдельной функции). */
function findYoungestMember(members: MemberData[]): MemberData | null {
  if (members.length === 0) return null;
  return members.reduce((youngest, m) =>
    getAgeMonths(m) < getAgeMonths(youngest) ? m : youngest
    , members[0]);
}

/** Подставляет в шаблон переменные V2: {{ageRule}}, {{allergies}}, {{familyContext}}, {{ageMonths}}, {{weekContext}} и др. */
function applyPromptTemplate(
  template: string,
  memberData: MemberData | null | undefined,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  options?: { weekContext?: string; varietyRules?: string; userMessage?: string; generationContextBlock?: string; mealType?: string; maxCookingTime?: number; servings?: number; recentTitleKeysLine?: string }
): string {
  // Семья: для ageMonths используем самого младшего члена; иначе — выбранный Member
  const youngestMember = targetIsFamily && allMembers.length > 0 ? findYoungestMember(allMembers) : null;
  const primaryMember = youngestMember ?? memberData;

  const name = (primaryMember?.name ?? "").trim() || "член семьи";
  const targetProfile = targetIsFamily ? "Семья" : name;
  const age = getCalculatedAge(primaryMember) || "не указан";
  // ageMonths — число (месяцы) для правил безопасности; 999 → 0 при неизвестном
  const rawMonths = primaryMember ? getAgeMonths(primaryMember) : 0;
  const ageMonths = String(rawMonths === 999 ? 0 : rawMonths);

  // Семья: учитываем аллергии всех членов; выбранный Member — только его
  let allergiesSet = new Set<string>();
  if (targetIsFamily && allMembers.length > 0) {
    allMembers.forEach((m) => m.allergies?.forEach((a) => allergiesSet.add(a)));
  } else if (primaryMember?.allergies?.length) {
    primaryMember.allergies.forEach((a) => allergiesSet.add(a));
  }
  const allergies = allergiesSet.size > 0 ? Array.from(allergiesSet).join(", ") : "не указано";
  const allergiesExclude = allergiesSet.size > 0 ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : "";

  let preferencesSet = new Set<string>();
  const addPrefs = (m: MemberData) => {
    const likes = m.likes;
    const prefs = Array.isArray(likes) && likes.length > 0 ? likes : m.preferences;
    prefs?.forEach((p) => p?.trim() && preferencesSet.add(p.trim()));
  };
  if (targetIsFamily && allMembers.length > 0) {
    allMembers.forEach((m) => addPrefs(m as MemberData));
  } else if (primaryMember) {
    addPrefs(primaryMember as MemberData);
  }
  const preferencesText = preferencesSet.size > 0 ? Array.from(preferencesSet).join(", ") : "не указано";
  const primaryDifficulty = (primaryMember as MemberData)?.difficulty?.trim();
  const difficultyText = primaryDifficulty === "easy" ? "Простые" : primaryDifficulty === "medium" ? "Средние" : primaryDifficulty === "any" ? "Любые" : "не указано";

  const ageCategory = getAgeCategory(rawMonths === 999 ? 0 : rawMonths);
  const ageRule = ageCategory in AGE_CONTEXTS ? AGE_CONTEXTS[ageCategory as keyof typeof AGE_CONTEXTS] : AGE_CONTEXTS.adult;
  const weekContext = options?.weekContext?.trim() || "";
  const varietyRules = options?.varietyRules?.trim() || "";
  const userMessage = options?.userMessage?.trim() || "";
  const generationContextBlock = options?.generationContextBlock?.trim() || "";
  const mealType = options?.mealType?.trim() || "";
  const maxCookingTime = options?.maxCookingTime != null && Number.isFinite(options.maxCookingTime) ? String(options.maxCookingTime) : "";
  const servings = options?.servings != null && options.servings >= 1 ? String(options.servings) : "1";
  const recentTitleKeysLine = options?.recentTitleKeysLine?.trim() || "";

  const ADULT_AGE_MONTHS = 336; // 28+ лет — взрослое меню
  let familyContext = `Профиль: ${name}`;
  if (targetIsFamily && allMembers.length > 0) {
    const adults = allMembers.filter((m) => getAgeMonths(m) >= ADULT_AGE_MONTHS);
    const children = allMembers.filter((m) => getAgeMonths(m) < ADULT_AGE_MONTHS);
    const adultNames = adults.map((m) => m.name || "взрослый").join(", ");
    const childInfo = children
      .map((m) => `${m.name || "ребёнок"} (${getCalculatedAge(m) || getAgeMonths(m) + " мес."})`)
      .join(", ");
    const parts: string[] = [];
    if (adultNames) {
      parts.push(`Меню для взрослых (Adult Menu): ${adultNames}. Для взрослых ТОЛЬКО взрослые блюда — НЕ предлагай детские каши на воде, пюре, прикормовые блюда.`);
    }
    if (childInfo) {
      parts.push(`Прикорм/меню для ребёнка (Infant/Toddler Menu): ${childInfo}.`);
    }
    familyContext = parts.length > 0 ? parts.join(" ") : `Готовим для всей семьи: ${allMembers.map((m) => `${m.name || "член семьи"} (${getCalculatedAge(m)})`).join(", ")}`;
  } else if (targetIsFamily) {
    familyContext = `Готовим для всей семьи (${name}, ${age})`;
  }

  let out = template
    .split("{{name}}").join(name)
    .split("{{target_profile}}").join(targetProfile)
    .split("{{age}}").join(age)
    .split("{{ageMonths}}").join(ageMonths)
    .split("{{ageRule}}").join(ageRule)
    .split("{{allergies}}").join(allergies)
    .split("{{allergiesExclude}}").join(allergiesExclude)
    .split("{{preferences}}").join(preferencesText)
    .split("{{difficulty}}").join(difficultyText)
    .split("{{generationContextBlock}}").join(generationContextBlock)
    .split("{{weekContext}}").join(weekContext)
    .split("{{varietyRules}}").join(varietyRules)
    .split("{{familyContext}}").join(familyContext)
    .split("{{userMessage}}").join(userMessage)
    .split("{{mealType}}").join(mealType)
    .split("{{maxCookingTime}}").join(maxCookingTime)
    .split("{{servings}}").join(servings)
    .split("{{recentTitleKeysLine}}").join(recentTitleKeysLine);

  if (out.includes("{{")) {
    const replacers: [RegExp, string][] = [
      [/\{\{\s*name\s*\}\}/g, name],
      [/\{\{\s*target_profile\s*\}\}/g, targetProfile],
      [/\{\{\s*age\s*\}\}/g, age],
      [/\{\{\s*ageMonths\s*\}\}/g, ageMonths],
      [/\{\{\s*ageRule\s*\}\}/g, ageRule],
      [/\{\{\s*allergies\s*\}\}/g, allergies],
      [/\{\{\s*allergiesExclude\s*\}\}/g, allergiesExclude],
      [/\{\{\s*preferences\s*\}\}/g, preferencesText],
      [/\{\{\s*difficulty\s*\}\}/g, difficultyText],
      [/\{\{\s*generationContextBlock\s*\}\}/g, generationContextBlock],
      [/\{\{\s*weekContext\s*\}\}/g, weekContext],
      [/\{\{\s*varietyRules\s*\}\}/g, varietyRules],
      [/\{\{\s*familyContext\s*\}\}/g, familyContext],
      [/\{\{\s*userMessage\s*\}\}/g, userMessage],
      [/\{\{\s*mealType\s*\}\}/g, mealType],
      [/\{\{\s*maxCookingTime\s*\}\}/g, maxCookingTime],
      [/\{\{\s*servings\s*\}\}/g, servings],
      [/\{\{\s*recentTitleKeysLine\s*\}\}/g, recentTitleKeysLine],
    ];
    for (const [re, val] of replacers) out = out.replace(re, val);
    out = out.replace(/\{\{[^}]*\}\}/g, "не указано");
  }
  return out;
}

/** Промпт для type === "chat": V2 шаблон по тарифу + подстановка (Member/семья). */
function generateChatSystemPrompt(
  isPremium: boolean,
  memberData: MemberData | null | undefined,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  options?: { generationContextBlock?: string }
): string {
  const template = isPremium ? PREMIUM_RECIPE_TEMPLATE : FREE_RECIPE_TEMPLATE;
  return applyPromptTemplate(template, memberData, targetIsFamily, allMembers, options);
}

function getSystemPromptForType(
  type: string,
  memberData: MemberData | null | undefined,
  isPremium: boolean,
  targetIsFamily: boolean,
  allMembers: MemberData[] = [],
  weekContext?: string,
  userMessage?: string,
  generationContextBlock?: string,
  mealType?: string,
  maxCookingTime?: number,
  varietyRules?: string,
  servings?: number,
  recentTitleKeysLine?: string
): string {
  const genBlockOpt = generationContextBlock?.trim() ? { generationContextBlock: generationContextBlock.trim() } : undefined;
  const recipeOpts = {
    ...genBlockOpt,
    ...(mealType && { mealType: String(mealType).trim() }),
    ...(maxCookingTime != null && Number.isFinite(maxCookingTime) && { maxCookingTime: Number(maxCookingTime) }),
    servings: servings != null && servings >= 1 ? servings : 1,
    recentTitleKeysLine: recentTitleKeysLine?.trim() ?? "",
  };
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, memberData, targetIsFamily, allMembers, recipeOpts);
  }
  if (type === "recipe" || type === "diet_plan") {
    const template = isPremium ? PREMIUM_RECIPE_TEMPLATE : FREE_RECIPE_TEMPLATE;
    return applyPromptTemplate(template, memberData, targetIsFamily, allMembers, recipeOpts);
  }
  if (type === "single_day") {
    const ctx = weekContext?.trim() || "Пока ничего не запланировано.";
    const variety = varietyRules?.trim() || "Избегай повторов с уже запланированными блюдами; разнообразь базы завтраков.";
    return applyPromptTemplate(SINGLE_DAY_PLAN_TEMPLATE, memberData, targetIsFamily, allMembers, { weekContext: ctx, varietyRules: variety, ...genBlockOpt });
  }
  if (type === "sos_consultant") {
    return applyPromptTemplate(SOS_PROMPT_TEMPLATE, memberData, false, allMembers, { userMessage: userMessage || "" });
  }
  if (type === "balance_check") {
    return applyPromptTemplate(BALANCE_CHECK_TEMPLATE, memberData, false, allMembers, { userMessage: userMessage || "" });
  }
  return "Ты — помощник. Отвечай кратко и по делу.";
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  memberData?: MemberData | null;
  type?: "chat" | "recipe" | "diet_plan" | "single_day" | "sos_consultant" | "balance_check";
  stream?: boolean;
  maxRecipes?: number;
  /** true, если выбран профиль «Семья» (рецепт для всех членов) */
  targetIsFamily?: boolean;
  /** id выбранного члена семьи; при значении "family" — режим «Семья» */
  memberId?: string;
  /** Данные всех членов семьи — если переданы, запрос в таблицу members не выполняется */
  allMembers?: MemberData[];
  /** Structured prompt block from GenerationContext (single/family with age, allergies, preferences, difficulty) */
  generationContextBlock?: string;
  /** Optional suffix appended to system prompt */
  extraSystemSuffix?: string;
  dayName?: string;
  /** string = legacy "Уже запланировано: ..."; object = накопленный контекст для VARIETY_RULES */
  weekContext?: string | WeekContextPayload;
}

interface WeekContextPayload {
  chosenTitles?: string[];
  chosenBreakfastTitles?: string[];
  chosenBreakfastBases?: string[];
}

/** Строит блок [VARIETY_RULES] для single_day из накопленного контекста недели. */
function buildVarietyRules(w: WeekContextPayload): string {
  const chosen = w.chosenTitles ?? [];
  const breakfastTitles = w.chosenBreakfastTitles ?? [];
  const bases = w.chosenBreakfastBases ?? [];
  const lines: string[] = [];
  if (chosen.length > 0) {
    lines.push("- ЗАПРЕЩЕНО повторять точные названия блюд из списка уже запланированных: " + chosen.join(", ") + ".");
  }
  const hasOatmeal = breakfastTitles.some((t) => /овсян|oat/i.test(t)) || bases.includes("oatmeal");
  if (hasOatmeal) {
    lines.push("- Овсянка/каша овсяная уже есть на неделе. ЗАПРЕЩЕНО предлагать овсянку снова. Выбери другую базу завтрака: омлет/яйца, творог/сырники, йогурт/гранола, гречка/рис, бутерброд/тост/лаваш, запеканка, блинчики.");
  }
  lines.push("- Разнообразие завтраков: за неделю должно быть минимум 5 разных баз (яйца, творог, йогурт, крупы кроме овсянки, бутерброды, запеканка, блинчики). Не овсянка каждый день.");
  lines.push("- Если не можешь выполнить ограничения — замени завтрак на другую базу из списка выше, а не повторяй уже использованные.");
  return lines.join("\n");
}

serve(async (req) => {
  // CORS preflight: ответить 200 до любой логики, чтобы браузер не блокировал запрос
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    logPerf("start", t0);

    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    type ProfileV2Row = { status: string; requests_today: number; daily_limit: number } | null;
    let profileV2: (ProfileV2Row & { premium_until?: string | null }) | null = null;

    const tProfileStart = Date.now();
    // Создаём supabase клиент на уровне всего handler-а (service role для чтения профиля и лимитов)
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (authHeader && supabase) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;

      if (userId) {
        // Загружаем только profiles_v2 (таблица public.profiles не используется).
        const { data: profileV2Row } = await supabase
          .from("profiles_v2")
          .select("status, requests_today, daily_limit, premium_until, trial_until")
          .eq("user_id", userId)
          .maybeSingle();

        profileV2 = profileV2Row as (ProfileV2Row & { premium_until?: string | null; trial_until?: string | null }) | null;

        // Trial: истекает по trial_until (не по premium_until). При истечении — free.
        const p = profileV2 as { status?: string; trial_until?: string | null; requests_today?: number } | null;
        if (p?.status === "trial" && p.trial_until) {
          const until = new Date(p.trial_until).getTime();
          if (Date.now() > until) {
            await supabase
              .from("profiles_v2")
              .update({ status: "free", daily_limit: FREE_AI_DAILY_LIMIT })
              .eq("user_id", userId);
            profileV2 = {
              status: "free",
              requests_today: p.requests_today ?? 0,
              daily_limit: FREE_AI_DAILY_LIMIT,
            };
          }
        }

        if (!profileV2) {
          // Нет строки в profiles_v2 — fallback на check_usage_limit для лимита free.
          const { data: usageData } = await supabase.rpc("check_usage_limit", { _user_id: userId });
          if (usageData && !usageData.can_generate) {
            return new Response(
              JSON.stringify({
                error: "usage_limit_exceeded",
                message: "Дневной лимит исчерпан. Перейдите на Premium для безлимитного доступа.",
                remaining: 0,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    const requestIdEarly = req.headers.get("x-request-id") ?? req.headers.get("sb-request-id") ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    logPerf("profile_fetch", tProfileStart, requestIdEarly);
    console.log(JSON.stringify({
      tag: "PROFILE_STATUS",
      status: profileV2?.status ?? "free",
      premium_until: profileV2?.premium_until ?? undefined,
      requestId: requestIdEarly,
    }));

    const subscriptionStatus = (profileV2?.status ?? "free") as string;
    const isPremiumUser = subscriptionStatus === "premium" || subscriptionStatus === "trial";

    const requestId = req.headers.get("x-request-id") ?? req.headers.get("sb-request-id") ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const startedAt = Date.now();
    const body = await req.json();
    // Поддержка и нового (memberData/allMembers), и старого (childData/allChildren) формата запроса
    const memberDataRaw = body.memberData ?? body.childData;
    const reqAllMembersRaw = body.allMembers ?? body.allChildren;
    const {
      messages,
      type = "chat",
      stream: reqStream = true,
      targetIsFamily: reqTargetIsFamily,
      memberId = body.memberId ?? body.childId,
      dayName,
      weekContext,
      generationContextBlock: reqGenerationContextBlock,
      extraSystemSuffix: reqExtraSystemSuffix,
      mealType: reqMealType,
      maxCookingTime: reqMaxCookingTime,
      servings: reqServings,
      from_plan_replace: fromPlanReplace = false,
    } = body;
    const servings = typeof reqServings === "number" && reqServings >= 1 && reqServings <= 20 ? reqServings : 1;

    if (type === "chat" && (memberId == null || memberId === "family")) {
      return new Response(
        JSON.stringify({ error: "select_profile", message: "Выберите профиль" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipeTypes = ["recipe", "single_day", "diet_plan", "balance_check"] as const;
    const isRecipeRequestByType = recipeTypes.includes(type as (typeof recipeTypes)[number]);

    let weekContextForPrompt = typeof weekContext === "string" ? (weekContext ?? "") : "";
    let varietyRulesForPrompt = "";
    if (type === "single_day") {
      if (weekContext && typeof weekContext === "object" && !Array.isArray(weekContext)) {
        const w = weekContext as WeekContextPayload;
        weekContextForPrompt = w.chosenTitles?.length
          ? "Уже запланировано на неделю: " + w.chosenTitles.join(", ") + ". Не повторяй эти блюда и названия."
          : "Пока ничего не запланировано.";
        varietyRulesForPrompt = buildVarietyRules(w);
      } else if (typeof weekContext === "string" && weekContext.trim()) {
        weekContextForPrompt = "Уже запланировано: " + weekContext.trim() + ". Сделай этот день максимально непохожим на уже запланированные.";
      } else {
        weekContextForPrompt = "Пока ничего не запланировано.";
      }
    }

    const DEBUG = Deno.env.get("DEBUG") === "1" || Deno.env.get("DEBUG") === "true";
    if (DEBUG && type === "single_day") {
      const ctxSummary =
        weekContext && typeof weekContext === "object" && !Array.isArray(weekContext)
          ? `object chosenTitles=${(weekContext as WeekContextPayload).chosenTitles?.length ?? 0}`
          : typeof weekContext === "string"
            ? `string len=${(weekContext as string).length}`
            : "empty";
      safeLog("[DEBUG] single_day: no pool used; plan by AI; recipes on client. dayName:", dayName ?? "(none)", "memberId:", !!memberId, "weekContext:", ctxSummary);
    }

    // Нормализация: фронт может присылать ageMonths (camelCase), без age_months
    const memberDataNorm = normalizeMemberData(memberDataRaw);
    const reqAllMembersNorm = Array.isArray(reqAllMembersRaw)
      ? reqAllMembersRaw.map((m: MemberData) => {
        const n = normalizeMemberData(m);
        return (n != null ? n : m) as MemberData;
      })
      : reqAllMembersRaw;

    safeLog("DEBUG: Received memberData:", JSON.stringify(memberDataNorm));

    const memberName = memberDataNorm?.name?.trim() || "член семьи";

    const userMessage =
      (Array.isArray(messages) && messages.length > 0)
        ? [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content ?? ""
        : "";

    let premiumRelevance: false | "soft" | true | undefined = undefined;

    if (type === "chat") {
      const irrelevantStub =
        `Похоже, этот вопрос не связан с питанием. ${memberName} ждёт полезных рецептов! Пожалуйста, уточни свой кулинарный запрос.`;

      if (!isPremiumUser) {
        if (!isRelevantQuery(userMessage)) {
          return new Response(
            JSON.stringify({ message: irrelevantStub, recipes: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        premiumRelevance = isRelevantPremiumQuery(userMessage);
        if (premiumRelevance === false) {
          return new Response(
            JSON.stringify({ message: irrelevantStub, recipes: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Для Premium: генерируем рецепт и при "soft" (чтобы профили вроде "мама" получали рецепты на общие запросы)
    const isRecipeChat =
      type === "chat" && (isPremiumUser ? (premiumRelevance === true || premiumRelevance === "soft") : true);
    const isRecipeRequest = isRecipeRequestByType || (type === "chat" && isRecipeChat);
    const stream =
      type === "sos_consultant" || type === "balance_check" || isRecipeRequest
        ? false
        : reqStream;

    const targetIsFamily =
      type === "chat" && (reqTargetIsFamily === true || memberId === "family");

    // SOS-консультант (Помощь маме): Free — лимит 2/день по фиче help; Premium/Trial — без лимита
    const FREE_FEATURE_LIMIT = 2;
    if (type === "sos_consultant" && userId && supabase && !isPremiumUser) {
      const { data: helpUsed } = await supabase.rpc("get_usage_count_today", { p_user_id: userId, p_feature: "help" });
      const used = typeof helpUsed === "number" ? helpUsed : 0;
      if (used >= FREE_FEATURE_LIMIT) {
        return new Response(
          JSON.stringify({
            error: "LIMIT_REACHED",
            code: "LIMIT_REACHED",
            message: "Лимит на сегодня исчерпан.",
            payload: { feature: "help", limit: FREE_FEATURE_LIMIT, used },
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // Чат-рецепт: Free — лимит 2/день по фиче chat_recipe (план/help не тратят этот лимит)
    if ((type === "chat" || type === "recipe") && !fromPlanReplace && userId && supabase && !isPremiumUser) {
      const { data: chatRecipeUsed } = await supabase.rpc("get_usage_count_today", { p_user_id: userId, p_feature: "chat_recipe" });
      const used = typeof chatRecipeUsed === "number" ? chatRecipeUsed : 0;
      if (used >= FREE_FEATURE_LIMIT) {
        return new Response(
          JSON.stringify({
            error: "LIMIT_REACHED",
            code: "LIMIT_REACHED",
            message: "Лимит на сегодня исчерпан.",
            payload: { feature: "chat_recipe", limit: FREE_FEATURE_LIMIT, used },
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Данные только из members: из запроса (нормализованные) или запрос в БД
    let allMembers: MemberData[] = [];
    if (targetIsFamily) {
      if (Array.isArray(reqAllMembersNorm) && reqAllMembersNorm.length > 0) {
        allMembers = reqAllMembersNorm as MemberData[];
      } else if (userId && supabase) {
        const { data: rows, error: membersError } = await supabase
          .from("members")
          .select("name, age_months, allergies, preferences, likes, dislikes, difficulty")
          .eq("user_id", userId);

        if (!membersError && rows) {
          allMembers = rows.map((m: { name?: string; age_months?: number; allergies?: string[]; preferences?: string[]; likes?: string[]; dislikes?: string[]; difficulty?: string }) => ({
            name: m.name,
            age_months: m.age_months ?? 0,
            allergies: m.allergies ?? [],
            ...(m.preferences && { preferences: m.preferences }),
            ...(m.likes && { likes: m.likes }),
            ...(m.dislikes && { dislikes: m.dislikes }),
            ...(m.difficulty && { difficulty: m.difficulty }),
          })) as MemberData[];
        }
      }
    }

    const primaryForAge =
      targetIsFamily && allMembers.length > 0 ? findYoungestMember(allMembers) : memberDataNorm;
    let ageMonthsForCategory = primaryForAge ? getAgeMonths(primaryForAge) : 0;
    // Страховка: если возраст получился 0, но в теле запроса он есть — берём из запроса (один профиль)
    if (ageMonthsForCategory === 0 && memberDataNorm && !targetIsFamily) {
      const fromBody = memberDataNorm.age_months ?? memberDataNorm.ageMonths;
      if (typeof fromBody === "number" && fromBody > 0) {
        ageMonthsForCategory = fromBody;
      }
    }
    const ageCategoryForLog = getAgeCategory(ageMonthsForCategory);
    safeLog("DEBUG: Final age category determined:", ageCategoryForLog, "Months:", ageMonthsForCategory);
    const memberTypeV2 = targetIsFamily
      ? "family"
      : (ageMonthsForCategory > 216 ? "adult" : "child");
    const tariffResult = buildPromptByProfileAndTariff({
      status: subscriptionStatus,
      memberType: memberTypeV2,
      isFamilyTarget: targetIsFamily,
    });

    let memberDataForPrompt = memberDataNorm;
    let allMembersForPrompt = allMembers;
    if (!tariffResult.useAllAllergies) {
      memberDataForPrompt = memberDataNorm
        ? { ...memberDataNorm, allergies: (memberDataNorm.allergies ?? []).slice(0, 1) }
        : null;
      allMembersForPrompt = allMembers.map((m) => ({
        ...m,
        allergies: (m.allergies ?? []).slice(0, 1),
      }));
    }

    // Страховка: запрос с аллергеном или dislikes — отказ без вызова модели, без usage_events
    // Исключение: «суп без лука» при аллергии на лук — не блокируем, отдаём рецепт без него
    if ((type === "chat" || type === "recipe" || type === "diet_plan") && isRecipeRequest) {
      const profileName = (memberDataForPrompt?.name ?? (allMembersForPrompt[0]?.name) ?? "выбранного профиля").toString().trim() || "выбранного профиля";
      const allergiesList: string[] = targetIsFamily && allMembersForPrompt.length > 0
        ? [...new Set(allMembersForPrompt.flatMap((m) => m.allergies ?? []))]
        : (memberDataForPrompt?.allergies ?? []);
      const dislikesList: string[] = targetIsFamily && allMembersForPrompt.length > 0
        ? [...new Set(allMembersForPrompt.flatMap((m) => (m as MemberData).dislikes ?? []).filter(Boolean))]
        : ((memberDataForPrompt as MemberData)?.dislikes ?? []);

      const tokenSet = buildBlockedTokenSet({ allergies: allergiesList, dislikes: dislikesList });
      const messageForBlockCheck = textWithoutExclusionPhrases(userMessage);
      const allergyMatch = tokenSet.allergyItems.find((item) => findMatchedTokens(messageForBlockCheck, item.tokens).length > 0);
      if (allergyMatch) {
        const blockedItems = [allergyMatch.display];
        const suggestedAlternatives = getSuggestedAlternatives(blockedItems);
        const intendedDishHint = extractIntendedDishHint(userMessage, allergyMatch.display);
        const message = buildBlockedMessageEdge(profileName, "allergy", blockedItems, suggestedAlternatives, intendedDishHint);
        return new Response(JSON.stringify({
          blocked: true,
          blocked_by: "allergy",
          profile_name: profileName,
          blocked_items: blockedItems,
          suggested_alternatives: suggestedAlternatives,
          original_query: userMessage,
          intended_dish_hint: intendedDishHint || undefined,
          message,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const dislikeMatch = tokenSet.dislikeItems.find((item) => findMatchedTokens(messageForBlockCheck, item.tokens).length > 0);
      if (dislikeMatch) {
        const blockedItems = [dislikeMatch.display];
        const suggestedAlternatives = getSuggestedAlternatives(blockedItems);
        const intendedDishHint = extractIntendedDishHint(userMessage, dislikeMatch.display);
        const message = buildBlockedMessageEdge(profileName, "dislike", blockedItems, suggestedAlternatives, intendedDishHint);
        return new Response(JSON.stringify({
          blocked: true,
          blocked_by: "dislike",
          profile_name: profileName,
          blocked_items: blockedItems,
          suggested_alternatives: suggestedAlternatives,
          original_query: userMessage,
          intended_dish_hint: intendedDishHint || undefined,
          message,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (type === "chat" || type === "recipe" || type === "diet_plan") {
      const templateName = isPremiumUser ? "PREMIUM_RECIPE_TEMPLATE" : "FREE_RECIPE_TEMPLATE";
      const genBlockLen = typeof reqGenerationContextBlock === "string" ? reqGenerationContextBlock.trim().length : 0;
      safeLog(
        "Template selected:",
        templateName,
        "subscription_status:",
        subscriptionStatus,
        "targetIsFamily:",
        targetIsFamily,
        "generationContextBlock length:",
        genBlockLen,
        "memberData preferences:",
        memberDataNorm?.preferences ?? "(none)",
        "ageMonthsForCategory:",
        ageMonthsForCategory
      );
    }

    let recentTitleKeys: string[] = [];
    let recentTitleKeysLine = "";
    if (isRecipeRequest && userId && supabase) {
      recentTitleKeys = await fetchRecentTitleKeys(supabase, userId, memberId ?? null, targetIsFamily);
      if (recentTitleKeys.length > 0) {
        recentTitleKeysLine = "Не повторять: " + recentTitleKeys.slice(0, 12).join(", ") + ".";
      }
    }

    const tSystemPromptStart = Date.now();
    const promptUserMessage = (type === "sos_consultant" || type === "balance_check") ? userMessage : undefined;
    const mealTypeForPrompt =
      isRecipeRequest && userMessage && isExplicitDishRequest(userMessage) && inferMealTypeFromQuery(userMessage)
        ? inferMealTypeFromQuery(userMessage)!
        : (reqMealType ?? "");
    const cached = getCachedSystemPrompt(type, memberDataForPrompt, isPremiumUser);
    let systemPrompt =
      cached ?? getSystemPromptForType(type, memberDataForPrompt, isPremiumUser, targetIsFamily, allMembersForPrompt, weekContextForPrompt, promptUserMessage, reqGenerationContextBlock, mealTypeForPrompt, reqMaxCookingTime, varietyRulesForPrompt, servings, recentTitleKeysLine);

    // Только если рецепт не запрашиваем — даём краткий ответ без рецепта (для soft теперь рецепт генерируем)
    if (type === "chat" && isPremiumUser && premiumRelevance === "soft" && !isRecipeRequest) {
      systemPrompt = "Ты эксперт по питанию Mom Recipes. Отвечай кратко по вопросу пользователя, без генерации рецепта.";
    }

    // v2: age-based logic — категория возраста и правила питания в промпт (ageCategory уже вычислен выше для лога)
    const ageCategory = ageCategoryForLog;
    const ageRulesV2 = getAgeCategoryRules(ageCategory);
    systemPrompt =
      systemPrompt +
      "\n\n" +
      ageRulesV2 +
      "\n" +
      tariffResult.tariffAppendix +
      (tariffResult.familyBalanceNote ? "\n" + tariffResult.familyBalanceNote : "") +
      "\n" +
      NO_ARTICLES_RULE +
      (!isRecipeRequest && type !== "sos_consultant" && type !== "balance_check" ? "\n" + GREETING_STYLE_RULE : "");

    if ((type === "chat" || type === "recipe" || type === "diet_plan") && targetIsFamily) {
      systemPrompt += "\n\n" + applyPromptTemplate(
        FAMILY_RECIPE_INSTRUCTION,
        memberDataForPrompt,
        true,
        allMembersForPrompt
      );
    }

    const extraSuffix = typeof reqExtraSystemSuffix === "string" ? reqExtraSystemSuffix.trim() : "";
    if (extraSuffix) {
      systemPrompt += "\n\n" + extraSuffix;
    }
    if (isRecipeRequest && (type === "chat" || type === "recipe" || type === "diet_plan")) {
      systemPrompt += "\n\nРазнообразь стиль описаний. Не используй одни и те же формулировки в нескольких подряд ответах.";
    }
    logPerf("system_prompt", tSystemPromptStart, requestId);

    const isRecipeJsonRequest = (type === "chat" || type === "recipe" || type === "diet_plan") && isRecipeRequest;

    let currentSystemPrompt = systemPrompt;
    let assistantMessage = "";
    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown } = {};
    let responseRecipes: Array<Record<string, unknown>> = [];

    safeLog("FINAL_SYSTEM_PROMPT:", currentSystemPrompt.slice(0, 200) + "...");

      const isExpertSoft = type === "chat" && isPremiumUser && premiumRelevance === "soft";
      const isMealPlan = type === "single_day" || type === "diet_plan";
      const maxTokensChat =
        type === "chat" && !isExpertSoft ? tariffResult.maxTokens : undefined;
      const promptConfig = {
        maxTokens: isRecipeRequest ? RECIPE_MAX_TOKENS : maxTokensChat ?? (isExpertSoft ? 500 : type === "single_day" ? 1000 : 8192),
      };
      const messagesForPayload = isRecipeRequest
        ? [{ role: "user" as const, content: userMessage }]
        : messages;
      const recipeStream = isRecipeRequest && stream;
      const payload = {
        model: "deepseek-chat",
        messages: [{ role: "system", content: currentSystemPrompt }, ...messagesForPayload],
        stream: recipeStream || (stream && !isRecipeRequest),
        max_tokens: promptConfig.maxTokens,
        temperature: isRecipeRequest ? 0.4 : 0.7,
        top_p: 0.8,
        repetition_penalty: 1.1,
        ...(isRecipeRequest && !recipeStream && { response_format: { type: "json_object" } }),
      };

      const MAIN_LLM_TIMEOUT_MS = isRecipeRequest ? 25000 : (type === "single_day" ? 60000 : (payload as { stream?: boolean }).stream ? 90000 : 120000);
      const timeoutMs = MAIN_LLM_TIMEOUT_MS;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const tLlmStart = Date.now();
      safeLog("SENDING PAYLOAD:", JSON.stringify(payload, null, 2));
      let response: Response;
      try {
        response = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          logPerf("llm_ttfb", tLlmStart, requestId);
          logPerf("llm_total", tLlmStart, requestId);
          logPerf("total_ms", t0, requestId);
          if (isRecipeRequest) {
            const minimal = getMinimalRecipe((body as { mealType?: string }).mealType ?? "snack");
            return new Response(
              JSON.stringify({
                message: JSON.stringify(minimal),
                recipes: [minimal],
                recipe_id: null,
                _timeout: true,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const fallbackMsg = `Request timeout after ${timeoutMs}ms`;
          return new Response(
            JSON.stringify({ error: "timeout", message: fallbackMsg }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw error;
      }
      const llmTtfbMs = Date.now() - tLlmStart;
      logPerf("llm_ttfb", tLlmStart, requestId);

      if (!response.ok) {
        const errorText = await response.text();
        safeError("DeepSeek API error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "rate_limit", message: "Превышен лимит запросов DeepSeek. Попробуйте позже." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const message = "DeepSeek вернул ошибку. Попробуйте ещё раз.";
        return new Response(
          JSON.stringify({ error: "api_error", message, status: response.status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (recipeStream && response.body) {
        logPerf("total_ms", t0, requestId);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const tBodyStartStream = Date.now();
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let fullContent = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim();
                    if (data === "[DONE]") continue;
                    try {
                      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
                      const content = parsed?.choices?.[0]?.delta?.content;
                      if (typeof content === "string") {
                        fullContent += content;
                        controller.enqueue(encoder.encode("event: delta\ndata: " + JSON.stringify({ delta: content }) + "\n\n"));
                      }
                    } catch {
                      // skip malformed
                    }
                  }
                }
              }
              logPerf("llm_body", tBodyStartStream, requestId, { response_chars: fullContent.length });
              logPerf("llm_total", tLlmStart, requestId);
              const streamParseLog = (msg: string, meta?: Record<string, unknown>) =>
                console.log(JSON.stringify({ tag: "RECIPE_PARSE", requestId, ...meta, msg }));
              const rawStreamContent = fullContent.trim();
              let validated: RecipeJson | null = null;
              const streamResult = validateRecipe(rawStreamContent, parseAndValidateRecipeJsonFromString);
              if (streamResult.stage === "ok" && streamResult.valid) {
                validated = streamResult.valid;
              } else if (DEEPSEEK_API_KEY && streamResult.stage !== "ok") {
                const validationErrorMsg = streamResult.stage === "validate" ? (getLastValidationError() ?? (streamResult as { error?: string }).error) : (streamResult as { error?: string }).error;
                streamParseLog("stream first attempt failed", { stage: streamResult.stage, responseLength: rawStreamContent.length });
                const retryResult = await retryFixJson({
                  apiKey: DEEPSEEK_API_KEY,
                  rawResponse: rawStreamContent.slice(0, 3500),
                  validationError: validationErrorMsg ?? "unknown",
                  requestId,
                  log: streamParseLog,
                });
                if (retryResult.success && retryResult.fixed) {
                  validated = parseAndValidateRecipeJsonFromString(retryResult.fixed);
                  if (validated) streamParseLog("stream retry succeeded", { retrySuccess: true });
                }
                if (!validated) validated = getRecipeOrFallback(rawStreamContent);
              } else if (streamResult.stage !== "ok") {
                validated = getRecipeOrFallback(rawStreamContent);
              }
              if (validated && ingredientsNeedAmountRetry(validated.ingredients)) {
                applyIngredientsFallbackHeuristic(validated.ingredients as Array<Record<string, unknown> & { name?: string; amount?: string; displayText?: string; canonical?: { amount: number; unit: string } | null }>);
              }
              if (validated) {
                const desc = (validated as { description?: string }).description;
                const advice = validated.chefAdvice ?? "";
                if (!desc || shouldReplaceDescription(desc) || isDescriptionIncomplete(desc)) {
                  const keyIngredient = Array.isArray(validated.ingredients) && validated.ingredients[0] && typeof validated.ingredients[0] === "object" && validated.ingredients[0].name ? String(validated.ingredients[0].name) : undefined;
                  (validated as Record<string, unknown>).description = isDescriptionIncomplete(desc) && DEEPSEEK_API_KEY
                    ? (await repairDescriptionOnly(desc ?? "", DEEPSEEK_API_KEY)) ?? buildRecipeDescription({ title: validated.title, userText: userMessage, keyIngredient })
                    : buildRecipeDescription({ title: validated.title, userText: userMessage, keyIngredient });
                }
                if (!advice.trim() || shouldReplaceChefAdvice(advice)) {
                  (validated as Record<string, unknown>).chefAdvice = buildChefAdvice({ title: validated.title, userText: userMessage });
                }
              }
              let savedRecipeId: string | null = null;
              let responseRecipesStream: Array<Record<string, unknown>> = [];
              if (validated) {
                responseRecipesStream = [validated as Record<string, unknown>];
                if (userId && authHeader && !fromPlanReplace && SUPABASE_URL && SUPABASE_ANON_KEY) {
                  try {
                    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
                    const memberIdForRecipe = (memberId && memberId !== "family" && /^[0-9a-f-]{36}$/i.test(memberId)) ? memberId : null;
                    const status = subscriptionStatus as string;
                    const chefAdviceToSave = status === "free" ? null : (validated.chefAdvice ?? null);
                    const rawSteps = (validated.steps ?? []).slice(0, 10).map((step: string, idx: number) => ({ instruction: (typeof step === "string" ? step : (step as { instruction?: string }).instruction ?? "").slice(0, 200), step_number: idx + 1 }));
                    const stepsPayload = rawSteps.length >= 3 ? rawSteps : [...rawSteps, ...Array.from({ length: 3 - rawSteps.length }, (_, i) => ({ instruction: "Шаг.", step_number: rawSteps.length + i + 1 }))];
                    const rawIngredients = (validated.ingredients ?? []).slice(0, 10);
                    const ingredientsPayload = rawIngredients.map((ing: { name: string; displayText?: string; canonical?: { amount: number; unit: string } | null }) => ({
                      name: typeof ing === "string" ? ing : ing.name,
                      display_text: typeof ing === "string" ? ing : (ing.displayText ?? ing.name),
                      canonical_amount: (ing as { canonical?: { amount: number } }).canonical?.amount ?? null,
                      canonical_unit: (ing as { canonical?: { unit: string } }).canonical?.unit ?? null,
                    }));
                    const ageRange = AGE_RANGE_BY_CATEGORY[ageCategoryForLog] ?? AGE_RANGE_BY_CATEGORY.adult;
                    const payload = canonicalizeRecipePayload({
                      user_id: userId,
                      member_id: memberIdForRecipe,
                      child_id: memberIdForRecipe,
                      source: "chat_ai",
                      mealType: validated.mealType ?? null,
                      tags: (validated as { tags?: string[] }).tags ?? null,
                      title: validated.title ?? "Рецепт",
                      description: (validated.description ?? "").slice(0, 500),
                      cooking_time_minutes: validated.cookingTimeMinutes ?? null,
                      chef_advice: chefAdviceToSave,
                      advice: null,
                      steps: stepsPayload,
                      ingredients: ingredientsPayload,
                      sourceTag: "chat",
                      servings: (validated as { servings?: number }).servings ?? 1,
                      nutrition: validated.nutrition ?? null,
                      min_age_months: ageRange.min,
                      max_age_months: ageRange.max,
                    });
                    const { data: recipeId, error: rpcErr } = await supabaseUser.rpc("create_recipe_with_steps", { payload });
                    if (!rpcErr) savedRecipeId = recipeId ?? null;
                  } catch {
                    // ignore
                  }
                }
                if (userId && supabase && !fromPlanReplace) {
                  const memberIdUuid = memberId && memberId !== "family" ? memberId : null;
                  await supabase.from("usage_events").insert({ user_id: userId, member_id: memberIdUuid, feature: "chat_recipe" });
                }
              }
              const donePayload = {
                recipe_id: savedRecipeId,
                message: validated ? JSON.stringify(validated) : "Не удалось распознать рецепт из ответа. Попробуйте переформулировать запрос или упростить его.",
                recipes: responseRecipesStream,
              };
              controller.enqueue(encoder.encode("event: done\ndata: " + JSON.stringify(donePayload) + "\n\n"));
            } catch (e) {
              safeError("recipe stream error", e);
              controller.enqueue(encoder.encode("event: error\ndata: " + JSON.stringify({ error: "stream_failed" }) + "\n\n"));
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      const tBodyStart = Date.now();
      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch {
        return new Response(
          JSON.stringify({ error: "parse_error", message: "Не удалось прочитать ответ ИИ. Попробуйте ещё раз." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const llmBodyMs = Date.now() - tBodyStart;
      try {
        data = JSON.parse(bodyText) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      } catch {
        return new Response(
          JSON.stringify({ error: "parse_error", message: "Не удалось прочитать ответ ИИ. Попробуйте ещё раз." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      assistantMessage = (data.choices?.[0]?.message?.content ?? "").trim();
      logPerf("llm_body", tBodyStart, requestId, { response_chars: assistantMessage.length });
      const llmTotalMs = Date.now() - tLlmStart;
      logPerf("llm_total", tLlmStart, requestId);
      if (!assistantMessage) {
        return new Response(
          JSON.stringify({ error: "empty_response", message: "ИИ не вернул ответ. Попробуйте переформулировать запрос." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (DEBUG && type === "single_day") {
        safeLog("[DEBUG] single_day: response length:", assistantMessage.length, "recipes created on client only (no server insert); total recipes for plan = 4 per day × 7 days (client-side).");
        try {
          const parsed = JSON.parse(assistantMessage) as Record<string, { ingredients?: unknown[] } | undefined>;
          const mealKeys = ["breakfast", "lunch", "snack", "dinner"];
          for (const key of mealKeys) {
            const meal = parsed[key];
            const arr = meal?.ingredients;
            if (Array.isArray(arr) && arr.some((item) => typeof item === "string")) {
              safeWarn("[DEBUG] single_day: meal", key, "has string ingredients (expected [{name, amount}]); response length:", assistantMessage.length);
            }
          }
        } catch {
          // ignore parse errors for debug
        }
      }

      if (isRecipeJsonRequest) {
        const tNormStart = Date.now();
        const parseLog = (msg: string, meta?: Record<string, unknown>) =>
          console.log(JSON.stringify({ tag: "RECIPE_PARSE", requestId, ...meta, msg }));
        let validated: RecipeJson | null = null;
        const result = validateRecipe(assistantMessage, parseAndValidateRecipeJsonFromString);
        if (result.stage === "ok" && result.valid) {
          validated = result.valid;
        } else {
          const validationErrorMsg = result.stage === "validate" ? getLastValidationError() : null;
          parseLog("first attempt failed", { stage: result.stage, error: (result as { error?: string }).error ?? validationErrorMsg ?? undefined, responseLength: assistantMessage.length });
          if (DEEPSEEK_API_KEY && result.stage !== "ok") {
            const retryResult = await retryFixJson({
              apiKey: DEEPSEEK_API_KEY,
              rawResponse: assistantMessage.slice(0, 3500),
              validationError: validationErrorMsg ?? (result as { error?: string }).error ?? "unknown",
              requestId,
              log: parseLog,
            });
            if (retryResult.success && retryResult.fixed) {
              const retryValidated = parseAndValidateRecipeJsonFromString(retryResult.fixed);
              if (retryValidated) {
                validated = retryValidated;
                parseLog("retry succeeded", { retrySuccess: true });
              } else {
                parseLog("retry returned invalid JSON, using fallback", { retrySuccess: false });
                validated = getRecipeOrFallback(assistantMessage);
              }
            } else {
              parseLog("retry failed or empty, using fallback", { retrySuccess: false });
              validated = getRecipeOrFallback(assistantMessage);
            }
          } else {
            validated = getRecipeOrFallback(assistantMessage);
          }
        }
        logPerf("normalize_ingredients", tNormStart, requestId);
        if (validated) {
          if (ingredientsNeedAmountRetry(validated.ingredients)) {
            applyIngredientsFallbackHeuristic(validated.ingredients as Array<Record<string, unknown> & { name?: string; amount?: string; displayText?: string; canonical?: { amount: number; unit: string } | null }>);
            safeLog("Recipe ingredients: applied heuristic fallback (retry disabled)", requestId);
          }
          const desc = (validated as { description?: string }).description;
          const advice = validated.chefAdvice ?? "";
          if (!desc || shouldReplaceDescription(desc) || isDescriptionIncomplete(desc)) {
            const keyIngredient = Array.isArray(validated.ingredients) && validated.ingredients[0] && typeof validated.ingredients[0] === "object" && validated.ingredients[0].name
              ? String(validated.ingredients[0].name)
              : undefined;
            (validated as Record<string, unknown>).description = isDescriptionIncomplete(desc) && DEEPSEEK_API_KEY
              ? (await repairDescriptionOnly(desc ?? "", DEEPSEEK_API_KEY)) ?? buildRecipeDescription({ title: validated.title, userText: userMessage, keyIngredient })
              : buildRecipeDescription({ title: validated.title, userText: userMessage, keyIngredient });
          }
          if (!advice.trim() || shouldReplaceChefAdvice(advice)) {
            (validated as Record<string, unknown>).chefAdvice = buildChefAdvice({ title: validated.title, userText: userMessage });
          }
          assistantMessage = JSON.stringify(validated);
          responseRecipes = [validated as Record<string, unknown>];
        }
        if (!validated) {
          validated = getRecipeOrFallback(assistantMessage);
          parseLog("using fallback recipe (nutrition may be null)", { responseLength: assistantMessage.length });
        }
      }

    // Учёт по фичам для лимитов Free (Plan/Help не тратят chat_recipe) (Plan/Help не тратят chat_recipe)
    if (userId && supabase) {
      if (type === "sos_consultant") {
        await supabase.from("usage_events").insert({ user_id: userId, member_id: null, feature: "help" });
      } else if ((type === "chat" || type === "recipe") && responseRecipes.length > 0 && !fromPlanReplace) {
        const memberIdUuid = memberId && memberId !== "family" ? memberId : null;
        await supabase.from("usage_events").insert({ user_id: userId, member_id: memberIdUuid, feature: "chat_recipe" });
      }
    }

    if (type === "balance_check" && userId && supabase) {
      const memberIdForLog = (memberId && memberId !== "family") ? memberId : null;
      await supabase.from("plate_logs").insert({
        user_id: userId,
        member_id: memberIdForLog,
        user_message: userMessage,
        assistant_message: assistantMessage,
      });
    }

    // Учёт токенов по типу действия (рецепт в чате, план на неделю, Мы рядом и т.д.)
    const usageObj = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number } | undefined;
    if (usageObj && supabase) {
      const inputTokens = usageObj.prompt_tokens ?? usageObj.input_tokens ?? 0;
      const outputTokens = usageObj.completion_tokens ?? usageObj.output_tokens ?? 0;
      const totalTokens = usageObj.total_tokens ?? inputTokens + outputTokens;
      const actionType =
        fromPlanReplace ? "plan_replace"
        : type === "single_day" ? "weekly_plan"
        : type === "sos_consultant" ? "sos_consultant"
        : type === "balance_check" ? "balance_check"
        : type === "diet_plan" ? "diet_plan"
        : (type === "chat" || type === "recipe") ? "chat_recipe"
        : "other";
      await supabase.from("token_usage_log").insert({
        user_id: userId ?? null,
        action_type: actionType,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      }).then(({ error }) => {
        if (error) safeWarn("token_usage_log insert failed", error.message);
      });
    }

    if (responseRecipes.length > 0) {
      const recipe = responseRecipes[0] as RecipeJson;
      (recipe as Record<string, unknown>).description = sanitizeMealMentions(sanitizeRecipeText(recipe.description ?? ""));
      (recipe as Record<string, unknown>).chefAdvice = sanitizeMealMentions(sanitizeRecipeText(recipe.chefAdvice ?? ""));
      safeLog(JSON.stringify({
        tag: "RECIPE_SANITIZED",
        requestId,
        descriptionLength: (recipe.description as string)?.length,
      }));
      safeLog(JSON.stringify({ tag: "MEAL_MENTION_SANITIZED", requestId }));
    }

    if (responseRecipes.length > 0 && isRecipeRequest) {
      const recipeForLog = responseRecipes[0] as RecipeJson;
      const newTitleKey = normalizeTitleKey(recipeForLog.title ?? "");
      const wasDuplicate = newTitleKey && recentTitleKeys.length > 0 && recentTitleKeys.includes(newTitleKey);
      safeLog(JSON.stringify({
        tag: "ANTI_DUPLICATE",
        requestId,
        scope: targetIsFamily ? "family" : "member",
        recentTitleKeysCount: recentTitleKeys.length,
        newTitleKey: newTitleKey || undefined,
        wasDuplicate,
        retried: false,
      }));
    }

    let savedRecipeId: string | null = null;
    if (responseRecipes.length > 0 && !fromPlanReplace) {
      if (!userId || !authHeader) {
        safeLog(JSON.stringify({ tag: "auth_failed", step: "save_recipe", requestId }));
        return new Response(
          JSON.stringify({ error: "unauthorized", message: "Требуется авторизация для сохранения рецепта." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const validatedRecipe = responseRecipes[0] as RecipeJson;
      const status = subscriptionStatus as string;
      let chefAdviceToSave: string | null = validatedRecipe.chefAdvice ?? null;
      if (status === "free") chefAdviceToSave = null;
      safeLog(JSON.stringify({
        tag: "ADVICE_GATE",
        requestId,
        subStatus: status,
        savedChefAdvice: chefAdviceToSave != null && chefAdviceToSave.length > 0,
      }));
      const supabaseUser = SUPABASE_URL && SUPABASE_ANON_KEY && authHeader
        ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
          })
        : null;
      if (supabaseUser) {
        const tDbStart = Date.now();
        try {
          const memberIdForRecipe = (memberId && memberId !== "family" && /^[0-9a-f-]{36}$/i.test(memberId)) ? memberId : null;
          const rawSteps = Array.isArray(validatedRecipe.steps) ? validatedRecipe.steps : [];
          const stepsPayload = rawSteps.length >= 1
            ? (rawSteps.length >= 3
              ? rawSteps.map((step: string, idx: number) => ({ instruction: step, step_number: idx + 1 }))
              : [
                  ...rawSteps.map((step: string, idx: number) => ({ instruction: step, step_number: idx + 1 })),
                  ...Array.from({ length: 3 - rawSteps.length }, (_, i) => ({ instruction: "Шаг по инструкции.", step_number: rawSteps.length + i + 1 })),
                ])
            : [{ instruction: "Шаг 1", step_number: 1 }, { instruction: "Шаг 2", step_number: 2 }, { instruction: "Шаг 3", step_number: 3 }];
          const rawIngredients = Array.isArray(validatedRecipe.ingredients) ? validatedRecipe.ingredients : [];
          const ingredientsPayload = rawIngredients.length >= 3
            ? rawIngredients.map((ing: { name: string; displayText?: string; canonical?: { amount: number; unit: string } | null }) => {
                const nameStr = typeof ing === "string" ? ing : ing.name;
                const displayText = typeof ing === "string" ? ing : (ing.displayText ?? ing.name);
                const canonical = typeof ing === "object" && ing?.canonical ? ing.canonical : null;
                return { name: nameStr, display_text: displayText, canonical_amount: canonical?.amount ?? null, canonical_unit: canonical?.unit ?? null };
              })
            : [
                ...rawIngredients.map((ing: { name: string; displayText?: string; canonical?: { amount: number; unit: string } | null }) => {
                  const nameStr = typeof ing === "string" ? ing : ing.name;
                  const displayText = typeof ing === "string" ? ing : (ing.displayText ?? ing.name);
                  const canonical = typeof ing === "object" && ing?.canonical ? ing.canonical : null;
                  return { name: nameStr, display_text: displayText, canonical_amount: canonical?.amount ?? null, canonical_unit: canonical?.unit ?? null };
                }),
                ...Array.from({ length: 3 - rawIngredients.length }, (_, i) => ({ name: `Ингредиент ${rawIngredients.length + i + 1}`, display_text: null, canonical_amount: null, canonical_unit: null })),
              ];
          const ageRange = AGE_RANGE_BY_CATEGORY[ageCategoryForLog] ?? AGE_RANGE_BY_CATEGORY.adult;
          const payload = canonicalizeRecipePayload({
            user_id: userId,
            member_id: memberIdForRecipe,
            child_id: memberIdForRecipe,
            source: "chat_ai",
            mealType: validatedRecipe.mealType ?? null,
            tags: (validatedRecipe as { tags?: string[] }).tags ?? null,
            title: validatedRecipe.title ?? "Рецепт",
            description: validatedRecipe.description ?? null,
            cooking_time_minutes: validatedRecipe.cookingTimeMinutes ?? null,
            chef_advice: chefAdviceToSave,
            advice: null,
            steps: stepsPayload,
            ingredients: ingredientsPayload,
            sourceTag: "chat",
            servings: (validatedRecipe as { servings?: number }).servings ?? 1,
            nutrition: validatedRecipe.nutrition ?? null,
            min_age_months: ageRange.min,
            max_age_months: ageRange.max,
          });
          const { data: recipeId, error: rpcErr } = await supabaseUser.rpc("create_recipe_with_steps", { payload });
          if (rpcErr) throw rpcErr;
          savedRecipeId = recipeId ?? null;
          if (DEBUG && savedRecipeId) {
            const idSuffix = savedRecipeId.slice(-6);
            safeLog("[DEBUG] saved recipe source=chat_ai id=...", idSuffix);
          }
        } catch (err) {
          safeWarn("Failed to save recipe to DB, continuing without recipe_id:", err instanceof Error ? err.message : err);
        }
        logPerf("db_insert", tDbStart, requestId);
      }
    }

    if (type === "sos_consultant") {
      safeLog("[help]", { requestId, durationMs: Date.now() - startedAt, status: "ok" });
    }
    const responseBody: { message: string; recipes?: Array<Record<string, unknown>>; recipe_id?: string | null; usage?: unknown } = {
      message: assistantMessage,
      usage: data.usage,
    };
    if (responseRecipes.length > 0) {
      responseBody.recipes = responseRecipes;
    }
    if (savedRecipeId) {
      responseBody.recipe_id = savedRecipeId;
    }
    logPerf("total_ms", t0, requestId);
    return new Response(
      JSON.stringify(responseBody),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errRequestId = req.headers.get("x-request-id") ?? req.headers.get("sb-request-id") ?? "";
    safeError("Error in deepseek-chat:", error);
    safeLog("[help]", { requestId: errRequestId, status: "error" });
    logPerf("total_ms", t0, errRequestId);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
