import { normalizeNutritionGoalsFromDb } from "../_shared/recipeGoals.ts";
import { passesPreferenceFilters } from "../generate-plan/preferenceRules.ts";
import type { MealSlot, MemberDataPool, VkPreviewMeal } from "./types.ts";
import { pickMockMealForSlot } from "./mockSlots.ts";

const AI_TIMEOUT_MS = 8_000;

type AiMealPartial = {
  type?: string;
  title?: string;
  description?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  cooking_time_minutes?: number;
  nutrition_goals?: unknown;
};

function isMealSlot(s: string): s is MealSlot {
  return s === "breakfast" || s === "lunch" || s === "dinner" || s === "snack";
}

function normalizeAiMeal(slot: MealSlot, raw: AiMealPartial): VkPreviewMeal | null {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  if (!title) return null;
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 400) : undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
  const meal: VkPreviewMeal = { type: slot, title };
  if (description) meal.description = description;
  const c = num(raw.calories);
  if (c !== undefined) meal.calories = c;
  const p = num(raw.protein);
  if (p !== undefined) meal.protein = p;
  const f = num(raw.fat);
  if (f !== undefined) meal.fat = f;
  const cb = num(raw.carbs);
  if (cb !== undefined) meal.carbs = cb;
  const ct = num(raw.cooking_time_minutes);
  if (ct !== undefined && ct > 0) meal.cooking_time_minutes = ct;
  const goals = normalizeNutritionGoalsFromDb(raw.nutrition_goals);
  if (goals.length) meal.nutrition_goals = [...goals];
  return meal;
}

/**
 * Заполняет только переданные слоты через DeepSeek JSON. При ошибке — null (вызывающий перейдёт на mock).
 */
export async function fetchAiMealsForSlots(
  missing: MealSlot[],
  memberData: MemberDataPool,
): Promise<Partial<Record<MealSlot, VkPreviewMeal>> | null> {
  if (missing.length === 0) return {};
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) return null;

  const age = memberData.age_months ?? 24;
  const allergies = (memberData.allergies ?? []).join(", ") || "нет";
  const dislikes = (memberData.dislikes ?? []).join(", ") || "нет";
  const likes = (memberData.likes ?? []).join(", ") || "нет";

  const system =
    `Ты помощник по детскому питанию. Верни ТОЛЬКО валидный JSON-объект без markdown.\n` +
    `Структура: {"meals":[{"type":"breakfast|lunch|dinner|snack","title":"...","description":"1–2 предложения о пользе","calories":число,"protein":число,"fat":число,"carbs":число,"cooking_time_minutes":число,"nutrition_goals":["balanced","iron_support","brain_development","weight_gain","gentle_digestion","energy_boost"]}]}\n` +
    `Поля protein/fat/carbs — граммы на порцию (оценка). cooking_time_minutes — реалистичная оценка минут. nutrition_goals: 1–3 ключа из списка выше, релевантные блюду.\n` +
    `Поле title — всегда конкретное название блюда в меню (например «Гречка с тушёной курицей», «Суп с фрикадельками»). Запрещены общие фразы вроде «лёгкий обед», «нежное блюдо», «согревающий ужин», «домашний перекус» без названия блюда.\n` +
    `Правила: строго учитывай аллергии (никогда не предлагай продукты с аллергенами); учитывай нелюбимое; супы только для lunch; без острого и кофе для детей до 3 лет.\n` +
    `Верни ровно по одному блюду на каждый из типов: ${missing.join(", ")}.`;

  const user = `Возраст: ${age} мес. Аллергии: ${allergies}. Не любит: ${dislikes}. Нравится (мягко): ${likes}.`;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") return null;
    let parsed: { meals?: AiMealPartial[] };
    try {
      parsed = JSON.parse(text) as { meals?: AiMealPartial[] };
    } catch {
      return null;
    }
    if (!Array.isArray(parsed.meals)) return null;
    const out: Partial<Record<MealSlot, VkPreviewMeal>> = {};
    const need = new Set(missing);
    const profile = { allergies: memberData.allergies, dislikes: memberData.dislikes };
    for (const row of parsed.meals) {
      const t = typeof row.type === "string" ? row.type.trim().toLowerCase() : "";
      if (!isMealSlot(t) || !need.has(t)) continue;
      const m = normalizeAiMeal(t, row);
      if (!m) continue;
      const ok = passesPreferenceFilters(
        { title: m.title, description: m.description ?? "", recipe_ingredients: [] },
        profile,
      );
      if (ok) out[t] = m;
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

/** Если AI не заполнил слот — mock (с учётом аллергий/dislikes из профиля). */
export function fillMissingWithMock(
  missing: MealSlot[],
  existing: Partial<Record<MealSlot, VkPreviewMeal>>,
  memberData?: MemberDataPool | null,
): Partial<Record<MealSlot, VkPreviewMeal>> {
  const out = { ...existing };
  for (const s of missing) {
    if (!out[s]) out[s] = pickMockMealForSlot(s, memberData ?? undefined);
  }
  return out;
}
