-- upsert_recipe_translation: запись/обновление перевода рецепта (title, description, chef_advice).
-- Вызывается из Edge function translate-recipe после проверки владельца.
-- SECURITY DEFINER: проверяем recipe.user_id = auth.uid(), затем пишем в recipe_translations.

CREATE OR REPLACE FUNCTION public.upsert_recipe_translation(
  p_recipe_id uuid,
  p_locale text,
  p_title text,
  p_description text,
  p_chef_advice text,
  p_translation_status text DEFAULT 'auto_generated',
  p_source text DEFAULT 'ai'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_recipe_id IS NULL OR p_locale IS NULL OR trim(p_locale) = '' THEN
    RETURN;
  END IF;

  IF p_translation_status IS NULL OR p_translation_status NOT IN ('draft', 'auto_generated', 'reviewed') THEN
    p_translation_status := 'auto_generated';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'ai', 'imported') THEN
    p_source := 'ai';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.recipes
  WHERE id = p_recipe_id;

  IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.recipe_translations (
    recipe_id,
    locale,
    title,
    description,
    chef_advice,
    translation_status,
    source
  ) VALUES (
    p_recipe_id,
    trim(p_locale),
    nullif(trim(p_title), ''),
    nullif(trim(p_description), ''),
    nullif(trim(p_chef_advice), ''),
    p_translation_status,
    p_source
  )
  ON CONFLICT (recipe_id, locale)
  DO UPDATE SET
    title = COALESCE(nullif(trim(EXCLUDED.title), ''), recipe_translations.title),
    description = COALESCE(nullif(trim(EXCLUDED.description), ''), recipe_translations.description),
    chef_advice = COALESCE(nullif(trim(EXCLUDED.chef_advice), ''), recipe_translations.chef_advice),
    translation_status = EXCLUDED.translation_status,
    source = EXCLUDED.source,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.upsert_recipe_translation(uuid, text, text, text, text, text, text) IS
  'ML-5: Upsert translation row for recipe (title, description, chef_advice). Caller must be recipe owner. Used by translate-recipe Edge function.';
