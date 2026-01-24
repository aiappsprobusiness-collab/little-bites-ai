import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Кэш системных промптов в памяти (для оптимизации повторных запросов в рамках одного инстанса)
// Edge functions stateless, но кэш поможет для нескольких запросов в рамках одного процесса
const systemPromptCache = new Map<string, string>();
const CACHE_TTL = 60 * 60 * 1000; // 1 час
const cacheTimestamps = new Map<string, number>();

function getCacheKey(type: string, childData?: any): string {
  return `${type}_${JSON.stringify(childData || {})}`;
}

function getCachedSystemPrompt(type: string, childData?: any): string | null {
  const key = getCacheKey(type, childData);
  const cached = systemPromptCache.get(key);
  const timestamp = cacheTimestamps.get(key);
  
  if (cached && timestamp && Date.now() - timestamp < CACHE_TTL) {
    return cached;
  }
  
  // Удаляем устаревший кэш
  if (cached) {
    systemPromptCache.delete(key);
    cacheTimestamps.delete(key);
  }
  
  return null;
}

function cacheSystemPrompt(type: string, prompt: string, childData?: any): void {
  const key = getCacheKey(type, childData);
  systemPromptCache.set(key, prompt);
  cacheTimestamps.set(key, Date.now());
}

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
  stream?: boolean;
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

    const { messages, childData, type = "chat", stream = true }: ChatRequest = await req.json(); // Streaming по умолчанию

    // Проверяем кэш системного промпта (оптимизация для повторных запросов)
    let systemPrompt = getCachedSystemPrompt(type, childData);
    
    // Build system prompt based on type (если не в кэше)
    if (!systemPrompt) {

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
      // Оптимизированный промпт: пример JSON в system, короткий user prompt
      systemPrompt = `Детский диетолог. Создаёшь план питания на день.

КРИТИЧЕСКИ ВАЖНО - РАЗНООБРАЗИЕ:
- Каждый день недели должен иметь УНИКАЛЬНЫЕ блюда
- НЕ повторяй одни и те же рецепты в разные дни
- Используй разные крупы (гречка, овсянка, рис, пшено, манка), разные способы приготовления
- Для завтрака: чередуй каши, омлеты, запеканки, творожные блюда
- Для обеда: разные супы, вторые блюда, гарниры
- Для полдника: разные фрукты, творожные блюда, выпечка
- Для ужина: разные мясные/рыбные блюда с разными гарнирами

Формат ответа - только валидный JSON без пояснений:
{
  "breakfast": {"name": "Название", "calories": 250, "protein": 8, "carbs": 40, "fat": 5, "cooking_time": 15, "ingredients": [{"name": "Продукт", "amount": 50, "unit": "г"}], "steps": ["Шаг"]},
  "lunch": {"name": "Название", "calories": 300, "protein": 15, "carbs": 30, "fat": 10, "cooking_time": 30, "ingredients": [{"name": "Продукт", "amount": 100, "unit": "г"}], "steps": ["Шаг"]},
  "snack": {"name": "Название", "calories": 150, "protein": 5, "carbs": 20, "fat": 3, "cooking_time": 5, "ingredients": [{"name": "Продукт", "amount": 100, "unit": "г"}], "steps": ["Шаг"]},
  "dinner": {"name": "Название", "calories": 280, "protein": 18, "carbs": 25, "fat": 10, "cooking_time": 35, "ingredients": [{"name": "Продукт", "amount": 150, "unit": "г"}], "steps": ["Шаг"]}
}

Все названия, ингредиенты и шаги на русском языке. Ключи: breakfast, lunch, snack, dinner, name, calories, protein, carbs, fat, cooking_time, ingredients, steps, amount, unit.`;
      }
      
      // Кэшируем системный промпт для будущих запросов
      cacheSystemPrompt(type, systemPrompt, childData);
    }

    // Call DeepSeek API with streaming support
    const apiRequestBody: any = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      // Для single_day нужен больший лимит токенов для полного JSON (4 приема пищи с ingredients и steps)
      max_tokens: type === "single_day" ? 2000 : 512,
      top_p: 0.8,
      temperature: 0.3,
      repetition_penalty: 1.1,
      stream: stream, // Streaming по умолчанию для мгновенной обратной связи
    };

    // Добавляем response_format для JSON режима (только для single_day)
    if (type === "single_day") {
      apiRequestBody.response_format = { type: "json_object" };
    }

    // Таймаут для запроса: 90 секунд для streaming (увеличено для перегруженных серверов), 120 секунд для обычного
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
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
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

    // Handle streaming response
    if (stream && response.body) {
      // Increment usage after stream completes (will be handled in client)
      // Return streaming response
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Handle non-streaming response (backward compatibility)
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
