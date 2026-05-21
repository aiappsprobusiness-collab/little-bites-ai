/**
 * Тексты для кастомного paywall при LIMIT_REACHED (две строки в message).
 */

export type LimitReachedFeature = "chat_recipe" | "plan_refresh" | "plan_fill_day" | "help";

export function getLimitReachedTitle(feature: LimitReachedFeature): string {
  switch (feature) {
    case "chat_recipe":
      return "Сегодня лимит подборов исчерпан 🙌";
    case "help":
      return "Сегодня вы уже получили помощь 🙌";
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
      return "В бесплатной версии — до 5 подборов в день.\nВ полной — до 20 подборов в день.";
    case "help":
      return "В бесплатной версии — 2 вопроса в день.\nВ полной — до 20 вопросов в день.";
    case "plan_refresh":
      return "Обновление плана — в полной версии\nМеняйте блюда, когда хочется чего-то другого";
    case "plan_fill_day":
      return "В бесплатной версии есть лимит на генерацию\nС полной — меню можно обновить без лишних раздумий";
    default:
      return "Попробуйте завтра или откройте полную версию";
  }
}
