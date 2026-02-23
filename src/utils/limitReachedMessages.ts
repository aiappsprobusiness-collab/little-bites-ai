/**
 * Тексты для paywall при LIMIT_REACHED по фиче (Free 2/день).
 * Заголовок единый: "Лимит на сегодня исчерпан".
 */

export type LimitReachedFeature = "chat_recipe" | "plan_refresh" | "plan_fill_day" | "help";

export function getLimitReachedTitle(): string {
  return "Лимит на сегодня исчерпан";
}

export function getLimitReachedMessage(feature: LimitReachedFeature): string {
  switch (feature) {
    case "chat_recipe":
      return "В Free доступно 2 рецепта в день. В Trial/Premium — без ограничений.";
    case "plan_refresh":
    case "plan_fill_day":
      return "В Free доступно 2 действия в день. В Trial/Premium — без ограничений.";
    case "help":
      return "В Free доступно 2 вопроса в день. В Trial/Premium — без ограничений.";
    default:
      return "В Trial/Premium — без ограничений.";
  }
}
