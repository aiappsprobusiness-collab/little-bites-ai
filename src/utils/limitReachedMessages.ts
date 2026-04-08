/**
 * Тексты для paywall при LIMIT_REACHED по фиче (Free 2/день).
 */

export type LimitReachedFeature = "chat_recipe" | "plan_refresh" | "plan_fill_day" | "help";

export function getLimitReachedTitle(feature: LimitReachedFeature): string {
  switch (feature) {
    case "chat_recipe":
      return "Сегодня вы задали максимум вопросов 🙌";
    case "help":
      return "Сегодня вы задали максимум вопросов 🙌";
    case "plan_refresh":
    case "plan_fill_day":
      return "На сегодня лимит действий исчерпан ⏳";
    default:
      return "На сегодня лимит исчерпан ⏳";
  }
}

export function getLimitReachedMessage(feature: LimitReachedFeature): string {
  switch (feature) {
    case "chat_recipe":
      return "В полной версии можно задавать вопросы без ограничений и получать помощь в любой ситуации.";
    case "help":
      return "В полной версии можно задавать вопросы без ограничений и получать помощь в любой ситуации.";
    case "plan_refresh":
    case "plan_fill_day":
      return "В бесплатной версии можно несколько раз обновить план за день. В полной — спокойно пересобирайте меню без такого лимита.";
    default:
      return "Попробуйте завтра или откройте полную версию — там больше свободы в действиях.";
  }
}
