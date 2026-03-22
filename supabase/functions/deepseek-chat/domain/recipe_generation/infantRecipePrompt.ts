/**
 * Компактный промпт для прикорма (6–11 мес), только recipe-path.
 * Standard V3 prompt не используется и не копируется.
 */
import { CMPA_SAFETY_RULE, MEAL_SOUP_RULES } from "../../prompts.ts";
import type { MemberData } from "../../buildPrompt.ts";

export type InfantStage = "6_7" | "8_9" | "10_11";

export function resolveInfantStage(ageMonths: number): InfantStage {
  if (ageMonths <= 7) return "6_7";
  if (ageMonths <= 9) return "8_9";
  return "10_11";
}

function stageRules(stage: InfantStage): string {
  switch (stage) {
    case "6_7":
      return [
        "Этап 6–7 мес: только очень простые однокомпонентные или 2–3 ингредиента.",
        "Текстура: однородное пюре или очень мягкое пюре без кусочков.",
        "Подача: с ложки, без «взрослых» блюд (не бутерброды, не шпажки, не салаты кусками).",
      ].join("\n");
    case "8_9":
      return [
        "Этап 8–9 мес: простые блюда, 3–5 ингредиентов максимум.",
        "Текстура: густое пюре / очень мелкие мягкие крошки, без жёстких и крупных кусков.",
        "Без жарки, без сложных соусов и многослойных запеканок.",
      ].join("\n");
    case "10_11":
      return [
        "Этап 10–11 мес: всё ещё простые блюда, до ~6 ингредиентов.",
        "Текстура: мягкие мелкие кусочки, которые легко раздавить вилкой; не «стейк», не целые орехи.",
        "Подача детская: тарелка/ложка, не канапе и не фуршет.",
      ].join("\n");
  }
}

export interface InfantRecipePromptOptions {
  mealType: string;
  maxCookingTime?: number;
  servings: number;
  recentTitleKeysLine?: string;
}

export function buildInfantRecipeSystemPrompt(
  member: MemberData,
  ageMonths: number,
  options: InfantRecipePromptOptions,
): string {
  const stage = resolveInfantStage(ageMonths);
  const name = (member.name ?? "").trim() || "малыш";
  const allergies = (member.allergies ?? []).filter((a) => typeof a === "string" && a.trim()).join(", ") || "нет";
  const dislikes = (member.dislikes ?? []).filter((d) => typeof d === "string" && d.trim()).join(", ") || "нет";
  const meal = (options.mealType ?? "").trim() || "по запросу родителя";
  const servings = options.servings >= 1 ? options.servings : 1;
  const mct = options.maxCookingTime != null && Number.isFinite(options.maxCookingTime)
    ? String(Math.round(options.maxCookingTime))
    : "не задано";
  const antiRepeat = (options.recentTitleKeysLine ?? "").trim();

  return [
    "Ты — помощник Mom Recipes по первому прикорму (6–11 месяцев).",
    `Ребёнок: ${name}, возраст: ${ageMonths} мес. Этап: ${stage.replace("_", "–")}.`,
    "",
    "ЗАДАЧА: один рецепт в СТРОГОМ JSON по контракту приложения (как в chat recipe): title, description, ingredients[], steps[], mealType, servings, cookingTimeMinutes, chefAdvice, nutrition.",
    "Язык: русский. Без медицинских диагнозов и обещаний «безопасно на 100%».",
    "Не упоминай возраст в title/description как «для 7 месяцев» — возраст уже учтён.",
    "",
    stageRules(stage),
    "",
    `Приём пищи (mealType в JSON): ${meal}. Порции: ${servings}. Время готовки (мин), если уместно: ${mct}.`,
    antiRepeat ? antiRepeat : "",
    "",
    "ИСКЛЮЧИТЬ из рецепта (аллергии профиля): " + allergies + ".",
    "НЕ использовать (dislikes): " + dislikes + ".",
    "",
    MEAL_SOUP_RULES.trim(),
    "",
    CMPA_SAFETY_RULE.trim(),
    "",
    "ЗАПРЕТЫ: соль и сахар не добавлять; мёд; цельное коровье молоко как напиток; алкоголь; острое; жарка/гриль как основной способ; цельные орехи; сырые яйца; копчёности.",
    "Делай короткие шаги (обычно 3–6), понятные родителю.",
    "",
    "Ответ ТОЛЬКО одним JSON-объектом, без markdown и без текста до/после.",
  ].filter(Boolean).join("\n");
}
