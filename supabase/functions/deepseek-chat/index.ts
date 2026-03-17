/**
 * deepseek-chat: чат-рецепт (JSON), SOS-консультант, анализ тарелки.
 *
 * Поддерживаемые type: chat, recipe (один рецепт в JSON), sos_consultant, balance_check.
 * Ответ всегда JSON (без SSE). Рецепт: message + recipes[] + recipe_id при авторизации.
 * Семейный режим: дети <12 мес исключаются из учёта; 12–35 мес — kid safety (тег kid_1_3_safe).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkFoodRelevance } from "./isRelevantQuery.ts";
import { detectAssistantTopic } from "./assistantTopicDetect.ts";
import {
  NO_ARTICLES_RULE,
  GREETING_STYLE_RULE,
  FAMILY_RECIPE_INSTRUCTION,
  KID_SAFETY_1_3_INSTRUCTION,
  LIKES_DIVERSITY_RULE,
} from "./prompts.ts";
import { getAgeCategory, getAgeCategoryRules } from "./ageCategory.ts";
import { buildPromptByProfileAndTariff } from "./promptByTariff.ts";
import { safeLog, safeError, safeWarn } from "../_shared/safeLogger.ts";
import { canonicalizeRecipePayload } from "../_shared/recipeCanonical.ts";
import { serializeError } from "../_shared/logging.ts";
import {
  parseAndValidateRecipeJsonFromString,
  getRecipeOrFallback,
  getLastValidationError,
  getLastRecipeParseDiagnostics,
  resetLastRecipeValidationState,
  decideRecipeRecovery,
  ingredientsNeedAmountRetry,
  applyIngredientsFallbackHeuristic,
  type RecipeJson,
} from "./recipeSchema.ts";
import { getSystemPromptForType, generateRecipeSystemPromptV3, applyPromptTemplate, normalizeMemberData, findYoungestMember, getAgeMonths, type MemberData } from "./buildPrompt.ts";
import { checkRecipeRequestBlocked } from "./domain/policies/index.ts";
import {
  getFamilyPromptMembers,
  buildFamilyMemberDataForChat,
  resolveFamilyStorageMemberId,
  buildFamilyGenerationContextBlock,
  shouldFavorLikes,
  buildLikesLine,
  buildLikesLineForProfile,
} from "./domain/family/index.ts";
import { isExplicitDishRequest, inferMealTypeFromQuery } from "./domain/meal/index.ts";
import {
  validateRecipe,
  retryFixJson,
  buildChefAdviceFallback,
  shouldReplaceDescription,
  shouldReplaceChefAdvice,
  isDescriptionIncomplete,
  sanitizeRecipeText,
  sanitizeMealMentions,
  getMinimalRecipe,
  enforceDescription,
  enforceChefAdvice,
  sanitizeDescriptionForPool,
  sanitizeChefAdviceForPool,
  passesDescriptionQualityGate,
  passesChefAdviceQualityGate,
  isDescriptionInvalid,
} from "./domain/recipe_io/index.ts";
import { composeRecipeDescription } from "../_shared/recipeDescriptionComposer.ts";
import { checkTitleIngredientConsistency } from "../_shared/titleIngredientConsistencyGuard.ts";
import { checkRequestContextLeak, textContainsRequestContextLeak, cleanStepFromRequestContextLeak } from "../_shared/requestContextLeakGuard.ts";
import { checkTitleLexicon } from "../_shared/titleLexiconGuard.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Ограничение длины ответа рецепта (description ≤160 composer, chefAdvice ≤260). */
const RECIPE_MAX_TOKENS = 1600;

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

