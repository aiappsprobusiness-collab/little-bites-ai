/**
 * ML-5: Запрос перевода рецепта после сохранения (fire-and-forget).
 * Вызывается после create/save, когда известен recipe_id.
 * Не блокирует UI; ошибки обрабатываются на Edge.
 */
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { getAppLocale } from "@/utils/appLocale";

const TRANSLATE_FN = "/functions/v1/translate-recipe";

export function requestRecipeTranslation(recipeId: string | null | undefined): void {
  if (!recipeId || typeof recipeId !== "string" || !recipeId.trim()) return;

  const baseUrl = SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl || !SUPABASE_PUBLISHABLE_KEY) return;

  supabase.auth.getSession().then(({ data: { session } }) => {
    const token = session?.access_token;
    if (!token) return;

    const targetLocale = getAppLocale();
    fetch(`${baseUrl}${TRANSLATE_FN}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY ?? "",
      },
      body: JSON.stringify({
        recipe_id: recipeId,
        target_locale: targetLocale,
      }),
    }).catch(() => {
      // Fire-and-forget: не логируем в консоль пользователя
    });
  });
}
