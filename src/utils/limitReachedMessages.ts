/**
 * Тексты для paywall при LIMIT_REACHED по фиче (Free 2/день и др.).
 */

export type LimitReachedFeature = "chat_recipe" | "plan_refresh" | "plan_fill_day" | "help";

export function getLimitReachedTitle(feature: LimitReachedFeature): string {
  switch (feature) {
    case "chat_recipe":
      return "Сегодня вы задали максимум вопросов 🙌";
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
      return "В бесплатной версии есть лимит на вопросы. С полной версией можно получать помощь без ограничений.";
    case "help":
      return "В бесплатной версии есть лимит. В полной — можно обращаться без ограничений.";
    case "plan_refresh":
      return "Обновление плана доступно в полной версии. Меняйте блюда без лишних раздумий.";
    case "plan_fill_day":
      return "В бесплатной версии есть ограничения на генерацию. В полной — можно обновлять план без ограничений.";
    default:
      return "Попробуйте завтра или откройте полную версию — там больше свободы в действиях.";
  }
}
