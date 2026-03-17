/**
 * Единый источник locale для ML-4: чтение рецептов с учётом языка.
 * Используется в RPC get_recipe_previews / get_recipe_full (p_locale).
 * Не заменяет полноценный i18n UI.
 */
export function getAppLocale(): string {
  try {
    const lang = navigator.language || "en";
    return lang.split("-")[0]; // 'en-US' → 'en'
  } catch {
    return "en";
  }
}
