import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isRelevantQuery, isRelevantPremiumQuery } from "./isRelevantQuery.ts";
import {
  FREE_PROMPT_TEMPLATE,
  PREMIUM_PROMPT_TEMPLATE,
  ADULT_PROMPT_TEMPLATE,
  ADULT_CONTEXT,
  WEANING_CONTEXT,
  RECIPE_PROMPT_TEMPLATE,
  DIET_PLAN_TEMPLATE,
  SINGLE_DAY_TEMPLATE,
  EXPERT_ADVICE_TEMPLATE,
} from "./prompts.ts";
// v2: age-based logic and prompt by tariff
import { getAgeCategory, getAgeCategoryRules } from "./ageCategory.ts";
import { buildPromptByProfileAndTariff } from "./promptByTariff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ——— Кэш: префикс v_template_system, принудительно отключён ———
const CACHE_KEY_PREFIX = "v_template_system";

function getCacheKey(type: string, childData?: ChildData | null, isPremium?: boolean): string {
  return `${CACHE_KEY_PREFIX}_${type}_${isPremium ? "premium" : "free"}_${JSON.stringify(childData ?? {})}`;
}

function getCachedSystemPrompt(
  _type: string,
  _childData?: ChildData | null,
  _isPremium?: boolean
): string | null {
  // const key = getCacheKey(type, childData, isPremium);
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

interface ChildData {
  name?: string;
  birth_date?: string;
  age_months?: number;
  ageMonths?: number;
  ageDescription?: string;
  allergies?: string[];
  likes?: string[];
  dislikes?: string[];
}

function getCalculatedAge(childData?: ChildData | null): string {
  if (!childData) return "";
  if (childData.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(childData.birth_date.trim())) {
    return formatAgeString(childData.birth_date);
  }
  if (childData.ageDescription) return childData.ageDescription;
  const m = childData.age_months ?? childData.ageMonths ?? 0;
  if (m < 12) return `${m} мес.`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `${y} г. ${rest} мес.` : `${y} ${y === 1 ? "год" : y < 5 ? "года" : "лет"}`;
}

/** Возвращает возраст в месяцах для ChildData; при отсутствии age_months вычисляет из birth_date. */
function getAgeMonths(child: ChildData): number {
  const m = child.age_months ?? child.ageMonths;
  if (m != null) return m;
  const s = (child.birth_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 999;
  const { years, months } = calculateAge(s);
  return years * 12 + months;
}

/** Находит самого младшего ребенка из списка (учитывает birth_date, если age_months отсутствует). */
function findYoungestChild(children: ChildData[]): ChildData | null {
  if (children.length === 0) return null;
  return children.reduce((youngest, child) => {
    const childMonths = getAgeMonths(child);
    const youngestMonths = getAgeMonths(youngest);
    return childMonths < youngestMonths ? child : youngest;
  }, children[0]);
}

/** Подставляет в шаблон переменные, включая {{adultContext}}, {{weekContext}}. */
function applyPromptTemplate(
  template: string,
  childData: ChildData | null | undefined,
  targetIsFamily: boolean,
  allChildren: ChildData[] = [],
  options?: { weekContext?: string }
): string {
  // Для семейного режима используем самого младшего для ageMonths
  const youngestChild = targetIsFamily && allChildren.length > 0 ? findYoungestChild(allChildren) : null;
  const primaryChild = youngestChild ?? childData;

  const name = (primaryChild?.name ?? "").trim() || "твой малыш";
  const targetProfile = targetIsFamily ? "Семья" : name;
  const age = getCalculatedAge(primaryChild) || "не указан";
  // ageMonths — строго число (месяцы) для правил безопасности; 999 → 0 при неизвестном
  const rawMonths = primaryChild ? getAgeMonths(primaryChild) : 0;
  const ageMonths = String(rawMonths === 999 ? 0 : rawMonths);

  // Собираем аллергии ВСЕХ детей для семейного режима
  let allergiesSet = new Set<string>();
  if (targetIsFamily && allChildren.length > 0) {
    allChildren.forEach((child) => {
      child.allergies?.forEach((a) => allergiesSet.add(a));
    });
  } else if (primaryChild?.allergies?.length) {
    primaryChild.allergies.forEach((a) => allergiesSet.add(a));
  }
  const allergies = allergiesSet.size > 0 ? Array.from(allergiesSet).join(", ") : "не указано";
  const allergiesExclude = allergiesSet.size > 0 ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : "";

  const ageMode =
    rawMonths > 216 ? "Взрослый" : rawMonths < 36 ? "Ребенок до 3" : "Школьник 3-17";
  const adultContext = rawMonths > 216 ? ADULT_CONTEXT : "";
  const weaningContext = rawMonths < 36 ? WEANING_CONTEXT : "";
  const ageContext = adultContext || weaningContext;
  const ageRule =
    rawMonths > 216
      ? "Используй ВЗРОСЛОЕ меню: омлеты, стейки, салаты. ЗАПРЕЩЕНО детское пюре и каши на воде."
      : rawMonths < 36
        ? "Используй меню ПРИКОРМА: мягкие текстуры, без соли/сахара."
        : "";
  const weekContext = options?.weekContext?.trim() || "";

  const likes = (primaryChild?.likes?.length ? primaryChild.likes.join(", ") : "") || "не указано";
  const dislikes = (primaryChild?.dislikes?.length ? primaryChild.dislikes.join(", ") : "") || "не указано";

  // Формируем familyContext из ВСЕХ детей
  let familyContext = `Профиль: ${name}`;
  if (targetIsFamily && allChildren.length > 0) {
    const childrenInfo = allChildren
      .map((child) => {
        const childName = child.name || "ребенок";
        const childAge = getCalculatedAge(child) || formatAgeString(child.birth_date || "") || "возраст не указан";
        return `${childName} (${childAge})`;
      })
      .join(", ");
    familyContext = `Готовим для всей семьи: ${childrenInfo}`;
  } else if (targetIsFamily) {
    familyContext = `Готовим для всей семьи (${name}, ${age})`;
  }

  let out = template
    .split("{{name}}").join(name)
    .split("{{target_profile}}").join(targetProfile)
    .split("{{age}}").join(age)
    .split("{{ageMonths}}").join(ageMonths)
    .split("{{ageMode}}").join(ageMode)
    .split("{{ageContext}}").join(ageContext)
    .split("{{ageRule}}").join(ageRule)
    .split("{{allergies}}").join(allergies)
    .split("{{allergiesExclude}}").join(allergiesExclude)
    .split("{{adultContext}}").join(adultContext)
    .split("{{weekContext}}").join(weekContext)
    .split("{{likes}}").join(likes)
    .split("{{dislikes}}").join(dislikes)
    .split("{{familyContext}}").join(familyContext);

  if (out.includes("{{")) {
    const replacers: [RegExp, string][] = [
      [/\{\{\s*name\s*\}\}/g, name],
      [/\{\{\s*target_profile\s*\}\}/g, targetProfile],
      [/\{\{\s*age\s*\}\}/g, age],
      [/\{\{\s*ageMonths\s*\}\}/g, ageMonths],
      [/\{\{\s*ageMode\s*\}\}/g, ageMode],
      [/\{\{\s*ageContext\s*\}\}/g, ageContext],
      [/\{\{\s*ageRule\s*\}\}/g, ageRule],
      [/\{\{\s*allergies\s*\}\}/g, allergies],
      [/\{\{\s*allergiesExclude\s*\}\}/g, allergiesExclude],
      [/\{\{\s*adultContext\s*\}\}/g, adultContext],
      [/\{\{\s*weekContext\s*\}\}/g, weekContext],
      [/\{\{\s*likes\s*\}\}/g, likes],
      [/\{\{\s*dislikes\s*\}\}/g, dislikes],
      [/\{\{\s*familyContext\s*\}\}/g, familyContext],
    ];
    for (const [re, val] of replacers) out = out.replace(re, val);
    out = out.replace(/\{\{[^}]*\}\}/g, "не указано");
  }
  return out;
}

/** Промпт для type === "chat": шаблон из prompts.ts + подстановка данных ребёнка. ageMonths > 216 → взрослый (без пюре/каш). */
function generateChatSystemPrompt(
  isPremium: boolean,
  childData: ChildData | null | undefined,
  targetIsFamily: boolean,
  allChildren: ChildData[] = []
): string {
  const youngestChild = targetIsFamily && allChildren.length > 0 ? findYoungestChild(allChildren) : childData;
  const ageMonths = youngestChild ? getAgeMonths(youngestChild) : 0;
  if (ageMonths > 216) {
    return applyPromptTemplate(ADULT_PROMPT_TEMPLATE, childData, targetIsFamily, allChildren);
  }
  const template = isPremium ? PREMIUM_PROMPT_TEMPLATE : FREE_PROMPT_TEMPLATE;
  return applyPromptTemplate(template, childData, targetIsFamily, allChildren);
}

function getSystemPromptForType(
  type: string,
  childData: ChildData | null | undefined,
  isPremium: boolean,
  targetIsFamily: boolean,
  allChildren: ChildData[] = [],
  weekContext?: string
): string {
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, childData, targetIsFamily, allChildren);
  }
  if (type === "recipe") {
    return applyPromptTemplate(RECIPE_PROMPT_TEMPLATE, childData, targetIsFamily, allChildren);
  }
  if (type === "diet_plan") {
    return applyPromptTemplate(DIET_PLAN_TEMPLATE, childData, targetIsFamily, allChildren);
  }
  if (type === "single_day") {
    const ctx = weekContext?.trim()
      ? `Уже запланировано: ${weekContext.trim()}. Сделай этот день максимально непохожим на уже запланированные.`
      : "";
    return applyPromptTemplate(SINGLE_DAY_TEMPLATE, childData, targetIsFamily, allChildren, { weekContext: ctx });
  }
  return "Ты — помощник. Отвечай кратко и по делу.";
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  childData?: ChildData | null;
  type?: "chat" | "recipe" | "diet_plan" | "single_day";
  stream?: boolean;
  maxRecipes?: number;
  /** true, если выбран профиль «Семья» (рецепт для всех детей) */
  targetIsFamily?: boolean;
  /** id профиля ребёнка; при значении "family" считается режим «Семья» */
  childId?: string;
  /** Данные всех детей — если переданы, запрос в таблицу children не выполняется (экономия ~200–500мс) */
  allChildren?: ChildData[];
  /** Название дня (для плана питания, например "Понедельник") */
  dayName?: string;
  /** Уже запланированные блюда по дням: "Пн — Овсянка, Вт — Омлет". Чтобы ИИ не повторялся. */
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

        let profileV2 = profileV2Row as (ProfileV2Row & { premium_until?: string | null }) | null;

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

    const subscriptionStatus = profile?.subscription_status ?? "free";
    const isPremiumUser = subscriptionStatus === "premium" || subscriptionStatus === "trial";
    const {
      messages,
      childData,
      type = "chat",
      stream = true,
      targetIsFamily: reqTargetIsFamily,
      childId,
      allChildren: reqAllChildren,
      dayName,
      weekContext,
    }: ChatRequest = await req.json();

    const childName = childData?.name?.trim() || "твой малыш";

    const userMessage =
      (Array.isArray(messages) && messages.length > 0)
        ? [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content ?? ""
        : "";

    let premiumRelevance: false | "soft" | true | undefined = undefined;

    if (type === "chat") {
      const irrelevantStub =
        `Похоже, этот вопрос не связан с питанием. ${childName} ждет полезных рецептов! Пожалуйста, уточни свой кулинарный запрос.`;

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

    const targetIsFamily =
      type === "chat" && (reqTargetIsFamily === true || childId === "family");

    // Используем allChildren из запроса — иначе запрос в БД (экономия ~200–500мс)
    let allChildren: ChildData[] = [];
    if (targetIsFamily) {
      if (Array.isArray(reqAllChildren) && reqAllChildren.length > 0) {
        allChildren = reqAllChildren;
      } else if (userId && supabase) {
        const { data: childrenData, error: childrenError } = await supabase
          .from("children")
          .select("name, birth_date, age_months, allergies, likes, dislikes")
          .eq("user_id", userId);

        if (!childrenError && childrenData) {
          allChildren = childrenData.map((child: any) => {
            const birth = child.birth_date || "";
            let age_months = child.age_months;
            if (age_months == null && /^\d{4}-\d{2}-\d{2}$/.test(String(birth).trim())) {
              const { years, months } = calculateAge(birth);
              age_months = years * 12 + months;
            }
            return {
              name: child.name,
              birth_date: child.birth_date,
              age_months: age_months ?? 0,
              allergies: child.allergies,
              likes: child.likes,
              dislikes: child.dislikes,
            };
          });
        }
      }
    }

    // v2: tariff + age — считаем заранее, чтобы при Free ограничить данные промпта (1 аллергия, без likes/dislikes)
    const primaryForAge =
      targetIsFamily && allChildren.length > 0 ? findYoungestChild(allChildren) : childData;
    const ageMonthsForCategory = primaryForAge ? getAgeMonths(primaryForAge) : 0;
    const memberTypeV2 = targetIsFamily
      ? "family"
      : (ageMonthsForCategory > 216 ? "adult" : "child");
    const tariffResult = buildPromptByProfileAndTariff({
      status: subscriptionStatus,
      memberType: memberTypeV2,
      isFamilyTarget: targetIsFamily,
    });

    // v2: Free — в промпт передаём макс. 1 аллергию и не передаём likes/dislikes
    let childDataForPrompt = childData;
    let allChildrenForPrompt = allChildren;
    if (!tariffResult.useLikesDislikes || !tariffResult.useAllAllergies) {
      childDataForPrompt = childData
        ? {
          ...childData,
          likes: [] as string[],
          dislikes: [] as string[],
          allergies: (childData.allergies ?? []).slice(0, 1),
        }
        : null;
      allChildrenForPrompt = allChildren.map((c) => ({
        ...c,
        likes: [] as string[],
        dislikes: [] as string[],
        allergies: (c.allergies ?? []).slice(0, 1),
      }));
    }

    if (type === "chat") {
      const templateName = isPremiumUser ? "PREMIUM_PROMPT_TEMPLATE" : "FREE_PROMPT_TEMPLATE";
      console.log(
        "Template selected:",
        templateName,
        "subscription_status:",
        subscriptionStatus,
        "targetIsFamily:",
        targetIsFamily,
        "allChildren count:",
        allChildrenForPrompt.length
      );
    }

    const cached = getCachedSystemPrompt(type, childDataForPrompt, isPremiumUser);
    let systemPrompt =
      cached ?? getSystemPromptForType(type, childDataForPrompt, isPremiumUser, targetIsFamily, allChildrenForPrompt, weekContext);

    if (type === "chat" && isPremiumUser && premiumRelevance === "soft") {
      systemPrompt = EXPERT_ADVICE_TEMPLATE;
    }

    // v2: age-based logic — категория возраста и правила питания в промпт
    const ageCategory = getAgeCategory(ageMonthsForCategory);
    const ageRulesV2 = getAgeCategoryRules(ageCategory);
    systemPrompt =
      systemPrompt +
      "\n\n" +
      ageRulesV2 +
      "\n" +
      tariffResult.tariffAppendix +
      (tariffResult.familyBalanceNote ? "\n" + tariffResult.familyBalanceNote : "");

    // База знаний: при упоминании сложных тем (аллергия, прикорм, безопасность) можно добавить ссылку на статью
    if (type === "chat" && supabase) {
      const { data: articlesList } = await supabase
        .from("articles")
        .select("id, title")
        .not("id", "is", null);
      const articles = (articlesList ?? []) as { id: string; title: string }[];
      if (articles.length > 0) {
        const articleLines = articles.map((a) => `- ${a.id} (${a.title})`).join("\n");
        systemPrompt += `

БАЗА ЗНАНИЙ: Если в ответе ты затронул сложную тему (аллергия на БКМ, прикорм, безопасность продуктов, питание), в конце ответа добавь одну строку: "Подробнее об этом в нашей статье: [ID]", подставив вместо ID ровно один UUID из списка ниже (без скобок в ответе — только UUID в квадратных скобках). Используй только эти ID:
${articleLines}
Формат в ответе строго: Подробнее об этом в нашей статье: [uuid-здесь]`;
      }
    }

    console.log("FINAL_SYSTEM_PROMPT:", systemPrompt);

    const isExpertSoft = type === "chat" && isPremiumUser && premiumRelevance === "soft";
    const isMealPlan = type === "single_day" || type === "diet_plan";
    // v2: Free ~700 tokens, Premium/Trial ~1500 for chat; остальные типы без изменений
    const maxTokensChat =
      type === "chat" && !isExpertSoft ? tariffResult.maxTokens : undefined;
    const apiRequestBody: Record<string, unknown> = {
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens:
        maxTokensChat ??
        (isExpertSoft ? 500 : type === "single_day" ? 1000 : 8192),
      top_p: 0.8,
      temperature: isMealPlan ? 0.7 : 0.3,
      repetition_penalty: 1.1,
      stream,
    };

    if (type === "single_day") {
      apiRequestBody.response_format = { type: "json_object" };
    }

    const timeoutMs = type === "single_day" ? 60000 : stream ? 90000 : 120000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiRequestBody),
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
      throw new Error(`DeepSeek API error: ${response.status}`);
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

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({ message: assistantMessage, usage: data.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deepseek-chat:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
