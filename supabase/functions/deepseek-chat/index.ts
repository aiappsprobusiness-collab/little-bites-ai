/**
 * deepseek-chat: чат-рецепт (JSON), SOS-консультант, анализ тарелки.
 *
 * Поддерживаемые type: chat, recipe (один рецепт в JSON), sos_consultant, balance_check.
 * Ответ всегда JSON (без SSE). Рецепт: message + recipes[] + recipe_id при авторизации.
 * Семейный режим: дети <12 мес исключаются из учёта; 12–35 мес — kid safety (тег kid_1_3_safe).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRelevantQuery, isRelevantPremiumQuery } from "./isRelevantQuery.ts";
import {
  NO_ARTICLES_RULE,
  GREETING_STYLE_RULE,
  FAMILY_RECIPE_INSTRUCTION,
  KID_SAFETY_1_3_INSTRUCTION,
} from "./prompts.ts";
import { getAgeCategory, getAgeCategoryRules } from "./ageCategory.ts";
import { buildPromptByProfileAndTariff } from "./promptByTariff.ts";
import { safeLog, safeError, safeWarn } from "../_shared/safeLogger.ts";
import { canonicalizeRecipePayload } from "../_shared/recipeCanonical.ts";
import { serializeError } from "../_shared/logging.ts";
import { parseAndValidateRecipeJsonFromString, getRecipeOrFallback, getLastValidationError, ingredientsNeedAmountRetry, applyIngredientsFallbackHeuristic, type RecipeJson } from "./recipeSchema.ts";
import { getSystemPromptForType, applyPromptTemplate, normalizeMemberData, findYoungestMember, getAgeMonths, type MemberData } from "./buildPrompt.ts";
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
  buildRecipeDescription,
  buildChefAdvice,
  shouldReplaceDescription,
  shouldReplaceChefAdvice,
  isDescriptionIncomplete,
  repairDescriptionOnly,
  sanitizeRecipeText,
  sanitizeMealMentions,
  getMinimalRecipe,
} from "./domain/recipe_io/index.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Ограничение длины ответа рецепта: меньше токенов — быстрее генерация (целевой порядок 15–18 с вместо 20+). */
const RECIPE_MAX_TOKENS = 1536;

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
  /** Structured prompt block from GenerationContext (single/family with age, allergies, preferences, difficulty) */
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
          const rows = (data ?? []) as Array<{ id?: string; name?: string; age_months?: number; allergies?: string[]; preferences?: string[]; likes?: string[]; dislikes?: string[]; difficulty?: string }>;
          allMembers = rows.map((m) => ({
            ...(m.id && { id: m.id }),
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
      const { membersForPrompt, applyKidFilter: kidFilter } = getFamilyPromptMembers(allMembers as Array<{ age_months?: number | null; allergies?: string[]; dislikes?: string[]; [k: string]: unknown }>);
      applyKidFilter = kidFilter;
      memberDataNorm = buildFamilyMemberDataForChat(membersForPrompt as Array<{ age_months?: number | null; allergies?: string[]; dislikes?: string[]; [k: string]: unknown }>) as MemberData;
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
        membersForPrompt: allMembersForPrompt as Array<{ name?: string | null; age_months?: number | null; allergies?: string[] | null; dislikes?: string[] | null; likes?: string[] | null; [k: string]: unknown }>,
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
        recentTitleKeysLine = "Не повторять: " + recentTitleKeys.slice(0, 12).join(", ") + ".";
      }
    }

    const tSystemPromptStart = Date.now();
    const promptUserMessage = (type === "sos_consultant" || type === "balance_check") ? userMessage : undefined;
    const mealTypeForPrompt =
      isRecipeRequest && userMessage && isExplicitDishRequest(userMessage) && inferMealTypeFromQuery(userMessage)
        ? inferMealTypeFromQuery(userMessage)!
        : (reqMealType ?? "");
    let systemPrompt =
      getSystemPromptForType(type, memberDataForPrompt, isPremiumUser, targetIsFamily, allMembersForPrompt, promptUserMessage, effectiveGenerationContextBlock, mealTypeForPrompt, reqMaxCookingTime, servings, recentTitleKeysLine);

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

    if ((type === "chat" || type === "recipe") && targetIsFamily) {
      systemPrompt += "\n\n" + applyPromptTemplate(
        FAMILY_RECIPE_INSTRUCTION,
        memberDataForPrompt,
        true,
        allMembersForPrompt
      );
      if (applyKidFilter) {
        systemPrompt += "\n\n" + KID_SAFETY_1_3_INSTRUCTION;
      }
      const likesForPrompt = memberDataForPrompt?.likes ?? [];
      if (isRecipeRequest && likesForPrompt.length > 0 && shouldFavorLikes({ requestId, userId: userId ?? undefined, mode: type })) {
        const likesLine = buildLikesLine(likesForPrompt);
        if (likesLine) systemPrompt += "\n\n" + likesLine;
      }
    } else if ((type === "chat" || type === "recipe") && isRecipeRequest && memberDataForPrompt?.likes?.length) {
      // Обычный профиль: в ~20% запросов явно добавляем приоритет лайков (как для Семьи), чтобы не перебирать с любимым ингредиентом
      if (shouldFavorLikes({ requestId, userId: userId ?? undefined, mode: type })) {
        const likesLine = buildLikesLineForProfile(memberDataForPrompt.name ?? "профиль", memberDataForPrompt.likes ?? []);
        if (likesLine) systemPrompt += "\n\n" + likesLine;
      }
    }

    const extraSuffix = typeof reqExtraSystemSuffix === "string" ? reqExtraSystemSuffix.trim() : "";
    if (extraSuffix) {
      systemPrompt += "\n\n" + extraSuffix;
    }
    if (isRecipeRequest && (type === "chat" || type === "recipe")) {
      systemPrompt += "\n\nРазнообразь стиль описаний. Не используй одни и те же формулировки в нескольких подряд ответах.";
    }
    logPerf("system_prompt", tSystemPromptStart, requestId);

    const isRecipeJsonRequest = (type === "chat" || type === "recipe") && isRecipeRequest;

    let currentSystemPrompt = systemPrompt;
    let assistantMessage = "";
    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown } = {};
    let responseRecipes: Array<Record<string, unknown>> = [];

    safeLog("FINAL_SYSTEM_PROMPT:", currentSystemPrompt.slice(0, 200) + "...");

      const isExpertSoft = type === "chat" && isPremiumUser && premiumRelevance === "soft";
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
          responseRecipes = [validated as Record<string, unknown>];
          assistantMessage = JSON.stringify(validated);
        }
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
          if (savedRecipeId) {
            safeLog(JSON.stringify({ tag: "RECIPE_SAVED", recipeIdSuffix: savedRecipeId.slice(-6), requestId }));
          }
        } catch (err) {
          safeWarn("Failed to save recipe to DB, continuing without recipe_id:", serializeError(err));
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
