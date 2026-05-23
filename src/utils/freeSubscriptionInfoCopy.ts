import {
  FREE_MEAL_SWAP_PER_DAY,
  SUBSCRIPTION_LIMITS,
} from "@/utils/subscriptionRules";
import { getRemainingRecipesText } from "@/utils/recipePickHintCopy";

export const FREE_SUBSCRIPTION_INFO_TITLE = "У вас бесплатная версия";

export type FreeSubscriptionInfoMode = "recipes" | "help";

const FREE_LIMITS = SUBSCRIPTION_LIMITS.free;

/** Краткий список лимитов бесплатной версии для bottom sheet. */
export const FREE_SUBSCRIPTION_INFO_BULLETS: readonly string[] = [
  `План питания — на день`,
  `Замена блюда — ${FREE_MEAL_SWAP_PER_DAY} в день`,
  `Подбор рецептов в чате — до ${FREE_LIMITS.aiDailyLimit} в день`,
  `Помощь маме — до ${FREE_LIMITS.helpDailyLimit} вопросов в день`,
  `Профиль ребёнка — один`,
];

function helpRemainingLine(used: number, limit: number): string {
  const lim = Math.max(1, Math.floor(limit));
  const left = Math.max(0, lim - Math.max(0, Math.floor(used)));
  const ofLimitWord = lim === 1 ? "вопроса" : "вопросов";
  if (left <= 0) {
    return `Сегодня вопросы в «Помощь маме» закончились (0 из ${lim} ${ofLimitWord}).`;
  }
  return `Сегодня осталось ${left} из ${lim} ${ofLimitWord} в «Помощь маме».`;
}

/** Первая строка под заголовком — актуальный счётчик для текущей вкладки чата. */
export function getFreeSubscriptionInfoLead(params: {
  mode: FreeSubscriptionInfoMode;
  recipeRemaining: number | null;
  recipeDailyLimit: number | null;
  helpUsed: number;
  helpDailyLimit: number | null;
}): string {
  const { mode, recipeRemaining, recipeDailyLimit, helpUsed, helpDailyLimit } = params;

  if (mode === "help" && helpDailyLimit != null) {
    return helpRemainingLine(helpUsed, helpDailyLimit);
  }

  if (
    mode === "recipes" &&
    recipeRemaining != null &&
    recipeDailyLimit != null &&
    recipeDailyLimit > 0
  ) {
    return `${getRemainingRecipesText(recipeRemaining, recipeDailyLimit).replace(/^Осталось:/, "Сегодня осталось")}.`;
  }

  return "В полной версии — больше подборов, замен без лимита и список покупок на неделю.";
}
