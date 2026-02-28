/**
 * Повторный вызов модели для исправления невалидного JSON рецепта.
 * Передаём схему, исходный ответ и текст ошибки; требуем только исправленный JSON.
 * КБЖУ и остальные поля не удаляем — в промпте явно просим сохранить nutrition.
 */

const RECIPE_JSON_SCHEMA_HINT = `
Формат (строго один объект, без markdown):
{
  "title": string,
  "description": string,
  "ingredients": [ { "name": string, "amount": string } ],
  "steps": string[],
  "cookingTimeMinutes": number,
  "mealType": "breakfast"|"lunch"|"snack"|"dinner",
  "servings": number,
  "chefAdvice": string или null,
  "nutrition": { "kcal_per_serving": number, "protein_g_per_serving": number, "fat_g_per_serving": number, "carbs_g_per_serving": number, "is_estimate": true }
}
Сохрани все поля из исходного ответа, включая nutrition. Исправь только то, что сломало валидацию.
`;

export interface RetryFixJsonOptions {
  apiKey: string;
  rawResponse: string;
  validationError: string;
  requestId?: string;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface RetryFixJsonResult {
  fixed: string | null;
  success: boolean;
}

/**
 * Один повторный вызов модели: вернуть ТОЛЬКО исправленный JSON.
 */
export async function retryFixJson(options: RetryFixJsonOptions): Promise<RetryFixJsonResult> {
  const { apiKey, rawResponse, validationError, requestId, log } = options;

  const systemContent =
    `Ты исправляешь JSON рецепта. Верни ТОЛЬКО валидный JSON, без markdown и без текста до/после. Сохрани все поля: title, description, ingredients, steps, cookingTimeMinutes, mealType, servings, chefAdvice, nutrition (калории, белки, жиры, углеводы). ${RECIPE_JSON_SCHEMA_HINT}`.trim();

  const userContent = `Исходный ответ модели (содержит ошибку):\n${rawResponse.slice(0, 3500)}\n\nОшибка валидации: ${validationError}\n\nВерни исправленный JSON (только объект).`;

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 2048,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log?.("retryFixJson: API not ok", { requestId, status: res.status, errText: errText.slice(0, 200) });
      return { fixed: null, success: false };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      log?.("retryFixJson: empty content", { requestId });
      return { fixed: null, success: false };
    }

    log?.("retryFixJson: got response", { requestId, length: content.length });
    return { fixed: content, success: true };
  } catch (e) {
    log?.("retryFixJson: exception", { requestId, error: e instanceof Error ? e.message : String(e) });
    return { fixed: null, success: false };
  }
}
