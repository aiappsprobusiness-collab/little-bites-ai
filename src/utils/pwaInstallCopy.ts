import type { A2HSTriggerSource } from "@/hooks/usePWAInstall";

export const PWA_INSTALL_TITLE = "Добавьте на главный экран";

export function getInstallPromptDescription(
  triggerSource: "" | A2HSTriggerSource,
  hasAccess: boolean,
): string {
  const withShoppingList = hasAccess && triggerSource === "week";
  if (withShoppingList) {
    return "Меню и список продуктов уже готовы — откройте Mom Recipes в один тап, как обычное приложение.";
  }
  if (triggerSource === "recipe") {
    return "Рецепты и чат будут открываться сразу с экрана телефона, без вкладки браузера.";
  }
  if (triggerSource === "day" || triggerSource === "week" || triggerSource === "plan") {
    return "Меню на день и неделю всегда под рукой — без поиска вкладки в браузере.";
  }
  return "Рецепты, меню и список продуктов — в один тап с главного экрана.";
}
