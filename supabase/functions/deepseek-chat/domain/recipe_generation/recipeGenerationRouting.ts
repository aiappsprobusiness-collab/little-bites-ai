/**
 * Маршрутизация только для пути генерации рецепта (recipe JSON).
 * Не использовать для SOS, balance, обычного чата без рецепта.
 */
import type { MemberData } from "../../buildPrompt.ts";

export type RecipeGenerationRouteKind = "standard" | "under_12_curated_block";

/** Единый UX для детей до 12 мес: без LLM, только curated-пул в плане + Помощь маме. */
export const UNDER_12_CURATED_RECIPE_BLOCK_MESSAGE = [
  "Для малышей до года мы не создаём рецепты автоматически — нам важно, чтобы рекомендации были максимально бережными и проверенными 🤍",
  "Вы можете выбрать подходящие блюда в плане прикорма или заглянуть в раздел «Помощь маме» — там есть подсказки по введению продуктов.",
].join("\n\n");

export const UNDER_12_CURATED_RECIPE_ROUTE = "under_12_curated_recipe_block" as const;
export const UNDER_12_CURATED_RECIPE_REASON_CODE = "under_12_curated_recipe_block" as const;

export type Under12CuratedRecipeBlockPayload = {
  message: string;
  recipes: [];
  route: typeof UNDER_12_CURATED_RECIPE_ROUTE;
  reason_code: typeof UNDER_12_CURATED_RECIPE_REASON_CODE;
};

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
 * Ребёнок до 12 мес с известным числовым возрастом — AI-рецепт в чате не генерируем (только curated в плане).
 * Учитывает `age_months` и `ageMonths` (camelCase с клиента).
 */
export function isUnderOneYearChildForRecipeGeneration(member: MemberData | null | undefined): boolean {
  if (!member) return false;
  const role = normalizeMemberTypeForRecipeRouting(member);
  if (role !== "child") return false;
  const ageRaw = member.age_months ?? member.ageMonths;
  if (typeof ageRaw !== "number" || Number.isNaN(ageRaw)) return false;
  const age = Math.max(0, Math.floor(ageRaw));
  return age < 12;
}

/**
 * Payload для ответа Edge без вызова LLM (тот же контракт, что ранее у under_6 / infant reject: message + recipes[] + route + reason_code).
 */
export function buildUnder12CuratedRecipeBlockPayload(): Under12CuratedRecipeBlockPayload {
  return {
    message: UNDER_12_CURATED_RECIPE_BLOCK_MESSAGE,
    recipes: [],
    route: UNDER_12_CURATED_RECIPE_ROUTE,
    reason_code: UNDER_12_CURATED_RECIPE_REASON_CODE,
  };
}

/**
 * Определяет ветку генерации рецепта. Вызывать только при isRecipeRequest.
 * Семья → всегда standard. До 12 мес у одного ребёнка → curated block (без LLM).
 */
export function resolveRecipeGenerationRoute(args: {
  isRecipeRequest: boolean;
  targetIsFamily: boolean;
  member: MemberData | null | undefined;
}): RecipeGenerationRouteKind {
  if (!args.isRecipeRequest) return "standard";
  if (args.targetIsFamily) return "standard";
  if (isUnderOneYearChildForRecipeGeneration(args.member)) return "under_12_curated_block";
  return "standard";
}
