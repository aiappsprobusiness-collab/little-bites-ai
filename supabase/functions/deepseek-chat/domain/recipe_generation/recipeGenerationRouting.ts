/**
 * Маршрутизация только для пути генерации рецепта (recipe JSON).
 * Не использовать для SOS, balance, обычного чата без рецепта.
 */
import type { MemberData } from "../../buildPrompt.ts";

export type RecipeGenerationRouteKind = "standard" | "infant" | "under_6_block";

/** Сообщение при блокировке рецепта для детей 0–5 мес (без LLM, без сохранения). Единый UX-текст. */
export const UNDER_6_RECIPE_BLOCK_MESSAGE = [
  "Сейчас подбирать рецепты ещё рано — обычно прикорм начинают примерно с 6 месяцев.",
  "Пока лучше ориентироваться на привычное питание малыша и рекомендации вашего педиатра.",
  "Когда ребёнку исполнится 6 месяцев, я помогу подобрать первые блюда для начала прикорма.",
].join("\n\n");

/**
 * Нормализация типа профиля для routing (рецепты).
 * Если `type` не передан: считаем «ребёнком» только при явном числовом возрасте &lt; 12 мес (компромисс для старых клиентов).
 */
export function normalizeMemberTypeForRecipeRouting(member: MemberData | null | undefined): "child" | "adult" | "family" | "unknown" {
  if (!member) return "unknown";
  const t = typeof member.type === "string" ? member.type.trim().toLowerCase() : "";
  if (t === "child" || t === "adult" || t === "family") return t;

  const ageRaw = member.age_months ?? member.ageMonths;
  if (typeof ageRaw === "number" && !Number.isNaN(ageRaw) && ageRaw >= 0 && ageRaw < 12) {
    return "child";
  }
  return "unknown";
}

/**
 * Определяет ветку генерации рецепта. Вызывать только при isRecipeRequest.
 * Семья → всегда standard. Infant только: child + числовой age 6–11.
 */
export function resolveRecipeGenerationRoute(args: {
  isRecipeRequest: boolean;
  targetIsFamily: boolean;
  member: MemberData | null | undefined;
}): RecipeGenerationRouteKind {
  if (!args.isRecipeRequest) return "standard";
  if (args.targetIsFamily) return "standard";

  const m = args.member;
  const role = normalizeMemberTypeForRecipeRouting(m);
  if (role !== "child") return "standard";

  const ageRaw = m?.age_months ?? m?.ageMonths;
  const hasNumericAge = typeof ageRaw === "number" && !Number.isNaN(ageRaw);
  if (!hasNumericAge) return "standard";

  const age = Math.max(0, Math.floor(ageRaw));

  if (age >= 0 && age < 6) return "under_6_block";
  if (age >= 6 && age < 12) return "infant";
  return "standard";
}
