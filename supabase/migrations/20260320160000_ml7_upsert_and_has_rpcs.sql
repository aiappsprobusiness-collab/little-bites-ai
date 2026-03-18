-- ML-7: SECURITY DEFINER RPCs для записи и проверки переводов steps/ingredients.
-- Ownership: только владелец рецепта (r.user_id = auth.uid()) может вызывать upsert и получать true в has_*.

-- ========== upsert_recipe_step_translation ==========
CREATE OR REPLACE FUNCTION public.upsert_recipe_step_translation(
  p_recipe_step_id uuid,
  p_locale text,
  p_instruction text,
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
  IF p_recipe_step_id IS NULL OR p_locale IS NULL OR trim(p_locale) = '' THEN
    RETURN;
  END IF;

  IF p_translation_status IS NULL OR p_translation_status NOT IN ('draft', 'auto_generated', 'reviewed') THEN
    p_translation_status := 'auto_generated';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'ai', 'imported') THEN
    p_source := 'ai';
  END IF;

  SELECT r.user_id INTO v_user_id
  FROM public.recipe_steps rs
  JOIN public.recipes r ON r.id = rs.recipe_id
  WHERE rs.id = p_recipe_step_id;

  IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.recipe_step_translations (
    recipe_step_id,
    locale,
    instruction,
    translation_status,
    source
  ) VALUES (
    p_recipe_step_id,
    trim(p_locale),
    nullif(trim(p_instruction), ''),
    p_translation_status,
    p_source
  )
  ON CONFLICT (recipe_step_id, locale)
  DO UPDATE SET
    instruction = COALESCE(nullif(trim(EXCLUDED.instruction), ''), recipe_step_translations.instruction),
    translation_status = EXCLUDED.translation_status,
    source = EXCLUDED.source,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.upsert_recipe_step_translation(uuid, text, text, text, text) IS
  'ML-7: Upsert step translation. Caller must be recipe owner. Used by translate-recipe Edge.';

-- ========== upsert_recipe_ingredient_translation ==========
CREATE OR REPLACE FUNCTION public.upsert_recipe_ingredient_translation(
  p_recipe_ingredient_id uuid,
  p_locale text,
  p_name text,
  p_display_text text,
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
  IF p_recipe_ingredient_id IS NULL OR p_locale IS NULL OR trim(p_locale) = '' THEN
    RETURN;
  END IF;

  IF p_translation_status IS NULL OR p_translation_status NOT IN ('draft', 'auto_generated', 'reviewed') THEN
    p_translation_status := 'auto_generated';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'ai', 'imported') THEN
    p_source := 'ai';
  END IF;

  SELECT r.user_id INTO v_user_id
  FROM public.recipe_ingredients ri
  JOIN public.recipes r ON r.id = ri.recipe_id
  WHERE ri.id = p_recipe_ingredient_id;

  IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.recipe_ingredient_translations (
    recipe_ingredient_id,
    locale,
    name,
    display_text,
    translation_status,
    source
  ) VALUES (
    p_recipe_ingredient_id,
    trim(p_locale),
    nullif(trim(p_name), ''),
    nullif(trim(p_display_text), ''),
    p_translation_status,
    p_source
  )
  ON CONFLICT (recipe_ingredient_id, locale)
  DO UPDATE SET
    name = COALESCE(nullif(trim(EXCLUDED.name), ''), recipe_ingredient_translations.name),
    display_text = COALESCE(nullif(trim(EXCLUDED.display_text), ''), recipe_ingredient_translations.display_text),
    translation_status = EXCLUDED.translation_status,
    source = EXCLUDED.source,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.upsert_recipe_ingredient_translation(uuid, text, text, text, text, text) IS
  'ML-7: Upsert ingredient translation. Caller must be recipe owner. Used by translate-recipe Edge.';

-- ========== has_recipe_steps_translation ==========
CREATE OR REPLACE FUNCTION public.has_recipe_steps_translation(p_recipe_id uuid, p_locale text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = p_recipe_id AND r.user_id = auth.uid()) THEN false
    WHEN (SELECT count(*) FROM public.recipe_steps WHERE recipe_id = p_recipe_id) = 0 THEN true
    ELSE (
      SELECT count(*) = (SELECT count(*) FROM public.recipe_steps WHERE recipe_id = p_recipe_id)
      FROM public.recipe_steps rs
      JOIN public.recipe_step_translations rst ON rst.recipe_step_id = rs.id AND rst.locale = trim(nullif(p_locale, ''))
      WHERE rs.recipe_id = p_recipe_id AND nullif(trim(rst.instruction), '') IS NOT NULL
    )
  END;
$$;

COMMENT ON FUNCTION public.has_recipe_steps_translation(uuid, text) IS
  'ML-7: true if recipe has no steps or every step has a non-empty translation for locale. Checks recipe ownership.';

-- ========== has_recipe_ingredients_translation ==========
CREATE OR REPLACE FUNCTION public.has_recipe_ingredients_translation(p_recipe_id uuid, p_locale text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = p_recipe_id AND r.user_id = auth.uid()) THEN false
    WHEN (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id = p_recipe_id) = 0 THEN true
    ELSE (
      SELECT count(*) = (SELECT count(*) FROM public.recipe_ingredients WHERE recipe_id = p_recipe_id)
      FROM public.recipe_ingredients ri
      JOIN public.recipe_ingredient_translations rit ON rit.recipe_ingredient_id = ri.id AND rit.locale = trim(nullif(p_locale, ''))
      WHERE ri.recipe_id = p_recipe_id
      AND (nullif(trim(rit.name), '') IS NOT NULL OR nullif(trim(rit.display_text), '') IS NOT NULL)
    )
  END;
$$;

COMMENT ON FUNCTION public.has_recipe_ingredients_translation(uuid, text) IS
  'ML-7: true if recipe has no ingredients or every ingredient has name or display_text translation for locale. Checks recipe ownership.';

-- ========== has_recipe_full_locale_pack (optional helper) ==========
CREATE OR REPLACE FUNCTION public.has_recipe_full_locale_pack(p_recipe_id uuid, p_locale text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = p_recipe_id AND r.user_id = auth.uid())
  AND public.has_recipe_translation(p_recipe_id, p_locale) = true
  AND public.has_recipe_steps_translation(p_recipe_id, p_locale) = true
  AND public.has_recipe_ingredients_translation(p_recipe_id, p_locale) = true;
$$;

COMMENT ON FUNCTION public.has_recipe_full_locale_pack(uuid, text) IS
  'ML-7: true if recipe has full locale pack: recipe_translations + all steps + all ingredients translated for locale.';
