import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
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
` : ""}

КРИТИЧЕСКИ ВАЖНО - ФОРМАТ ОТВЕТА ДЛЯ РЕЦЕПТОВ:
Если пользователь просит рецепт, предложение рецепта, варианты блюд или что-то связанное с приготовлением еды, 
ОБЯЗАТЕЛЬНО верни ответ в формате JSON. Это необходимо для автоматического сохранения рецептов в приложении.

Формат JSON для рецепта (один рецепт):
\`\`\`json
{
  "title": "Название рецепта на русском языке",
  "description": "Краткое описание блюда",
  "ingredients": ["ингредиент 1", "ингредиент 2", "ингредиент 3"],
  "steps": ["шаг приготовления 1", "шаг приготовления 2", "шаг приготовления 3"],
  "cookingTime": 20
}
\`\`\`

Формат JSON для нескольких рецептов:
\`\`\`json
{
  "recipes": [
    {
      "title": "Название первого рецепта",
      "description": "Описание",
      "ingredients": ["ингредиент 1", "ингредиент 2"],
      "steps": ["шаг 1", "шаг 2"],
      "cookingTime": 15
    },
    {
      "title": "Название второго рецепта",
      "description": "Описание",
      "ingredients": ["ингредиент 1", "ингредиент 2"],
      "steps": ["шаг 1", "шаг 2"],
      "cookingTime": 20
    }
  ]
}
\`\`\`

ПРАВИЛА:
1. Если пользователь просит рецепт - ВСЕГДА используй JSON формат
2. Название рецепта должно быть коротким (3-40 символов), конкретным и понятным
3. НЕ используй описания или инструкции как названия (например, "яркое и нравится детям" - это НЕ название)
4. НЕ используй шаги приготовления как названия (например, "Мякоть картофеля размять вилкой" - это НЕ название)
5. Название должно быть существительным или существительным с прилагательным (например: "Овсяная каша", "Куриный суп", "Творожная запеканка")
6. Все ингредиенты и шаги должны быть на русском языке
7. Если это просто общий вопрос или совет (не про конкретный рецепт), отвечай обычным текстом без JSON
8. Если предлагаешь несколько вариантов рецептов, используй формат с массивом recipes`;
    } else if (type === "recipe") {
      systemPrompt = `Ты — детский диетолог. Создаёшь рецепты для детей с учётом возраста и аллергий.

${childData ? `
Ребенок: ${childData.name}, ${childData.ageMonths} месяцев
${childData.allergies?.length ? `ИСКЛЮЧИТЬ (аллергия): ${childData.allergies.join(", ")}` : ""}
${childData.dietGoals?.length ? `Цели питания: ${childData.dietGoals.join(", ")}` : ""}
` : ""}

КРИТИЧЕСКИ ВАЖНО - ФОРМАТ ОТВЕТА:
ОБЯЗАТЕЛЬНО верни ответ СТРОГО в формате JSON без дополнительного текста до или после JSON.

ПРАВИЛА ДЛЯ НАЗВАНИЯ РЕЦЕПТА:
1. Название должно быть коротким (3-40 символов)
2. Название должно быть конкретным и понятным (например: "Овсяная каша с яблоком", "Куриный суп", "Творожная запеканка")
3. НЕ используй описания как названия (НЕПРАВИЛЬНО: "яркое и нравится детям", "полезно для здоровья")
4. НЕ используй инструкции как названия (НЕПРАВИЛЬНО: "Мякоть картофеля размять вилкой", "Варить 10 минут")
5. НЕ используй общие фразы (НЕПРАВИЛЬНО: "Рецепт из чата", "Блюдо для ребенка")
6. Название должно быть существительным или существительным с прилагательным

Формат JSON (один рецепт):
\`\`\`json
{
  "title": "Название блюда на русском языке",
  "description": "Краткое описание блюда",
  "cookingTime": 20,
  "ingredients": ["ингредиент 1", "ингредиент 2"],
  "steps": ["шаг 1", "шаг 2"],
  "calories": 250,
  "macros": { "protein": 10, "carbs": 30, "fat": 8 }
}
\`\`\`

Формат JSON (несколько рецептов):
\`\`\`json
{
  "recipes": [
    {
      "title": "Название первого рецепта",
      "description": "Описание",
      "cookingTime": 15,
      "ingredients": ["ингредиент 1", "ингредиент 2"],
      "steps": ["шаг 1", "шаг 2"],
      "calories": 200
    },
    {
      "title": "Название второго рецепта",
      "description": "Описание",
      "cookingTime": 25,
      "ingredients": ["ингредиент 1", "ингредиент 2"],
      "steps": ["шаг 1", "шаг 2"],
      "calories": 300
    }
  ]
}
\`\`\`

ВАЖНО:
- Все названия, ингредиенты и шаги должны быть на РУССКОМ языке
- Название рецепта должно быть валидным (не описание, не инструкция, не общая фраза)
- Если не можешь придумать хорошее название - лучше не создавать рецепт`;
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

КРИТИЧЕСКИ ВАЖНО:
1. ВСЕ названия блюд должны быть на РУССКОМ языке!
2. ВСЕ ингредиенты должны быть на РУССКОМ языке!
3. ВСЕ шаги приготовления должны быть на РУССКОМ языке!
4. Единицы измерения на русском: г, мл, шт, ст.л., ч.л.
5. Отвечай СТРОГО в формате JSON без markdown!
6. Используй ТОЛЬКО английские ключи: breakfast, lunch, snack, dinner, name, calories, protein, carbs, fat, cooking_time, ingredients, steps, amount, unit.

Пример формата:
{
  "breakfast": {"name": "Овсяная каша с яблоком", "calories": 250, "protein": 8, "carbs": 40, "fat": 5, "cooking_time": 15, "ingredients": [{"name": "Овсяные хлопья", "amount": 50, "unit": "г"}, {"name": "Яблоко", "amount": 1, "unit": "шт"}], "steps": ["Залить хлопья водой", "Варить 10 минут", "Добавить нарезанное яблоко"]},
  "lunch": {"name": "Куриный суп с вермишелью", "calories": 300, "protein": 15, "carbs": 30, "fat": 10, "cooking_time": 30, "ingredients": [{"name": "Куриное филе", "amount": 100, "unit": "г"}], "steps": ["Сварить бульон"]},
  "snack": {"name": "Творожок с бананом", "calories": 150, "protein": 8, "carbs": 20, "fat": 5, "cooking_time": 5, "ingredients": [{"name": "Творог", "amount": 100, "unit": "г"}], "steps": ["Смешать творог с бананом"]},
  "dinner": {"name": "Рыбные котлеты с пюре", "calories": 280, "protein": 18, "carbs": 25, "fat": 10, "cooking_time": 40, "ingredients": [{"name": "Филе трески", "amount": 150, "unit": "г"}], "steps": ["Приготовить фарш", "Сформировать котлеты"]}
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
