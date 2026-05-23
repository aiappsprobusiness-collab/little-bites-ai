/**
 * Повторный вызов модели: убрать аллергены из ingredients рецепта (post-check чата).
 */

export interface RetryRecipeAllergyFixOptions {
  apiKey: string;
  recipeJson: string;
  profileAllergies: string[];
  conflictDetail: { profileAllergy: string; token: string; ingredientSnippet: string };
  requestId?: string;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface RetryRecipeAllergyFixResult {
  fixed: string | null;
  success: boolean;
}

export async function retryRecipeAllergyFix(
  options: RetryRecipeAllergyFixOptions,
): Promise<RetryRecipeAllergyFixResult> {
  const { apiKey, recipeJson, profileAllergies, conflictDetail, requestId, log } = options;
  const allergyList = profileAllergies.filter(Boolean).join(", ") || conflictDetail.profileAllergy;

  const systemContent =
    `Ты правишь JSON рецепта для ребёнка с аллергиями: ${allergyList}. ` +
    `Верни ТОЛЬКО валидный JSON-объект (без markdown). ` +
    `Замени ингредиенты с аллергеном «${conflictDetail.profileAllergy}» (найдено: «${conflictDetail.ingredientSnippet}», токен ${conflictDetail.token}) на безопасные аналоги. ` +
    `Обнови title/description/steps при необходимости. Сохрани mealType, servings, cookingTimeMinutes, nutrition, chefAdvice.`;

  const userContent =
    `Текущий рецепт (JSON):\n${recipeJson.slice(0, 3500)}\n\n` +
    `Убери все ингредиенты, несовместимые с аллергией «${conflictDetail.profileAllergy}». Верни ТОЛЬКО исправленный JSON.`;

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
      log?.("retryRecipeAllergyFix: API not ok", { requestId, status: res.status, errText: errText.slice(0, 200) });
      return { fixed: null, success: false };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      log?.("retryRecipeAllergyFix: empty content", { requestId });
      return { fixed: null, success: false };
    }

    log?.("retryRecipeAllergyFix: got response", { requestId, chars: content.length });
    return { fixed: content, success: true };
  } catch (err) {
    log?.("retryRecipeAllergyFix: exception", { requestId, error: String(err) });
    return { fixed: null, success: false };
  }
}
