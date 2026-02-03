import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isRelevantQuery, isRelevantPremiumQuery } from "./isRelevantQuery.ts";
import { FREE_PROMPT_TEMPLATE, PREMIUM_PROMPT_TEMPLATE, RECIPE_PROMPT_TEMPLATE, ALLERGY_AND_SAFETY_RULES } from "./prompts.ts";

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

/** Подставляет в шаблон переменные: {{name}}, {{target_profile}}, {{age}}, {{ageMonths}}, {{allergies}}, {{likes}}, {{dislikes}}, {{familyContext}}. При отсутствии — "твой малыш" / "не указано". */
function applyPromptTemplate(
  template: string,
  childData: ChildData | null | undefined,
  targetIsFamily: boolean,
  allChildren: ChildData[] = []
): string {
  // Для семейного режима используем самого младшего для ageMonths
  const youngestChild = targetIsFamily && allChildren.length > 0 ? findYoungestChild(allChildren) : null;
  const primaryChild = youngestChild ?? childData;

  const name = (primaryChild?.name ?? "").trim() || "твой малыш";
  const targetProfile = targetIsFamily ? "Семья" : name;
  const age = getCalculatedAge(primaryChild) || "не указан";
  // ageMonths = возраст самого младшего (для проверки безопасности)
  const ageMonths = String(primaryChild?.age_months ?? primaryChild?.ageMonths ?? 0);

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
    .split("{{allergies}}").join(allergies)
    .split("{{likes}}").join(likes)
    .split("{{dislikes}}").join(dislikes)
    .split("{{familyContext}}").join(familyContext);

  if (out.includes("{{")) {
    const replacers: [RegExp, string][] = [
      [/\{\{\s*name\s*\}\}/g, name],
      [/\{\{\s*target_profile\s*\}\}/g, targetProfile],
      [/\{\{\s*age\s*\}\}/g, age],
      [/\{\{\s*ageMonths\s*\}\}/g, ageMonths],
      [/\{\{\s*allergies\s*\}\}/g, allergies],
      [/\{\{\s*likes\s*\}\}/g, likes],
      [/\{\{\s*dislikes\s*\}\}/g, dislikes],
      [/\{\{\s*familyContext\s*\}\}/g, familyContext],
    ];
    for (const [re, val] of replacers) out = out.replace(re, val);
    out = out.replace(/\{\{[^}]*\}\}/g, "не указано");
  }
  return out;
}

/** Промпт для type === "chat": шаблон из prompts.ts + подстановка данных ребёнка. */
function generateChatSystemPrompt(
  isPremium: boolean,
  childData: ChildData | null | undefined,
  targetIsFamily: boolean,
  allChildren: ChildData[] = []
): string {
  const template = isPremium ? PREMIUM_PROMPT_TEMPLATE : FREE_PROMPT_TEMPLATE;
  return applyPromptTemplate(template, childData, targetIsFamily, allChildren);
}

function getSystemPromptForType(
  type: string,
  childData: ChildData | null | undefined,
  isPremium: boolean,
  targetIsFamily: boolean,
  allChildren: ChildData[] = []
): string {
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, childData, targetIsFamily, allChildren);
  }

  // Для recipe, diet_plan, single_day — используем те же правила безопасности
  if (type === "recipe") {
    return applyPromptTemplate(RECIPE_PROMPT_TEMPLATE, childData, targetIsFamily, allChildren);
  }

  // Для остальных типов — базовый промпт с подстановкой данных
  const youngestChild = targetIsFamily && allChildren.length > 0 ? findYoungestChild(allChildren) : null;
  const primaryChild = youngestChild ?? childData;
  const age = getCalculatedAge(primaryChild);

  // Собираем аллергии всех детей
  let allergiesSet = new Set<string>();
  if (targetIsFamily && allChildren.length > 0) {
    allChildren.forEach((child) => child.allergies?.forEach((a) => allergiesSet.add(a)));
  } else if (primaryChild?.allergies?.length) {
    primaryChild.allergies.forEach((a) => allergiesSet.add(a));
  }
  const allergies = allergiesSet.size > 0 ? Array.from(allergiesSet).join(", ") : "";

  if (type === "diet_plan") {
    return `Ты — эксперт по детскому питанию. Недельный план.
${ALLERGY_AND_SAFETY_RULES.replace(/\{\{name\}\}/g, primaryChild?.name || "ребенка").replace(/\{\{ageMonths\}\}/g, String(primaryChild?.age_months ?? 0))}
Ребенок: ${primaryChild?.name ?? ""}, ${age || "не указан"}
${allergies ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : ""}
Ответ СТРОГО JSON. Ключи: breakfast, lunch, snack, dinner.`;
  }

  if (type === "single_day") {
    return `Детский диетолог. План на день.
${ALLERGY_AND_SAFETY_RULES.replace(/\{\{name\}\}/g, primaryChild?.name || "ребенка").replace(/\{\{ageMonths\}\}/g, String(primaryChild?.age_months ?? 0))}
${allergies ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : ""}
Ответ — только JSON. Ключи: breakfast, lunch, snack, dinner. В каждом: name, calories, protein, carbs, fat, cooking_time, ingredients, steps. Всё на русском.`;
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

    // Создаём supabase клиент на уровне всего handler-а
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (authHeader && supabase) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;

      if (userId) {
        const { data: usageData } = await supabase.rpc("check_usage_limit", { _user_id: userId });
        if (usageData && !usageData.can_generate) {
          return new Response(
            JSON.stringify({
              error: "usage_limit_exceeded",
              message: "Достигнут лимит генераций на сегодня. Оформите Premium для безлимитного доступа.",
              remaining: 0,
              daily_limit: usageData.daily_limit,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
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

    // Загружаем всех детей для семейного контекста
    let allChildren: ChildData[] = [];
    if (targetIsFamily && userId && supabase) {
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

    if (type === "chat") {
      const templateName = isPremiumUser ? "PREMIUM_PROMPT_TEMPLATE" : "FREE_PROMPT_TEMPLATE";
      console.log(
        "Template selected:",
        templateName,
        "subscription_status:",
        subscriptionStatus,
        "userId:",
        userId ?? "anonymous",
        "targetIsFamily:",
        targetIsFamily,
        "allChildren count:",
        allChildren.length
      );
    }

    const cached = getCachedSystemPrompt(type, childData, isPremiumUser);
    let systemPrompt =
      cached ?? getSystemPromptForType(type, childData, isPremiumUser, targetIsFamily, allChildren);

    if (type === "chat" && isPremiumUser && premiumRelevance === "soft") {
      systemPrompt =
        "ОТВЕТЬ КАК ЭКСПЕРТ-НУТРИЦИОЛОГ. КРАТКО. БЕЗ ГЕНЕРАЦИИ РЕЦЕПТА И БЕЗ JSON БЛОКА. Пиши только человеческим языком, не упоминай JSON или технические термины. Отвечай прямо и по существу, избегая вводных слов-паразитов. Сразу переходи к объяснению или рекомендации.";
    }

    console.log("FINAL_SYSTEM_PROMPT:", systemPrompt);

    const apiRequestBody: Record<string, unknown> = {
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: type === "single_day" ? 2000 : 8192,
      top_p: 0.8,
      temperature: 0.3,
      repetition_penalty: 1.1,
      stream,
    };

    if (type === "single_day") apiRequestBody.response_format = { type: "json_object" };

    const timeoutMs = stream ? 90000 : 120000;
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

    // Инкремент сразу после успешного ответа API — минимизация риска фрода при сбое записи в БД
    if (userId && supabase) {
      await supabase.rpc("increment_usage", { _user_id: userId });
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
