/**
 * Короткие фразы для поля ввода чата при переходе из плана (слот / пустой день).
 * Единая точка маппинга meal_type → текст; обращение на «вы».
 */
export const PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE = {
  breakfast: "Подберите завтрак",
  lunch: "Подберите обед",
  snack: "Подберите перекус",
  dinner: "Подберите ужин",
} as const;

export type PlanSlotMealTypeId = keyof typeof PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE;

export function getPlanSlotChatPrefillMessage(mealType: string): string {
  const id = mealType as PlanSlotMealTypeId;
  if (id in PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE) {
    return PLAN_SLOT_CHAT_PREFILL_BY_MEAL_TYPE[id];
  }
  return "Подберите блюдо";
}
