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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  options?: { weekContext?: string; userMessage?: string; generationContextBlock?: string }
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
  if (targetIsFamily && allMembers.length > 0) {
    allMembers.forEach((m) => (m as MemberData).preferences?.forEach((p) => p?.trim() && preferencesSet.add(p.trim())));
  } else if ((primaryMember as MemberData)?.preferences?.length) {
    (primaryMember as MemberData).preferences!.forEach((p) => p?.trim() && preferencesSet.add(p.trim()));
  }
  const preferencesText = preferencesSet.size > 0 ? Array.from(preferencesSet).join(", ") : "не указано";
  const primaryDifficulty = (primaryMember as MemberData)?.difficulty?.trim();
  const difficultyText = primaryDifficulty === "easy" ? "Простые" : primaryDifficulty === "medium" ? "Средние" : primaryDifficulty === "any" ? "Любые" : "не указано";

  const ageCategory = getAgeCategory(rawMonths === 999 ? 0 : rawMonths);
  const ageRule = ageCategory in AGE_CONTEXTS ? AGE_CONTEXTS[ageCategory as keyof typeof AGE_CONTEXTS] : AGE_CONTEXTS.adult;
  const weekContext = options?.weekContext?.trim() || "";
  const userMessage = options?.userMessage?.trim() || "";
  const generationContextBlock = options?.generationContextBlock?.trim() || "";

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
    .split("{{familyContext}}").join(familyContext)
    .split("{{userMessage}}").join(userMessage);

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
      [/\{\{\s*familyContext\s*\}\}/g, familyContext],
      [/\{\{\s*userMessage\s*\}\}/g, userMessage],
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
  generationContextBlock?: string
): string {
  const genBlockOpt = generationContextBlock?.trim() ? { generationContextBlock: generationContextBlock.trim() } : undefined;
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, memberData, targetIsFamily, allMembers, genBlockOpt);
  }
  if (type === "recipe" || type === "diet_plan") {
    const template = isPremium ? PREMIUM_RECIPE_TEMPLATE : FREE_RECIPE_TEMPLATE;
    return applyPromptTemplate(template, memberData, targetIsFamily, allMembers, genBlockOpt);
  }
  if (type === "single_day") {
    const ctx = weekContext?.trim()
      ? `Уже запланировано: ${weekContext.trim()}. Сделай этот день максимально непохожим на уже запланированные.`
      : "";
    return applyPromptTemplate(SINGLE_DAY_PLAN_TEMPLATE, memberData, targetIsFamily, allMembers, { weekContext: ctx, ...genBlockOpt });
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
  dayName?: string;
  weekContext?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    type ProfileRow = { subscription_status?: string | null } | null;
    let profile: ProfileRow = null;
    type ProfileV2Row = { status: string; requests_today: number; daily_limit: number } | null;
    let profileV2: (ProfileV2Row & { premium_until?: string | null }) | null = null;

    // Создаём supabase клиент на уровне всего handler-а
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (authHeader && supabase) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;

      if (userId) {
        // Загружаем profiles_v2 (включая premium_until для trial)
        const { data: profileV2Row } = await supabase
          .from("profiles_v2")
          .select("status, requests_today, daily_limit, premium_until")
          .eq("user_id", userId)
          .maybeSingle();

        profileV2 = profileV2Row as (ProfileV2Row & { premium_until?: string | null }) | null;

        // Trial: если истёк (now > premium_until), переводим в free и daily_limit = 5
        if (profileV2?.status === "trial" && profileV2.premium_until) {
          const until = new Date(profileV2.premium_until).getTime();
          if (Date.now() > until) {
            await supabase
              .from("profiles_v2")
              .update({ status: "free", daily_limit: 5 })
              .eq("user_id", userId);
            profileV2 = {
              status: "free",
              requests_today: profileV2.requests_today,
              daily_limit: 5,
            };
          }
        }

        // ТЕСТ ЛИМИТА (Free): status='free', requests_today=5, daily_limit=5 → сразу 429, DeepSeek не вызывается.
        // ТЕСТ PREMIUM: status='premium' → запросы проходят даже при requests_today > daily_limit.
        if (profileV2) {
          const isPremiumOrTrial = profileV2.status === "premium" || profileV2.status === "trial";
          if (!isPremiumOrTrial && profileV2.requests_today >= profileV2.daily_limit) {
            return new Response(
              JSON.stringify({
                error: "usage_limit_exceeded",
                message: "Дневной лимит исчерпан. Перейдите на Premium для безлимитного доступа.",
                remaining: 0,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Нет строки в profiles_v2 — fallback на старую проверку (profiles + user_usage)
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

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("subscription_status")
          .eq("user_id", userId)
          .maybeSingle();
        if (profileError) {
          console.warn("Profile fetch error (treating as free):", profileError.message);
          profile = null;
        } else {
          profile = profileRow as ProfileRow;
        }
      }
    }

    const subscriptionStatus = (profileV2?.status ?? profile?.subscription_status ?? "free") as string;
    const isPremiumUser = subscriptionStatus === "premium" || subscriptionStatus === "trial";

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
    } = body;

    const recipeTypes = ["recipe", "single_day", "diet_plan", "balance_check"] as const;
    const isRecipeRequestByType = recipeTypes.includes(type as (typeof recipeTypes)[number]);

    // Нормализация: фронт может присылать ageMonths (camelCase), без age_months
    const memberDataNorm = normalizeMemberData(memberDataRaw);
    const reqAllMembersNorm = Array.isArray(reqAllMembersRaw)
      ? reqAllMembersRaw.map((m: MemberData) => {
        const n = normalizeMemberData(m);
        return (n != null ? n : m) as MemberData;
      })
      : reqAllMembersRaw;

    console.log("DEBUG: Received memberData:", JSON.stringify(memberDataNorm));

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

    const isRecipeChat =
      type === "chat" && (isPremiumUser ? premiumRelevance === true : true);
    const isRecipeRequest = isRecipeRequestByType || (type === "chat" && isRecipeChat);
    const stream =
      isRecipeRequest || type === "sos_consultant" || type === "balance_check"
        ? false
        : reqStream;

    const targetIsFamily =
      type === "chat" && (reqTargetIsFamily === true || memberId === "family");

    // SOS-консультант — только Premium (проверка profiles_v2)
    if (type === "sos_consultant") {
      if (!isPremiumUser) {
        return new Response(
          JSON.stringify({
            error: "premium_required",
            message: "Доступно в Premium. Оформите подписку для доступа к SOS-консультанту.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          .select("name, age_months, allergies")
          .eq("user_id", userId);

        if (!membersError && rows) {
          allMembers = rows.map((m: { name?: string; age_months?: number; allergies?: string[] }) => ({
            name: m.name,
            age_months: m.age_months ?? 0,
            allergies: m.allergies ?? [],
          }));
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
    console.log("DEBUG: Final age category determined:", ageCategoryForLog, "Months:", ageMonthsForCategory);
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

    if (type === "chat" || type === "recipe" || type === "diet_plan") {
      const templateName = isPremiumUser ? "PREMIUM_RECIPE_TEMPLATE" : "FREE_RECIPE_TEMPLATE";
      const genBlockLen = typeof reqGenerationContextBlock === "string" ? reqGenerationContextBlock.trim().length : 0;
      console.log(
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

    const promptUserMessage = (type === "sos_consultant" || type === "balance_check") ? userMessage : undefined;
    const cached = getCachedSystemPrompt(type, memberDataForPrompt, isPremiumUser);
    let systemPrompt =
      cached ?? getSystemPromptForType(type, memberDataForPrompt, isPremiumUser, targetIsFamily, allMembersForPrompt, weekContext, promptUserMessage, reqGenerationContextBlock);

    if (type === "chat" && isPremiumUser && premiumRelevance === "soft") {
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
      (!isRecipeRequest ? "\n" + GREETING_STYLE_RULE : "");

    if ((type === "chat" || type === "recipe" || type === "diet_plan") && targetIsFamily) {
      systemPrompt += "\n\n" + applyPromptTemplate(
        FAMILY_RECIPE_INSTRUCTION,
        memberDataForPrompt,
        true,
        allMembersForPrompt
      );
    }

    console.log("FINAL_SYSTEM_PROMPT:", systemPrompt);

    const isExpertSoft = type === "chat" && isPremiumUser && premiumRelevance === "soft";
    const isMealPlan = type === "single_day" || type === "diet_plan";
    const maxTokensChat =
      type === "chat" && !isExpertSoft ? tariffResult.maxTokens : undefined;
    const promptConfig = {
      maxTokens: maxTokensChat ?? (isExpertSoft ? 500 : type === "single_day" ? 1000 : 8192),
    };
    const payload = {
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: isRecipeRequest || type === "sos_consultant" || type === "balance_check" ? false : reqStream,
      max_tokens: promptConfig.maxTokens,
      temperature: isRecipeRequest ? 0.3 : 0.7,
      top_p: 0.8,
      repetition_penalty: 1.1,
      ...(isRecipeRequest && { response_format: { type: "json_object" } }),
    };

    if (isRecipeRequest) {
      if ((payload as { stream?: boolean }).stream === true) {
        throw new Error("Recipe request must not use stream=true");
      }
      if (!("response_format" in payload)) {
        throw new Error("Recipe request must enforce JSON response_format");
      }
    }

    const timeoutMs = type === "single_day" ? 60000 : (payload as { stream?: boolean }).stream ? 90000 : 120000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    console.log("SENDING PAYLOAD:", JSON.stringify(payload, null, 2));
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
      if (error instanceof Error && error.name === "AbortError") throw new Error(`Request timeout after ${timeoutMs}ms`);
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DeepSeek API error:", response.status, errorText);
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

    // Инкремент после успешной генерации. ТЕСТ СБРОСА (Midnight MSK): RPC increment_usage при last_reset вчера должен сбросить requests_today и выставить 1.
    if (userId && supabase) {
      await supabase.rpc("increment_usage", { target_user_id: userId });
    }

    if (stream && response.body) {
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    try {
      data = await response.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Не удалось прочитать ответ ИИ. Попробуйте ещё раз." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const assistantMessage = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!assistantMessage) {
      return new Response(
        JSON.stringify({ error: "empty_response", message: "ИИ не вернул ответ. Попробуйте переформулировать запрос." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    return new Response(
      JSON.stringify({ message: assistantMessage, usage: data.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deepseek-chat:", error);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
