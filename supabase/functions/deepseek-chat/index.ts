import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FREE_PROMPT_TEMPLATE, PREMIUM_PROMPT_TEMPLATE } from "./prompts.ts";

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

/** Подставляет в шаблон переменные из childData ({{name}}, {{age}}, {{allergies}}, {{likes}}, {{dislikes}}). */
function applyPromptTemplate(template: string, childData: ChildData | null | undefined): string {
  const name = (childData?.name ?? "").trim() || "ребёнок";
  const age = getCalculatedAge(childData) || "не указан";
  const allergies = (childData?.allergies?.length ? childData.allergies.join(", ") : "") || "не указаны";
  const likes = (childData?.likes?.length ? childData.likes.join(", ") : "") || "не указаны";
  const dislikes = (childData?.dislikes?.length ? childData.dislikes.join(", ") : "") || "не указаны";
  return template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{age\}\}/g, age)
    .replace(/\{\{allergies\}\}/g, allergies)
    .replace(/\{\{likes\}\}/g, likes)
    .replace(/\{\{dislikes\}\}/g, dislikes);
}

/** Промпт для type === "chat": шаблон из prompts.ts + подстановка данных ребёнка. */
function generateChatSystemPrompt(isPremium: boolean, childData: ChildData | null | undefined): string {
  const template = isPremium ? PREMIUM_PROMPT_TEMPLATE : FREE_PROMPT_TEMPLATE;
  return applyPromptTemplate(template, childData);
}

function getSystemPromptForType(
  type: string,
  childData: ChildData | null | undefined,
  isPremium: boolean
): string {
  if (type === "chat") {
    return generateChatSystemPrompt(isPremium, childData);
  }

  const age = getCalculatedAge(childData);
  const allergies = childData?.allergies?.length ? childData.allergies.join(", ") : "";
  const likes = childData?.likes?.length ? childData.likes.join(", ") : "";
  const dislikes = childData?.dislikes?.length ? childData.dislikes.join(", ") : "";

  if (type === "recipe") {
    return `Ты — детский диетолог. Рецепты с учётом возраста и аллергий.
Ребенок: ${childData?.name ?? ""}, возраст: ${age || "не указан"}
${allergies ? `ИСКЛЮЧИТЬ (аллергия): ${allergies}.` : ""}
${likes ? `Likes: ${likes}.` : ""}
${dislikes ? `Dislikes: ${dislikes}.` : ""}
Ответ СТРОГО JSON: {"title","description","cookingTime","ingredients","steps","calories","macros"}. Всё на русском.`;
  }

  if (type === "diet_plan") {
    return `Ты — эксперт по детскому питанию. Недельный план.
Ребенок: ${childData?.name ?? ""}, ${age || "не указан"}
${allergies ? `ИСКЛЮЧИТЬ: ${allergies}.` : ""}
Ответ СТРОГО JSON. Ключи: breakfast, lunch, snack, dinner.`;
  }

  if (type === "single_day") {
    return `Детский диетолог. План на день. Ответ — только JSON.
Ключи: breakfast, lunch, snack, dinner. В каждом: name, calories, protein, carbs, fat, cooking_time, ingredients, steps. Всё на русском.`;
  }

  return "Ты — помощник. Отвечай кратко и по делу.";
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  childData?: ChildData | null;
  type?: "chat" | "recipe" | "diet_plan" | "single_day";
  stream?: boolean;
  maxRecipes?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
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

    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    // Строго: premium только при subscription_status === "premium". Иначе — free (в т.ч. null, undefined, "trial").
    const subscriptionStatus = profile?.subscription_status ?? "free";
    const isPremium = subscriptionStatus === "premium";
    const { messages, childData, type = "chat", stream = true }: ChatRequest = await req.json();

    if (type === "chat") {
      const templateName = isPremium ? "PREMIUM_PROMPT_TEMPLATE" : "FREE_PROMPT_TEMPLATE";
      console.log("Template selected:", templateName, "subscription_status:", subscriptionStatus, "userId:", userId ?? "anonymous");
    }

    const cached = getCachedSystemPrompt(type, childData, isPremium);
    const systemPrompt = cached ?? getSystemPromptForType(type, childData, isPremium);

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

    if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.rpc("increment_usage", { _user_id: userId });
    }

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
