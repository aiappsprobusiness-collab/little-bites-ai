import { FREE_MEAL_SWAP_PER_DAY } from "@/utils/subscriptionRules";

export const MEAL_SWAP_LIMIT_TOAST_TITLE = "Замены на сегодня закончились";

/** Описание тоста при исчерпании дневного лимита замен (Free). */
export function getMealSwapLimitToastDescription(
  dailyLimit: number = FREE_MEAL_SWAP_PER_DAY,
): string {
  const n = Math.max(1, Math.floor(dailyLimit));
  if (n === 2) {
    return "Сегодня можно поменять 2 блюда. В полной версии — без ограничений.";
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  const dishWord =
    mod100 >= 11 && mod100 <= 14 ? "блюд" : mod10 === 1 ? "блюдо" : mod10 >= 2 && mod10 <= 4 ? "блюда" : "блюд";
  return `Сегодня можно поменять ${n} ${dishWord}. В полной версии — без ограничений.`;
}
