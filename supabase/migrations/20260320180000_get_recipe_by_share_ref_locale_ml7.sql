-- ML-7: get_recipe_by_share_ref с опциональным p_locale для локализованного контента на публичной странице шаринга.

DROP FUNCTION IF EXISTS public.get_recipe_by_share_ref(text);

CREATE OR REPLACE FUNCTION public.get_recipe_by_share_ref(p_share_ref text, p_locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
  v_result jsonb;
BEGIN
  IF p_share_ref IS NULL OR trim(p_share_ref) = '' THEN
    RETURN NULL;
  END IF;

  SELECT recipe_id INTO v_recipe_id
  FROM public.share_refs
  WHERE share_ref = trim(p_share_ref)
  LIMIT 1;

  IF v_recipe_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'recipe', CASE
      WHEN p_locale IS NULL OR trim(p_locale) = '' THEN to_jsonb(r)
      ELSE to_jsonb(r) || jsonb_build_object(
        'title', COALESCE(NULLIF(trim(rt.title), ''), r.title),
        'description', COALESCE(NULLIF(trim(rt.description), ''), r.description),
        'chef_advice', COALESCE(NULLIF(trim(rt.chef_advice), ''), r.chef_advice)
      )
    END,
    'ingredients', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', ri.id,
           'name', COALESCE(NULLIF(trim(rit.name), ''), ri.name),
           'display_text', COALESCE(NULLIF(trim(rit.display_text), ''), ri.display_text),
           'amount', ri.amount,
           'unit', ri.unit,
           'order_index', ri.order_index,
           'category', ri.category,
           'canonical_amount', ri.canonical_amount,
           'canonical_unit', ri.canonical_unit,
           'substitute', ri.substitute
         ) ORDER BY ri.order_index NULLS LAST, ri.name
       )
       FROM public.recipe_ingredients ri
       LEFT JOIN public.recipe_ingredient_translations rit ON rit.recipe_ingredient_id = ri.id AND rit.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
       WHERE ri.recipe_id = r.id),
      '[]'::jsonb
    ),
    'steps', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', rs.id,
           'step_number', rs.step_number,
           'instruction', COALESCE(NULLIF(trim(rst.instruction), ''), rs.instruction),
           'duration_minutes', rs.duration_minutes,
           'image_url', rs.image_url
         ) ORDER BY rs.step_number
       )
       FROM public.recipe_steps rs
       LEFT JOIN public.recipe_step_translations rst ON rst.recipe_step_id = rs.id AND rst.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
       WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM public.recipes r
  LEFT JOIN public.recipe_translations rt ON rt.recipe_id = r.id AND rt.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
  WHERE r.id = v_recipe_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_recipe_by_share_ref(text, text) IS
  'Публичное чтение рецепта по короткой ссылке шаринга /r/:shareRef. При p_locale — title/description/chef_advice и steps/ingredients с fallback на базовые данные.';

GRANT EXECUTE ON FUNCTION public.get_recipe_by_share_ref(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_recipe_by_share_ref(text, text) TO authenticated;
