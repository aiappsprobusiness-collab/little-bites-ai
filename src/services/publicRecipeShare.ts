/**
 * Публичная загрузка рецепта по share_ref для страницы /r/:shareRef.
 * Использует RPC get_recipe_by_share_ref (доступен anon). ML-7: передаём p_locale для локализованного контента.
 */

import { supabase } from "@/integrations/supabase/client";
import { getAppLocale } from "@/utils/appLocale";

export interface PublicRecipePayload {
  id: string;
  title: string | null;
  description: string | null;
  meal_type: string | null;
  cooking_time_minutes: number | null;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  ingredients: Array<{
    name?: string | null;
    display_text?: string | null;
    amount?: number | null;
    unit?: string | null;
    canonical_amount?: number | null;
    canonical_unit?: string | null;
    substitute?: string | null;
    order_index?: number | null;
  }>;
  steps: Array<{ instruction?: string | null; step_number?: number | null }>;
  chef_advice?: string | null;
  advice?: string | null;
  [key: string]: unknown;
}

/**
 * Загрузить рецепт по share_ref. Возвращает null, если ref не найден или рецепт недоступен.
 */
export async function getRecipeByShareRef(shareRef: string): Promise<PublicRecipePayload | null> {
  const ref = shareRef?.trim();
  if (!ref) return null;

  const { data, error } = await supabase.rpc("get_recipe_by_share_ref", {
    p_share_ref: ref,
    p_locale: getAppLocale(),
  });

  if (error || data == null) return null;

  const raw = data as {
    recipe?: Record<string, unknown>;
    ingredients?: unknown[];
    steps?: unknown[];
  };
  const recipe = raw.recipe;
  if (!recipe || typeof recipe !== "object") return null;

  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = [...rawSteps].sort((a, b) => {
    const na = (a as { step_number?: number }).step_number ?? 0;
    const nb = (b as { step_number?: number }).step_number ?? 0;
    return na - nb;
  });

  return {
    ...recipe,
    ingredients,
    steps,
  } as PublicRecipePayload;
}
