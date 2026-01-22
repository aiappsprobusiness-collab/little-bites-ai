import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  childData?: {
    name: string;
    ageMonths: number;
    allergies?: string[];
    dietGoals?: string[];
    weight?: number;
    height?: number;
  };
  type?: "chat" | "recipe" | "diet_plan" | "single_day";
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY is not configured");
    }

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;

      // Check usage limit for authenticated users
      if (userId) {
        const { data: usageData } = await supabase.rpc("check_usage_limit", {
          _user_id: userId,
        });

        if (usageData && !usageData.can_generate) {
          return new Response(
            JSON.stringify({
              error: "usage_limit_exceeded",
              message: "Достигнут лимит генераций на сегодня. Оформите Premium для безлимитного доступа.",
              remaining: 0,
              daily_limit: usageData.daily_limit,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    const { messages, childData, type = "chat" }: ChatRequest = await req.json();

    // Build system prompt based on type
    let systemPrompt = "";
    
    if (type === "chat") {
      systemPrompt = `Ты — умный ИИ-помощник для мам. Специализируешься на детском питании, рецептах и советах по здоровью детей.
      
Отвечай на русском языке. Будь дружелюбным, понятным и практичным.

${childData ? `
Данные о ребенке:
- Имя: ${childData.name}
- Возраст: ${childData.ageMonths} месяцев
${childData.allergies?.length ? `- Аллергии: ${childData.allergies.join(", ")}` : ""}
${childData.dietGoals?.length ? `- Цели питания: ${childData.dietGoals.join(", ")}` : ""}
${childData.weight ? `- Вес: ${childData.weight} кг` : ""}
${childData.height ? `- Рост: ${childData.height} см` : ""}

ВАЖНО: Учитывай аллергии при любых рекомендациях!
` : ""}`;
    } else if (type === "recipe") {
      systemPrompt = `Ты — детский диетолог. Создаёшь рецепты для детей с учётом возраста и аллергий.

${childData ? `
Ребенок: ${childData.name}, ${childData.ageMonths} месяцев
${childData.allergies?.length ? `ИСКЛЮЧИТЬ: ${childData.allergies.join(", ")}` : ""}
` : ""}

Отвечай в формате JSON:
{
  "title": "Название блюда",
  "description": "Краткое описание",
  "cookingTime": 20,
  "ingredients": ["ингредиент 1", "ингредиент 2"],
  "steps": ["шаг 1", "шаг 2"],
  "calories": 250,
  "macros": { "protein": 10, "carbs": 30, "fat": 8 }
}`;
    } else if (type === "diet_plan") {
      systemPrompt = `Ты — эксперт по детскому питанию. Создаёшь недельные планы питания.

${childData ? `
Ребенок: ${childData.name}, ${childData.ageMonths} месяцев
${childData.allergies?.length ? `ИСКЛЮЧИТЬ (аллергия): ${childData.allergies.join(", ")}` : ""}
${childData.dietGoals?.length ? `Цели: ${childData.dietGoals.join(", ")}` : ""}
` : ""}

ВАЖНО: Отвечай СТРОГО в формате JSON без markdown и без дополнительного текста!
Используй ТОЛЬКО английские ключи для типов приёма пищи: breakfast, lunch, snack, dinner.

{
  "days": {
    "Понедельник": {
      "breakfast": {"name": "Овсяная каша с яблоком", "calories": 250, "protein": 8, "carbs": 40, "fat": 5, "cooking_time": 15, "ingredients": [{"name": "Овсяные хлопья", "amount": 50, "unit": "г"}], "steps": ["Залить водой и варить 10 мин"]},
      "lunch": {"name": "...", "calories": 300, "protein": 15, "carbs": 30, "fat": 10, "cooking_time": 20, "ingredients": [...], "steps": [...]},
      "snack": {"name": "...", "calories": 100, "protein": 3, "carbs": 15, "fat": 3, "cooking_time": 5, "ingredients": [...], "steps": [...]},
      "dinner": {"name": "...", "calories": 280, "protein": 12, "carbs": 25, "fat": 8, "cooking_time": 25, "ingredients": [...], "steps": [...]}
    },
    "Вторник": {...},
    "Среда": {...},
    "Четверг": {...},
    "Пятница": {...},
    "Суббота": {...},
    "Воскресенье": {...}
  },
  "shopping_list": ["продукт - количество"],
  "total_calories_week": 8400
}`;
    } else if (type === "single_day") {
      systemPrompt = `Ты — эксперт по детскому питанию. Создаёшь план питания на один день.

${childData ? `
Ребенок: ${childData.name}, ${childData.ageMonths} месяцев
${childData.allergies?.length ? `ИСКЛЮЧИТЬ (аллергия): ${childData.allergies.join(", ")}` : ""}
${childData.dietGoals?.length ? `Цели: ${childData.dietGoals.join(", ")}` : ""}
` : ""}

ВАЖНО: Отвечай СТРОГО в формате JSON без markdown и без дополнительного текста!
Используй ТОЛЬКО английские ключи: breakfast, lunch, snack, dinner.

{
  "breakfast": {"name": "Название блюда", "calories": 250, "protein": 8, "carbs": 40, "fat": 5, "cooking_time": 15, "ingredients": [{"name": "Продукт", "amount": 50, "unit": "г"}], "steps": ["Шаг 1"]},
  "lunch": {"name": "...", "calories": 300, "protein": 15, "carbs": 30, "fat": 10, "cooking_time": 20, "ingredients": [...], "steps": [...]},
  "snack": {"name": "...", "calories": 100, "protein": 3, "carbs": 15, "fat": 3, "cooking_time": 5, "ingredients": [...], "steps": [...]},
  "dinner": {"name": "...", "calories": 280, "protein": 12, "carbs": 25, "fat": 8, "cooking_time": 25, "ingredients": [...], "steps": [...]}
}`;
    }

    // Call DeepSeek API
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

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

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || "";

    // Increment usage for authenticated users
    if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.rpc("increment_usage", { _user_id: userId });
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        usage: data.usage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in deepseek-chat:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