/** Нормализация title для сравнения (anti-duplicate). Та же логика, что в pool/diag. */
function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Парсит строку количества в canonical amount + unit (g/ml) для БД. Без LLM. */
function parseAmountToCanonical(amountText: string): { amount: number; unit: "g" | "ml" } | null {
  const t = (amountText ?? "").trim();
  if (!t.length) return null;
  const numMatch = t.match(/[\d½¼¾⅓⅔⅛⅜⅝⅞]+|(\d+)\s*\/\s*(\d+)/);
  const numStr = numMatch?.[0];
  if (!numStr) return null;
  let amount = 0;
  if (numStr.includes("/")) {
    const [a, b] = numStr.split("/").map((s) => parseInt(s.trim(), 10));
    amount = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : parseFloat(numStr) || 0;
  } else {
    amount = parseFloat(numStr.replace(",", ".")) || 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rest = t.replace(numStr, "").replace(/,/g, ".").trim().toLowerCase();
  if (/\b(г|грамм|граммов)\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "g" };
  if (/\b(кг|килограмм)\b/.test(rest)) return { amount: Math.round(amount * 1000 * 100) / 100, unit: "g" };
  if (/\b(мл|миллилитр|миллилитров)\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "ml" };
  if (/\b(л|литр|литров)\b/.test(rest)) return { amount: Math.round(amount * 1000 * 100) / 100, unit: "ml" };
  if (/\b(ст\.?\s*л\.?|столовых?\s*ложек?)\b/.test(rest)) return { amount: Math.round(amount * 15 * 100) / 100, unit: "ml" };
  if (/\b(ч\.?\s*л\.?|чайных?\s*ложек?)\b/.test(rest)) return { amount: Math.round(amount * 5 * 100) / 100, unit: "ml" };
  if (/\bг\b/.test(rest) && !/мл|л\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "g" };
  if (/\bмл\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "ml" };
  return null;
}

/** Извлекает строку amount из displayText вида «Название — 30 г» или «30 г». */
function amountFromDisplayText(displayText: string, name: string): string {
  const d = (displayText ?? "").trim();
  const dash = d.indexOf("—");
  if (dash >= 0) {
    const after = d.slice(dash + 1).trim();
    if (after.length > 0) return after;
  }
  if (/^\d+\s*(г|мл|шт|ст\.|ч\.|кг|л)/i.test(d)) return d;
  return "";
}

/** Последние N titleKey из chat_history по (user_id + memberId или family) за 14 дней для anti-duplicate. */
async function fetchRecentTitleKeys(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  memberIdOrFamilyStorage: string | null,
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
      q = memberIdOrFamilyStorage ? q.eq("child_id", memberIdOrFamilyStorage) : q.is("child_id", null);
    } else if (memberIdOrFamilyStorage) {
      q = q.eq("child_id", memberIdOrFamilyStorage);
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

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  memberData?: MemberData | null;
  type?: "chat" | "recipe" | "sos_consultant" | "balance_check";
  maxRecipes?: number;
  /** true, если выбран профиль «Семья» (рецепт для всех членов) */
  targetIsFamily?: boolean;
  /** id выбранного члена семьи; при значении "family" — режим «Семья» */
  memberId?: string;
  /** Данные всех членов семьи — если переданы, запрос в таблицу members не выполняется */
  allMembers?: MemberData[];
  /** Structured prompt block from GenerationContext (single/family with age, allergies, preferences) */
  generationContextBlock?: string;
  /** Optional suffix appended to system prompt */
  extraSystemSuffix?: string;
  mealType?: string;
  maxCookingTime?: number;
  servings?: number;
  from_plan_replace?: boolean;
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
    // Supabase client с пробросом Authorization, чтобы auth.getUser() и запросы от имени пользователя (members и т.д.) работали
    const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: authHeader ?? "",
          },
        },
      })
      : null;

    if (authHeader && supabase) {
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
      console.log(JSON.stringify({ tag: "AUTH_DEBUG", userId: user?.id ?? null }));

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
      type: reqType = "chat",
      targetIsFamily: reqTargetIsFamily,
      memberId = body.memberId ?? body.childId,
      generationContextBlock: reqGenerationContextBlock,
      extraSystemSuffix: reqExtraSystemSuffix,
      mealType: reqMealType,
      maxCookingTime: reqMaxCookingTime,
      servings: reqServings,
      from_plan_replace: fromPlanReplace = false,
    } = body;
    const type = reqType as "chat" | "recipe" | "sos_consultant" | "balance_check";

    // Неподдерживаемые типы (планы вынесены в generate-plan и др.)
    if (reqType === "single_day" || reqType === "diet_plan") {
      return new Response(
        JSON.stringify({
          error: "unsupported_type",
          message: `Тип запроса "${reqType}" не поддерживается. Используйте функцию генерации плана (generate-plan) или другой endpoint.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const servings = typeof reqServings === "number" && reqServings >= 1 && reqServings <= 20 ? reqServings : 1;

    const recipeTypes = ["recipe", "balance_check"] as const;
    const isRecipeRequestByType = recipeTypes.includes(type as (typeof recipeTypes)[number]);

    // Нормализация: фронт может присылать ageMonths (camelCase), без age_months
    let memberDataNorm = normalizeMemberData(memberDataRaw);
    const reqAllMembersNorm = Array.isArray(reqAllMembersRaw)
      ? reqAllMembersRaw.map((m: MemberData) => {
        const n = normalizeMemberData(m);
        return (n != null ? n : m) as MemberData;
      })
      : reqAllMembersRaw;

    safeLog("DEBUG: Received memberData:", JSON.stringify(memberDataNorm));

    /** Family-mode: не зависит от type. Применяется для chat, recipe и т.п. */
    const targetIsFamilyRaw = reqTargetIsFamily === true || memberId === "family";
    const isFamilyRequest = targetIsFamilyRaw;
    const memberName = isFamilyRequest ? "Семья" : (memberDataNorm?.name?.trim() || "член семьи");

    const userMessage =
      (Array.isArray(messages) && messages.length > 0)
        ? [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content ?? ""
        : "";

    let relevanceAllowed = true;

    if (type === "chat") {
      // 1) Сначала проверка темы Помощника: если запрос про прикорм/аллергию/стул и т.д. — мягкий redirect без вызова модели
      const assistantTopic = detectAssistantTopic(userMessage);
      if (assistantTopic.matched) {
        console.log(JSON.stringify({
          tag: "CHAT_ROUTE",
          route: "assistant_topic",
          requestId,
          topicKey: assistantTopic.topicKey,
          matchedBy: assistantTopic.matchedBy ?? undefined,
          matchedTerms: assistantTopic.matchedTerms ?? [],
        }));
        const assistantMessage = "Этот вопрос лучше задать во вкладке «Помощник».";
        return new Response(
          JSON.stringify({
            message: assistantMessage,
            recipes: [],
            route: "assistant_topic",
            topicKey: assistantTopic.topicKey,
            topicTitle: assistantTopic.topicTitle ?? undefined,
            topicShortTitle: assistantTopic.topicShortTitle ?? undefined,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2) Проверка релевантности запроса для рецепта (food relevance)
      const relevance = checkFoodRelevance(userMessage);
      relevanceAllowed = relevance.allowed;

      safeLog(JSON.stringify({
        tag: "FOOD_RELEVANCE",
        requestId,
        relevance_result: relevance.allowed ? "allow" : "reject",
        reason: relevance.reason,
        matched_terms: relevance.matchedTerms,
        matched_patterns: relevance.matchedPatterns,
        clearly_non_food: relevance.clearlyNonFood,
      }));

      if (!relevanceAllowed) {
        console.log(JSON.stringify({
          tag: "CHAT_ROUTE",
          route: "irrelevant",
          requestId,
          reason: relevance.reason,
          matched_terms: relevance.matchedTerms,
          matched_patterns: relevance.matchedPatterns,
        }));
        const rejectMessage = "В этом чате мы помогаем подбирать блюда. Попробуйте изменить запрос, и мы предложим подходящий вариант.";
        return new Response(
          JSON.stringify({ message: rejectMessage, recipes: [], route: "irrelevant" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(JSON.stringify({
        tag: "CHAT_ROUTE",
        route: "recipe",
        requestId,
      }));
    }

    const isRecipeChat = type === "chat" && relevanceAllowed;
    const isRecipeRequest = isRecipeRequestByType || (type === "chat" && isRecipeChat);

    const targetIsFamily = targetIsFamilyRaw;

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

    // В режиме «Семья»: allMembers из тела или гарантированно из БД по user_id (не по member_id)
    let allMembers: MemberData[] = [];
    if (targetIsFamily) {
      const fromBody = Array.isArray(reqAllMembersNorm) && reqAllMembersNorm.length > 0 ? (reqAllMembersNorm as MemberData[]) : null;
      allMembers = fromBody ?? [];

      if (!allMembers || allMembers.length === 0) {
        if (userId && supabase) {
          const { data, error } = await supabase
            .from("members")
            .select("*")
            .eq("user_id", userId);

          if (error) {
            safeError("Members fetch error", serializeError(error));
            return new Response(
              JSON.stringify({ error: "INTERNAL_ERROR", message: "Ошибка загрузки членов семьи." }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const rows = (data ?? []) as Array<{ id?: string; name?: string; age_months?: number; allergies?: string[]; preferences?: string[]; likes?: string[]; dislikes?: string[] }>;
          allMembers = rows.map((m) => ({
            ...(m.id && { id: m.id }),
            name: m.name,
            age_months: m.age_months ?? 0,
            allergies: m.allergies ?? [],
            ...(m.preferences && { preferences: m.preferences }),
            ...(m.likes && { likes: m.likes }),
            ...(m.dislikes && { dislikes: m.dislikes }),
          })) as MemberData[];
        }
      }

      console.log(JSON.stringify({ tag: "FAMILY_MEMBERS_DEBUG", count: allMembers.length, userId: userId ?? null }));
      console.log(JSON.stringify({ tag: "FAMILY_MEMBERS_FINAL", userId: userId ?? null, count: allMembers?.length ?? 0 }));

      if (allMembers.length === 0) {
        return new Response(
          JSON.stringify({ error: "NO_MEMBERS", message: "Добавьте хотя бы одного члена семьи для режима «Семья»." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Для режима «Семья» — storageMemberId всегда из БД (у allMembers с фронта может не быть id).
    let storageMemberId: string | null = null;
    if (targetIsFamily) {
      if (!userId || !supabase) {
        return new Response(
          JSON.stringify({ error: "unauthorized", message: "Требуется авторизация для режима «Семья»." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      storageMemberId = await resolveFamilyStorageMemberId({ supabase, userId });
      console.log(JSON.stringify({ tag: "FAMILY_STORAGE_ID", userId, storageMemberIdFound: !!storageMemberId }));
      if (!storageMemberId) {
        return new Response(
          JSON.stringify({ error: "NO_MEMBERS", message: "Добавьте хотя бы одного члена семьи, чтобы использовать режим «Семья»." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /** Для записи в БД (recipes, usage_events, plate_logs, chat_history): в режиме Семья — storageMemberId, иначе — выбранный member или null. */
    const memberIdForDb: string | null = targetIsFamily ? storageMemberId : (memberId && memberId !== "family" && /^[0-9a-f-]{36}$/i.test(memberId) ? memberId : null);

    let applyKidFilter = false;
    /** В семейном режиме — только non-infant для агрегации аллергий/лайков/дизлайков; иначе все allMembers. */
    let familyMembersForPrompt: MemberData[] | null = null;
    if (targetIsFamily && allMembers.length > 0) {
      const { membersForPrompt, applyKidFilter: kidFilter } = getFamilyPromptMembers(allMembers as Array<{ age_months?: number | null; allergies?: string[]; dislikes?: string[];[k: string]: unknown }>);
      applyKidFilter = kidFilter;
      memberDataNorm = buildFamilyMemberDataForChat(membersForPrompt as Array<{ age_months?: number | null; allergies?: string[]; dislikes?: string[];[k: string]: unknown }>) as MemberData;
      familyMembersForPrompt = membersForPrompt as MemberData[];
    }

    const primaryForAge =
      targetIsFamily && memberDataNorm ? memberDataNorm : (memberDataNorm ?? (allMembers.length > 0 ? findYoungestMember(allMembers) : null));
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
    let allMembersForPrompt = familyMembersForPrompt ?? allMembers;
    if (!tariffResult.useAllAllergies) {
      memberDataForPrompt = memberDataNorm
        ? { ...memberDataNorm, allergies: (memberDataNorm.allergies ?? []).slice(0, 1) }
        : null;
      allMembersForPrompt = allMembers.map((m) => ({
        ...m,
        allergies: (m.allergies ?? []).slice(0, 1),
      }));
    }

    // Policy block: аллергия/dislikes в запросе — отказ без вызова модели (исключение: «без X»)
    if ((type === "chat" || type === "recipe") && isRecipeRequest) {
      const profileName = targetIsFamily
        ? "Семья"
        : ((memberDataForPrompt?.name ?? (allMembersForPrompt[0]?.name) ?? "выбранного профиля").toString().trim() || "выбранного профиля");
      const allergiesList: string[] = targetIsFamily && allMembersForPrompt.length > 0
        ? [...new Set(allMembersForPrompt.flatMap((m) => m.allergies ?? []))]
        : (memberDataForPrompt?.allergies ?? []);
      const dislikesList: string[] = targetIsFamily && allMembersForPrompt.length > 0
        ? [...new Set(allMembersForPrompt.flatMap((m) => (m as MemberData).dislikes ?? []).filter(Boolean))]
        : ((memberDataForPrompt as MemberData)?.dislikes ?? []);

      const blockedPayload = checkRecipeRequestBlocked({
        userMessage,
        allergiesList,
        dislikesList,
        profileName,
      });
      if (blockedPayload) {
        return new Response(JSON.stringify(blockedPayload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // В режиме «Семья» подменяем generationContextBlock на server-truth (без младенцев <12m, без "Children:", без "safe for ALL children")
    let effectiveGenerationContextBlock: string = typeof reqGenerationContextBlock === "string" ? reqGenerationContextBlock : "";
    if (targetIsFamily && allMembersForPrompt.length > 0) {
      const reqBlock = effectiveGenerationContextBlock.trim();
      if (reqBlock.includes("Children:") || /safe\s+(and\s+)?suitable\s+for\s+ALL\s+children/i.test(reqBlock) || /safe\s+for\s+ALL\s+children/i.test(reqBlock)) {
        console.log(JSON.stringify({ tag: "FAMILY_CTX_OVERRIDDEN" }));
      }
      effectiveGenerationContextBlock = buildFamilyGenerationContextBlock({
        membersForPrompt: allMembersForPrompt as Array<{ name?: string | null; age_months?: number | null; allergies?: string[] | null; dislikes?: string[] | null; likes?: string[] | null;[k: string]: unknown }>,
        applyKidFilter,
      });
    }

    if (type === "chat" || type === "recipe") {
      const templateName = isPremiumUser ? "PREMIUM_RECIPE_TEMPLATE" : "FREE_RECIPE_TEMPLATE";
      const genBlockLen = effectiveGenerationContextBlock.trim().length;
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
      const memberIdForHistory = targetIsFamily ? storageMemberId : (memberId && memberId !== "family" ? memberId : null);
      recentTitleKeys = await fetchRecentTitleKeys(supabase, userId, memberIdForHistory, targetIsFamily);
      if (recentTitleKeys.length > 0) {
        const maxTitles = 5;
        recentTitleKeysLine = "Не повторяй: " + recentTitleKeys.slice(0, maxTitles).join(", ") + ".";
      }
    }

    const tSystemPromptStart = Date.now();
    const promptUserMessage = (type === "sos_consultant" || type === "balance_check") ? userMessage : undefined;
    const mealTypeForPrompt =
      isRecipeRequest && userMessage && isExplicitDishRequest(userMessage) && inferMealTypeFromQuery(userMessage)
        ? inferMealTypeFromQuery(userMessage)!
        : (reqMealType ?? "");
    let systemPrompt = isRecipeRequest
      ? generateRecipeSystemPromptV3(memberDataForPrompt, isPremiumUser, targetIsFamily, allMembersForPrompt, {
        mealType: mealTypeForPrompt,
        maxCookingTime: reqMaxCookingTime,
        servings,
        recentTitleKeysLine,
      })
      : getSystemPromptForType(type, memberDataForPrompt, isPremiumUser, targetIsFamily, allMembersForPrompt, promptUserMessage, effectiveGenerationContextBlock, mealTypeForPrompt, reqMaxCookingTime, servings, recentTitleKeysLine);

    // Раньше для Premium "soft" давали краткий ответ без рецепта; после рефактора relevance только allow/reject — при allow всегда генерируем рецепт, этот блок не используется
    if (false) {
      systemPrompt = "Ты эксперт по питанию Mom Recipes. Отвечай кратко по вопросу пользователя, без генерации рецепта.";
    }

    // Для non-recipe: добавляем age rules, tariff, NO_ARTICLES, GREETING. Для recipe-path (V3) — не аппендим, всё уже в RECIPE_SYSTEM_RULES_V3.
    const ageCategory = ageCategoryForLog;
    if (!isRecipeRequest) {
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
        (type !== "sos_consultant" && type !== "balance_check" ? "\n" + GREETING_STYLE_RULE : "");
    }

    if ((type === "chat" || type === "recipe") && targetIsFamily && !isRecipeRequest) {
      systemPrompt += "\n\n" + applyPromptTemplate(
        FAMILY_RECIPE_INSTRUCTION,
        memberDataForPrompt,
        true,
        allMembersForPrompt
      );
      if (applyKidFilter) {
        systemPrompt += "\n\n" + KID_SAFETY_1_3_INSTRUCTION;
      }
    }

    // Likes: для recipe-path — короткая строка "LIKES (soft): …"; для non-recipe — полная (buildLikesLine/buildLikesLineForProfile). Правило разнообразия — не залипать на одном продукте.
    const likesForPrompt = memberDataForPrompt?.likes ?? [];
    if ((type === "chat" || type === "recipe") && likesForPrompt.length > 0 && shouldFavorLikes({ requestId, userId: userId ?? undefined, mode: type })) {
      if (isRecipeRequest) {
        const joined = likesForPrompt.filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim()).join(", ");
        if (joined) {
          systemPrompt += "\n\nLIKES (soft): " + joined + ".";
          systemPrompt += "\n\n" + LIKES_DIVERSITY_RULE.trim();
        }
      } else {
        const likesLine = targetIsFamily ? buildLikesLine(likesForPrompt) : buildLikesLineForProfile(memberDataForPrompt?.name ?? "профиль", likesForPrompt);
        if (likesLine) {
          systemPrompt += "\n\n" + likesLine;
          systemPrompt += "\n\n" + LIKES_DIVERSITY_RULE.trim();
        }
      }
    }

    const extraSuffix = typeof reqExtraSystemSuffix === "string" ? reqExtraSystemSuffix.trim() : "";
    if (extraSuffix) {
      systemPrompt += "\n\n" + extraSuffix;
    }
    // Разнообразие стиля — только для non-recipe; для recipe-path лишние токены не добавляем
    if (!isRecipeRequest && (type === "chat" || type === "recipe")) {
      systemPrompt += "\n\nРазнообразь стиль описаний. Не используй одни и те же формулировки в нескольких подряд ответах.";
    }
    logPerf("system_prompt", tSystemPromptStart, requestId);

    const isRecipeJsonRequest = (type === "chat" || type === "recipe") && isRecipeRequest;

    let currentSystemPrompt = systemPrompt;
    let assistantMessage = "";
    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown } = {};
    let responseRecipes: Array<Record<string, unknown>> = [];

    safeLog("FINAL_SYSTEM_PROMPT:", currentSystemPrompt.slice(0, 200) + "...");

    const isExpertSoft = false;
    const maxTokensChat =
      type === "chat" && !isExpertSoft ? tariffResult.maxTokens : undefined;
    const promptConfig = {
      maxTokens: isRecipeRequest ? RECIPE_MAX_TOKENS : maxTokensChat ?? (isExpertSoft ? 500 : 8192),
    };
    const messagesForPayload = isRecipeRequest
      ? [{ role: "user" as const, content: userMessage }]
      : messages;
    const payload = {
      model: "deepseek-chat",
      messages: [{ role: "system", content: currentSystemPrompt }, ...messagesForPayload],
      stream: false,
      max_tokens: promptConfig.maxTokens,
      temperature: isRecipeRequest ? 0.4 : 0.7,
      top_p: 0.8,
      repetition_penalty: 1.1,
      ...(isRecipeRequest && { response_format: { type: "json_object" } }),
    };

    const MAIN_LLM_TIMEOUT_MS = isRecipeRequest ? 25000 : (type === "sos_consultant" ? 30000 : 120000);
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
      safeError("deepseek-chat request error", serializeError(error));
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
      safeError("DeepSeek API error", { ...serializeError(new Error(`HTTP ${response.status}`)), status: response.status, body: errorText.slice(0, 500) });
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

    const tBodyStart = Date.now();
    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (err) {
      safeWarn("response.text failed", serializeError(err));
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Не удалось прочитать ответ ИИ. Попробуйте ещё раз." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const llmBodyMs = Date.now() - tBodyStart;
    try {
      data = JSON.parse(bodyText) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    } catch (err) {
      safeWarn("parse response body failed", serializeError(err));
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

    if (isRecipeJsonRequest) {
      const tNormStart = Date.now();
      const parseLog = (msg: string, meta?: Record<string, unknown>) =>
        console.log(JSON.stringify({ tag: "RECIPE_PARSE", requestId, ...meta, msg }));
      let validated: RecipeJson | null = null;
      let usedFallbackRecipe = false;
      resetLastRecipeValidationState();
      const tValidateStart = Date.now();
      const result = validateRecipe(assistantMessage, parseAndValidateRecipeJsonFromString);
      logPerf("recipe_validate_ms", tValidateStart, requestId);
      const parseDiagnostics = getLastRecipeParseDiagnostics();
      logPerf("recipe_local_repair_ms", Date.now() - parseDiagnostics.localRepairMs, requestId, {
        local_repair_applied: parseDiagnostics.localRepairApplied ? 1 : 0,
        repaired_fields_count: parseDiagnostics.repairedFields.length,
      });
      safeLog(JSON.stringify({
        tag: "RECIPE_LOCAL_REPAIR",
        requestId,
        applied: parseDiagnostics.localRepairApplied,
        repairedFields: parseDiagnostics.repairedFields,
        reason: parseDiagnostics.localRepairReason ?? undefined,
        rawMealType: parseDiagnostics.rawMealType ?? undefined,
        normalizedMealType: parseDiagnostics.normalizedMealType ?? undefined,
      }));
      if (result.stage === "ok" && result.valid) {
        validated = result.valid;
        const descOk = passesDescriptionQualityGate(validated.description, { title: validated.title });
        const adviceOk = passesChefAdviceQualityGate(validated.chefAdvice ?? null);
        if (!descOk) {
          safeLog(JSON.stringify({
            tag: "DESCRIPTION_QUALITY_GATE_BYPASSED",
            requestId,
            descriptionQualityGateBypassedBecauseComposerOwnsFinalDescription: true,
          }));
        }
        if (!descOk || !adviceOk) {
          parseLog("quality gate failed", { descOk, adviceOk });
        }
        // Stage 2.3: retry только из-за chef_advice; description не запускает repair/retry — финальный description задаёт composer.
        const needFullRetry = !adviceOk;
        if (needFullRetry && DEEPSEEK_API_KEY) {
          const tQualityRetryStart = Date.now();
          try {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), MAIN_LLM_TIMEOUT_MS);
            const response2 = await fetch("https://api.deepseek.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller2.signal,
            });
            clearTimeout(timeoutId2);
            if (response2.ok) {
              const bodyText2 = await response2.text();
              const data2 = JSON.parse(bodyText2) as { choices?: Array<{ message?: { content?: string } }> };
              const assistantMessage2 = (data2.choices?.[0]?.message?.content ?? "").trim();
              if (assistantMessage2) {
                const result2 = validateRecipe(assistantMessage2, parseAndValidateRecipeJsonFromString);
                if (result2.stage === "ok" && result2.valid && passesChefAdviceQualityGate(result2.valid.chefAdvice ?? null)) {
                  validated = result2.valid;
                  assistantMessage = assistantMessage2;
                  parseLog("quality retry succeeded", {});
                }
              }
            }
          } catch (_e) {
            parseLog("quality retry failed", { keepFirst: true });
          }
          logPerf("quality_retry_llm_ms", tQualityRetryStart, requestId);
        }
      } else {
        const validationErrorMsg = result.stage === "validate" ? getLastValidationError() : null;
        const recoveryDecision = decideRecipeRecovery(result.stage, parseDiagnostics);
        parseLog("first attempt failed", {
          stage: result.stage,
          error: (result as { error?: string }).error ?? validationErrorMsg ?? undefined,
          responseLength: assistantMessage.length,
          localRepairApplied: parseDiagnostics.localRepairApplied,
          repairedFields: parseDiagnostics.repairedFields,
          retryFixJsonInvoked: recoveryDecision.strategy === "llm_retry",
          retryReason: recoveryDecision.reason,
        });
        safeLog(JSON.stringify({
          tag: "RECIPE_RETRY_DECISION",
          requestId,
          stage: result.stage,
          strategy: recoveryDecision.strategy,
          reason: recoveryDecision.reason,
          localRepairApplied: parseDiagnostics.localRepairApplied,
          repairedFields: parseDiagnostics.repairedFields,
          validationDetails: parseDiagnostics.validationDetails,
        }));
        if (recoveryDecision.strategy === "llm_retry" && DEEPSEEK_API_KEY && result.stage !== "ok") {
          const tRetryFixJsonStart = Date.now();
          const retryResult = await retryFixJson({
            apiKey: DEEPSEEK_API_KEY,
            rawResponse: assistantMessage.slice(0, 3500),
            validationError: validationErrorMsg ?? (result as { error?: string }).error ?? "unknown",
            requestId,
            log: parseLog,
          });
          logPerf("retry_fix_json_ms", tRetryFixJsonStart, requestId, { success: retryResult.success ? 1 : 0 });
          if (retryResult.success && retryResult.fixed) {
            const retryValidated = parseAndValidateRecipeJsonFromString(retryResult.fixed);
            if (retryValidated) {
              validated = retryValidated;
              parseLog("retry succeeded", { retrySuccess: true });
            } else {
              parseLog("retry returned invalid JSON, using fallback", { retrySuccess: false });
              validated = getRecipeOrFallback(assistantMessage);
              usedFallbackRecipe = true;
            }
          } else {
            parseLog("retry failed or empty, using fallback", { retrySuccess: false });
            validated = getRecipeOrFallback(assistantMessage);
            usedFallbackRecipe = true;
          }
        } else if (recoveryDecision.strategy === "fail_fast") {
          parseLog("non-retryable validation error", {
            retryFixJsonInvoked: false,
            retryReason: recoveryDecision.reason,
            validationDetails: parseDiagnostics.validationDetails,
          });
          validated = getRecipeOrFallback(assistantMessage);
          usedFallbackRecipe = true;
        } else {
          validated = getRecipeOrFallback(assistantMessage);
        }
      }
      if (validated) {
        const tIngredientNormalizeStart = Date.now();
        if (ingredientsNeedAmountRetry(validated.ingredients)) {
          applyIngredientsFallbackHeuristic(validated.ingredients as Array<Record<string, unknown> & { name?: string; amount?: string; displayText?: string; canonical?: { amount: number; unit: string } | null }>);
          safeLog("Recipe ingredients: applied heuristic fallback (retry disabled)", requestId);
        }
        logPerf("ingredient_normalize_ms", tIngredientNormalizeStart, requestId);
        // Stage 2.4: LLM description — основной источник; composer только fallback при невалидном description.
        const desc = (validated as { description?: string }).description;
        const advice = validated.chefAdvice ?? "";
        if (isDescriptionInvalid(desc, { title: validated.title })) {
          const composed = composeRecipeDescription({
            title: validated.title ?? "",
            mealType: validated.mealType ?? undefined,
            ingredients: validated.ingredients ?? [],
          });
          (validated as Record<string, unknown>).description = composed.text;
        }
        if (!advice.trim() || shouldReplaceChefAdvice(advice)) {
          const ingNames = Array.isArray(validated.ingredients)
            ? validated.ingredients.map((i) => (i && typeof i === "object" && "name" in i ? String((i as { name?: string }).name) : "")).filter(Boolean)
            : [];
          const stepStrs = Array.isArray(validated.steps) ? validated.steps.map((s) => (typeof s === "string" ? s : "").trim()).filter(Boolean) : [];
          const seed = (validated.title ?? "") + (ingNames[0] ?? "") + (stepStrs[0] ?? "");
          (validated as Record<string, unknown>).chefAdvice = buildChefAdviceFallback({
            title: validated.title,
            ingredients: ingNames,
            steps: stepStrs,
            recipeIdSeed: seed,
          });
        }
        assistantMessage = JSON.stringify(validated);
        responseRecipes = [validated as Record<string, unknown>];
      }
      if (!validated) {
        validated = getRecipeOrFallback(assistantMessage);
        parseLog("using fallback recipe (nutrition may be null)", { responseLength: assistantMessage.length });
        responseRecipes = [validated as Record<string, unknown>];
        assistantMessage = JSON.stringify(validated);
        usedFallbackRecipe = true;
      }
      safeLog(JSON.stringify({
        tag: "RECIPE_VALIDATION_RESULT",
        requestId,
        finalValidated: !!validated,
        usedFallback: usedFallbackRecipe,
      }));
      logPerf("normalize_ingredients", tNormStart, requestId);
      logPerf("validation_done", tValidateStart, requestId);
    }

    // Учёт по фичам для лимитов Free (Plan/Help не тратят chat_recipe) (Plan/Help не тратят chat_recipe)
    if (userId && supabase) {
      if (type === "sos_consultant") {
        await supabase.from("usage_events").insert({ user_id: userId, member_id: null, feature: "help" });
      } else if ((type === "chat" || type === "recipe") && responseRecipes.length > 0 && !fromPlanReplace) {
        await supabase.from("usage_events").insert({ user_id: userId, member_id: memberIdForDb, feature: "chat_recipe" });
      }
    }

    if (type === "balance_check" && userId && supabase) {
      await supabase.from("plate_logs").insert({
        user_id: userId,
        member_id: memberIdForDb,
        user_message: userMessage,
        assistant_message: assistantMessage,
      });
    }

    // Учёт токенов по типу действия (рецепт в чате, план на неделю, Мы рядом и т.д.). Пишем только при авторизованном user_id (RLS требует auth.uid() = user_id).
    const usageObj = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number } | undefined;
    if (usageObj && supabase && userId) {
      const inputTokens = usageObj.prompt_tokens ?? usageObj.input_tokens ?? 0;
      const outputTokens = usageObj.completion_tokens ?? usageObj.output_tokens ?? 0;
      const totalTokens = usageObj.total_tokens ?? inputTokens + outputTokens;
      const actionType =
        fromPlanReplace ? "plan_replace"
          : type === "sos_consultant" ? "sos_consultant"
            : type === "balance_check" ? "balance_check"
              : (type === "chat" || type === "recipe") ? "chat_recipe"
                : "other";
      // Лог для сравнения input_tokens до/после сокращения промпта (recipe-path V3)
      if (actionType === "chat_recipe") {
        console.log(JSON.stringify({ tag: "CHAT_RECIPE_INPUT_TOKENS", requestId, input_tokens: inputTokens, output_tokens: outputTokens }));
      }
      await supabase.from("token_usage_log").insert({
        user_id: userId,
        action_type: actionType,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      }).then(({ error }) => {
        if (error) safeWarn("token_usage_log insert failed", serializeError(error));
      });
    }

    if (responseRecipes.length > 0) {
      const recipe = responseRecipes[0] as RecipeJson;
      const descRaw = sanitizeMealMentions(sanitizeRecipeText(recipe.description ?? ""));
      const adviceRaw = sanitizeMealMentions(sanitizeRecipeText(recipe.chefAdvice ?? ""));
      const title = (recipe.title ?? "").trim();
      const keyIngredient = Array.isArray(recipe.ingredients) && recipe.ingredients[0] && typeof recipe.ingredients[0] === "object" && (recipe.ingredients[0] as { name?: string }).name
        ? String((recipe.ingredients[0] as { name: string }).name)
        : undefined;
      const steps = Array.isArray(recipe.steps) ? recipe.steps.map((s) => (typeof s === "string" ? s : "").trim()).filter(Boolean) : [];
      const recipeIdSeed = title + (keyIngredient ?? "") + (steps[0] ?? "");
      const descForPool = sanitizeDescriptionForPool(descRaw, title, recipeIdSeed);
      const adviceForPool = sanitizeChefAdviceForPool(adviceRaw, recipeIdSeed);
      const rawChefAdviceFromModel = (recipe.chefAdvice ?? "").trim();
      safeLog(JSON.stringify({
        tag: "RECIPE_RAW_CHEF_ADVICE",
        requestId,
        rawChefAdviceLength: rawChefAdviceFromModel.length,
        rawChefAdvice: rawChefAdviceFromModel.slice(0, 400),
      }));
      const ingNamesForEnforce = Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => (i && typeof i === "object" && "name" in i ? String((i as { name: string }).name) : "")).filter(Boolean) : [];
      const descriptionInvalid = isDescriptionInvalid(descRaw, { title });
      let descriptionSource: "llm" | "composer_fallback" = "llm";
      let composerVariantForLog: string | undefined;
      if (descriptionInvalid) {
        const composed = composeRecipeDescription({
          title,
          mealType: recipe.mealType ?? undefined,
          ingredients: recipe.ingredients ?? [],
        });
        (recipe as Record<string, unknown>).description = composed.text;
        descriptionSource = "composer_fallback";
        composerVariantForLog = composed.variantId;
      } else {
        (recipe as Record<string, unknown>).description = descRaw.slice(0, 160);
      }
      (recipe as Record<string, unknown>).chefAdvice = enforceChefAdvice(adviceForPool, {
        title,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => (i && typeof i === "object" && "name" in i ? String((i as { name: string }).name) : "")).filter(Boolean) : undefined,
        steps,
        recipeIdSeed,
      });
      const consistency = checkTitleIngredientConsistency(title, ingNamesForEnforce);
      if (consistency.triggered) {
        safeLog(JSON.stringify({
          tag: "TITLE_INGREDIENT_CONSISTENCY_GUARD",
          requestId,
          titleIngredientConsistencyGuardTriggered: true,
          consistencyMismatchKeys: consistency.mismatchKeys,
        }));
        if (consistency.suggestedTitle && consistency.suggestedTitle.trim().length >= 2) {
          (recipe as Record<string, unknown>).title = consistency.suggestedTitle.trim();
          safeLog(JSON.stringify({ tag: "TITLE_INGREDIENT_CONSISTENCY_GUARD", requestId, titleNormalized: true }));
        }
      }
      const currentTitle = (recipe.title ?? "") as string;
      const currentDesc = (recipe.description ?? "") as string;
      const currentAdvice = (recipe.chefAdvice ?? "") as string;
      const leak = checkRequestContextLeak(currentTitle, currentDesc, currentAdvice);
      if (leak.triggered) {
        if (leak.suggestedTitle && leak.suggestedTitle.trim().length >= 2) {
          (recipe as Record<string, unknown>).title = leak.suggestedTitle.trim();
        }
        if (leak.descriptionUseComposer) {
          const recomposed = composeRecipeDescription({
            title: (recipe.title ?? currentTitle) as string,
            mealType: recipe.mealType ?? undefined,
            ingredients: recipe.ingredients ?? [],
          });
          (recipe as Record<string, unknown>).description = recomposed.text;
          descriptionSource = "composer_fallback";
          composerVariantForLog = recomposed.variantId;
        }
        if (leak.chefAdviceUseFallback) {
          (recipe as Record<string, unknown>).chefAdvice = buildChefAdviceFallback({
            title: recipe.title,
            ingredients: ingNamesForEnforce,
            steps,
            recipeIdSeed,
          });
        }
      }
      const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
      let stepsLeakDetected = false;
      let stepsLeakCount = 0;
      const cleanedSteps = rawSteps.map((s: unknown) => {
        const step = typeof s === "string" ? s : "";
        if (!textContainsRequestContextLeak(step)) return step;
        stepsLeakDetected = true;
        stepsLeakCount += 1;
        return cleanStepFromRequestContextLeak(step);
      });
      if (stepsLeakDetected && cleanedSteps.length > 0) {
        (recipe as Record<string, unknown>).steps = cleanedSteps;
      }
      if (leak.triggered || stepsLeakDetected) {
        safeLog(JSON.stringify({
          tag: "REQUEST_CONTEXT_LEAK_GUARD",
          requestId,
          requestContextLeakGuardTriggered: leak.triggered,
          ...(leak.triggered ? { requestContextLeakFields: leak.leakFields } : {}),
          stepsLeakDetected,
          stepsLeakCleaned: stepsLeakDetected,
          stepsLeakCount,
        }));
      }
      const lexiconResult = checkTitleLexicon((recipe.title ?? "") as string);
      if (lexiconResult.triggered && lexiconResult.normalizedTitle) {
        safeLog(JSON.stringify({
          tag: "TITLE_LEXICON_GUARD",
          requestId,
          titleLexiconGuardTriggered: true,
          titleLexiconNormalized: true,
        }));
        (recipe as Record<string, unknown>).title = lexiconResult.normalizedTitle;
      }
      assistantMessage = JSON.stringify(recipe);
      const finalChefAdvice = (recipe.chefAdvice as string) ?? "";
      const chefAdviceReplacedWithFallback = finalChefAdvice !== adviceForPool;
      if (chefAdviceReplacedWithFallback) {
        safeLog(JSON.stringify({ tag: "CHEF_ADVICE_REPLACED_WITH_FALLBACK", requestId }));
      }
      safeLog(JSON.stringify({
        tag: "RECIPE_SANITIZED",
        requestId,
        descriptionSource,
        composerVariant: composerVariantForLog,
        descriptionLength: (recipe.description as string)?.length,
        chefAdviceLength: finalChefAdvice.length,
        titleIngredientConsistencyGuardTriggered: consistency.triggered,
        ...(consistency.triggered ? { consistencyMismatchKeys: consistency.mismatchKeys } : {}),
        requestContextLeakGuardTriggered: leak.triggered,
        ...(leak.triggered ? { requestContextLeakFields: leak.leakFields } : {}),
        titleLexiconGuardTriggered: lexiconResult.triggered,
        titleLexiconNormalized: lexiconResult.triggered && !!lexiconResult.normalizedTitle,
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
    let authRequiredToSave = false;
    if (responseRecipes.length > 0 && !fromPlanReplace) {
      if (!userId || !authHeader) {
        safeLog(JSON.stringify({ tag: "auth_failed", step: "save_recipe", requestId }));
        authRequiredToSave = true;
        // Не возвращаем 401 — отдаём рецепт в теле, чтобы пользователь увидел результат; сохранение недоступно без авторизации.
      } else {
      const validatedRecipe = responseRecipes[0] as RecipeJson;
      const chefAdviceToSave: string | null = validatedRecipe.chefAdvice ?? null;
      safeLog(JSON.stringify({
        tag: "ADVICE_GATE",
        requestId,
        savedChefAdvice: chefAdviceToSave != null && chefAdviceToSave.trim().length > 0,
      }));
      const supabaseUser = SUPABASE_URL && SUPABASE_ANON_KEY && authHeader
        ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        })
        : null;
      if (supabaseUser) {
        const tDbStart = Date.now();
        try {
          const memberIdForRecipe = memberIdForDb;
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
          type IngLike = { name?: string; amount?: string; displayText?: string; canonical?: { amount: number; unit: string } | null };
          const buildOneIngredient = (ing: string | IngLike, idx: number) => {
            const nameStr = typeof ing === "string" ? ing : (ing?.name ?? "Ингредиент");
            const displayText = typeof ing === "string" ? ing : (ing?.displayText ?? (ing?.amount ? `${ing.name ?? ""} — ${ing.amount}` : ing.name ?? ""));
            const rawAmount = typeof ing === "object" && ing?.amount != null ? String(ing.amount) : "";
            const amountStr = rawAmount.trim() || amountFromDisplayText(displayText, nameStr);
            const canonical = typeof ing === "object" && ing?.canonical ? ing.canonical : null;
            const parsed = canonical ?? (amountStr ? parseAmountToCanonical(amountStr) : null);
            const numericAmountOnly = parsed?.amount != null ? String(parsed.amount) : (amountStr && /^\d+\.?\d*$/.test(amountStr.trim()) ? amountStr.trim() : null);
            return {
              name: nameStr,
              amount: numericAmountOnly,
              display_text: displayText || (amountStr ? `${nameStr} — ${amountStr}` : nameStr),
              canonical_amount: parsed?.amount ?? null,
              canonical_unit: parsed?.unit ?? null,
            };
          };
          const ingredientsPayload = rawIngredients.length >= 3
            ? rawIngredients.map((ing: IngLike, idx: number) => buildOneIngredient(ing, idx))
            : [
              ...rawIngredients.map((ing: IngLike, idx: number) => buildOneIngredient(ing, idx)),
              ...Array.from({ length: 3 - rawIngredients.length }, (_, i) => ({
                name: `Ингредиент ${rawIngredients.length + i + 1}`,
                amount: null,
                display_text: null,
                canonical_amount: null,
                canonical_unit: null,
              })),
            ];
          const ageRange = AGE_RANGE_BY_CATEGORY[ageCategoryForLog] ?? AGE_RANGE_BY_CATEGORY.adult;
          const minAge = Number.isFinite(ageRange?.min) ? ageRange!.min : 6;
          const maxAge = Number.isFinite(ageRange?.max) ? ageRange!.max : 36;
          const cookingMinutes =
            typeof validatedRecipe.cookingTimeMinutes === "number" ? validatedRecipe.cookingTimeMinutes
              : typeof (validatedRecipe as { cookingTime?: number }).cookingTime === "number" ? (validatedRecipe as { cookingTime: number }).cookingTime
                : null;
          const n = validatedRecipe.nutrition ?? null;
          const baseTags = (validatedRecipe as { tags?: string[] }).tags ?? [];
          const recipeTags = targetIsFamily ? [...baseTags, "family", ...(applyKidFilter ? ["kid_1_3_safe"] : [])] : baseTags;
          const payload = canonicalizeRecipePayload({
            user_id: userId,
            member_id: memberIdForRecipe,
            child_id: memberIdForRecipe,
            source: "chat_ai",
            mealType: validatedRecipe.mealType ?? null,
            tags: recipeTags.length > 0 ? recipeTags : null,
            title: validatedRecipe.title ?? "Рецепт",
            description: validatedRecipe.description ?? null,
            cooking_time_minutes: cookingMinutes,
            calories: n?.kcal_per_serving != null ? Math.round(n.kcal_per_serving) : null,
            proteins: n?.protein_g_per_serving ?? null,
            fats: n?.fat_g_per_serving ?? null,
            carbs: n?.carbs_g_per_serving ?? null,
            chef_advice: chefAdviceToSave,
            advice: null,
            steps: stepsPayload,
            ingredients: ingredientsPayload,
            sourceTag: "chat",
            servings: (validatedRecipe as { servings?: number }).servings ?? 1,
            nutrition: n,
            min_age_months: minAge,
            max_age_months: maxAge,
            locale: "ru",
            source_lang: null,
            trust_level: "candidate",
          });
          console.log(JSON.stringify({
            tag: "RECIPE_SAVE_PAYLOAD_DEBUG",
            requestId,
            subscriptionStatus,
            memberIdForDb: memberIdForRecipe,
            ageCategoryForLog,
            ageRange: { min: minAge, max: maxAge },
            cooking_time_minutes: (payload as Record<string, unknown>).cooking_time_minutes,
            min_age_months: (payload as Record<string, unknown>).min_age_months,
            max_age_months: (payload as Record<string, unknown>).max_age_months,
            calories: (payload as Record<string, unknown>).calories ?? n?.kcal_per_serving,
            proteins: (payload as Record<string, unknown>).proteins ?? n?.protein_g_per_serving,
            fats: (payload as Record<string, unknown>).fats ?? n?.fat_g_per_serving,
            carbs: (payload as Record<string, unknown>).carbs ?? n?.carbs_g_per_serving,
            nutrition_present: !!n,
            ing0: ingredientsPayload[0] ? { display_text: (ingredientsPayload[0] as Record<string, unknown>).display_text, canonical_amount: (ingredientsPayload[0] as Record<string, unknown>).canonical_amount, canonical_unit: (ingredientsPayload[0] as Record<string, unknown>).canonical_unit } : null,
            ing1: ingredientsPayload[1] ? { display_text: (ingredientsPayload[1] as Record<string, unknown>).display_text, canonical_amount: (ingredientsPayload[1] as Record<string, unknown>).canonical_amount, canonical_unit: (ingredientsPayload[1] as Record<string, unknown>).canonical_unit } : null,
          }));
          const nullFields: string[] = [];
          if ((payload as Record<string, unknown>).cooking_time_minutes == null) nullFields.push("cooking_time_minutes");
          if ((payload as Record<string, unknown>).min_age_months == null) nullFields.push("min_age_months");
          if ((payload as Record<string, unknown>).max_age_months == null) nullFields.push("max_age_months");
          if ((payload as Record<string, unknown>).calories == null) nullFields.push("calories");
          if ((payload as Record<string, unknown>).proteins == null) nullFields.push("proteins");
          if ((payload as Record<string, unknown>).fats == null) nullFields.push("fats");
          if ((payload as Record<string, unknown>).carbs == null) nullFields.push("carbs");
          if (nullFields.length > 0) {
            console.log(JSON.stringify({ tag: "RECIPE_SAVE_NULL_FIELDS", requestId, nullFields }));
          }
          const { data: recipeId, error: rpcErr } = await supabaseUser.rpc("create_recipe_with_steps", { payload });
          if (rpcErr) throw rpcErr;
          savedRecipeId = recipeId ?? null;
          if (savedRecipeId) {
            safeLog(JSON.stringify({ tag: "RECIPE_SAVED", recipeIdSuffix: savedRecipeId.slice(-6), requestId }));
          }
        } catch (err) {
          safeWarn("Failed to save recipe to DB, continuing without recipe_id:", serializeError(err));
        }
        logPerf("db_insert", tDbStart, requestId);
      }
      }
    }

    if (type === "sos_consultant") {
      safeLog("[help]", { requestId, durationMs: Date.now() - startedAt, status: "ok" });
    }
    const responseBody: { message: string; recipes?: Array<Record<string, unknown>>; recipe_id?: string | null; usage?: unknown; auth_required_to_save?: boolean } = {
      message: assistantMessage,
      usage: data.usage,
    };
    if (responseRecipes.length > 0) {
      responseBody.recipes = responseRecipes;
    }
    if (savedRecipeId) {
      responseBody.recipe_id = savedRecipeId;
      // ML-5: fire-and-forget post-save translation for backend-saved recipes (client does not call createRecipe for this path)
      if (authHeader && SUPABASE_URL) {
        const targetLocaleRaw = (body as { target_locale?: string }).target_locale;
        const targetLocale =
          typeof targetLocaleRaw === "string" && targetLocaleRaw.trim()
            ? targetLocaleRaw.trim().toLowerCase().split("-")[0]
            : "en";
        const translateUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/translate-recipe`;
        fetch(translateUrl, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ recipe_id: savedRecipeId, target_locale: targetLocale }),
        }).catch((err) => {
          safeWarn("translate-recipe trigger failed (non-blocking):", serializeError(err));
        });
      }
    }
    if (authRequiredToSave) {
      responseBody.auth_required_to_save = true;
    }
    logPerf("total_ms", t0, requestId);
    safeLog(JSON.stringify({ tag: "LATENCY_AUDIT", requestId, total_ms: Date.now() - t0, latencyPhase: "response_returned" }));
    return new Response(
      JSON.stringify(responseBody),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errRequestId = req.headers.get("x-request-id") ?? req.headers.get("sb-request-id") ?? "";
    safeError("Error in deepseek-chat:", serializeError(error));
    safeLog("[help]", { requestId: errRequestId, status: "error" });
    logPerf("total_ms", t0, errRequestId);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
