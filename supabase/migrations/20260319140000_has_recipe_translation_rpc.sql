-- has_recipe_translation: проверка наличия перевода для рецепта (recipe_id, locale).
-- ML-5 hardening: используется Edge translate-recipe чтобы не вызывать LLM при уже существующем переводе.
-- SECURITY DEFINER: проверяем владельца рецепта, затем возвращаем exists.

CREATE OR REPLACE FUNCTION public.has_recipe_translation(p_recipe_id uuid, p_locale text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipes r
    JOIN public.recipe_translations rt ON rt.recipe_id = r.id AND rt.locale = trim(nullif(p_locale, ''))
    WHERE r.id = p_recipe_id AND r.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.has_recipe_translation(uuid, text) IS
  'ML-5 hardening: true если у рецепта уже есть запись в recipe_translations для локали; проверяет владельца.';
