/**
 * Короткий вызов LLM только для поля description (после провала quality gate).
 */

import { DESCRIPTION_MAX_LENGTH, enforceDescription, normalizeSpaces } from "./sanitizeAndRepair.ts";

export async function repairChatRecipeDescription(
  current: string,
  apiKey: string,
  ctx: { title: string; ingredients: string[] },
): Promise<string | null> {
  const ing = (ctx.ingredients ?? []).slice(0, 10).join(", ");
  const sys =
    'Верни ТОЛЬКО JSON: {"description":"..."}. Ровно 2 коротких предложения, максимум 210 символов. ' +
    "Предложение 1 — сенсорика блюда (текстура, аромат, сочность, температура, как ощущается во рту). " +
    "Предложение 2 — бытовая польза для ребёнка/семьи (сытость, энергия, лёгкость в желудке, пищеварение); можно 1–2 нутритивных акцента (белок, клетчатка, железо, кальций, витамин). " +
    "Не повторять дословно длинное название блюда в начале. Запрещено: «это блюдо», «этот вариант», «в составе», «подходит для», «идеально», «отличный выбор», «хорошо вписывается», «можно использовать», «разнообразие рациона». " +
    "Оба предложения закончить точкой.";
  const user =
    `Название: «${(ctx.title ?? "").trim().slice(0, 120)}». Ингредиенты: ${ing || "—"}. ` +
    `Исправь описание: «${normalizeSpaces(current).slice(0, 280)}». Дай 2 законченных предложения.`;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 160,
        temperature: 0.35,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const match =
      raw.match(/\{\s*"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/) ||
      raw.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (match && match[1]) {
      const desc = match[1].replace(/\\"/g, '"');
      return enforceDescription(desc, {
        title: ctx.title,
        ingredients: ctx.ingredients,
        recipeIdSeed: ctx.title + ing,
      }).slice(0, DESCRIPTION_MAX_LENGTH);
    }
    return null;
  } catch {
    return null;
  }
}

/** Обратная совместимость: repair без контекста ингредиентов. */
export async function repairDescriptionOnly(current: string, apiKey: string): Promise<string | null> {
  return repairChatRecipeDescription(current, apiKey, { title: "", ingredients: [] });
}
