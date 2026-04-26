-- Публичная загрузка рецепта из каталожного пула по UUID (для /recipe/teaser/:id из Telegram и др.).
-- Только source из пула превью — без user_custom и без утечки чужих кастомных рецептов.

CREATE OR REPLACE FUNCTION public.get_public_catalog_recipe_by_id(p_recipe_id uuid, p_locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_recipe_id IS NULL THEN
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
           'substitute', ri.substitute,
           'display_amount', ri.display_amount,
           'display_unit', ri.display_unit,
           'display_quantity_text', ri.display_quantity_text,
           'measurement_mode', ri.measurement_mode
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
  WHERE r.id = p_recipe_id
    AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai');

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_catalog_recipe_by_id(uuid, text) IS
  'Публичный тизер рецепта по id: только каталожный пул (как get_recipe_previews). Формат ответа как у get_recipe_by_share_ref.';

GRANT EXECUTE ON FUNCTION public.get_public_catalog_recipe_by_id(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalog_recipe_by_id(uuid, text) TO authenticated;
