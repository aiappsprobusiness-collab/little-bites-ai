-- Stage 4: expose nutrition_goals in get_recipe_full.

DROP FUNCTION IF EXISTS public.get_recipe_full(uuid, text);

CREATE FUNCTION public.get_recipe_full(p_recipe_id uuid, p_locale text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  child_id uuid,
  member_id uuid,
  title text,
  description text,
  image_url text,
  cooking_time_minutes integer,
  min_age_months integer,
  max_age_months integer,
  calories integer,
  proteins numeric,
  fats numeric,
  carbs numeric,
  tags text[],
  source_products text[],
  source text,
  meal_type text,
  nutrition_goals jsonb,
  chef_advice text,
  advice text,
  created_at timestamptz,
  updated_at timestamptz,
  steps_json jsonb,
  ingredients_json jsonb,
  is_favorite boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.user_id,
    r.child_id,
    r.member_id,
    COALESCE(NULLIF(trim(rt.title), ''), r.title) AS title,
    COALESCE(NULLIF(trim(rt.description), ''), r.description) AS description,
    NULL::text AS image_url,
    r.cooking_time_minutes,
    r.min_age_months,
    r.max_age_months,
    r.calories,
    r.proteins,
    r.fats,
    r.carbs,
    r.tags,
    r.source_products,
    r.source,
    r.meal_type,
    COALESCE(r.nutrition_goals, '[]'::jsonb) AS nutrition_goals,
    COALESCE(NULLIF(trim(rt.chef_advice), ''), r.chef_advice) AS chef_advice,
    r.advice,
    r.created_at,
    r.updated_at,
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', rs.id,
           'step_number', rs.step_number,
           'instruction', COALESCE(NULLIF(trim(rst.instruction), ''), rs.instruction)
         ) ORDER BY rs.step_number
       )
       FROM recipe_steps rs
       LEFT JOIN recipe_step_translations rst ON rst.recipe_step_id = rs.id AND rst.locale = p_locale
       WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    ) AS steps_json,
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'name', COALESCE(NULLIF(trim(rit.name), ''), ri.name),
           'display_text', COALESCE(NULLIF(trim(rit.display_text), ''), ri.display_text),
           'amount', ri.amount,
           'unit', ri.unit,
           'substitute', ri.substitute,
           'canonical_amount', ri.canonical_amount,
           'canonical_unit', ri.canonical_unit,
           'order_index', ri.order_index
         ) ORDER BY ri.order_index NULLS LAST, ri.name
       )
       FROM recipe_ingredients ri
       LEFT JOIN recipe_ingredient_translations rit ON rit.recipe_ingredient_id = ri.id AND rit.locale = p_locale
       WHERE ri.recipe_id = r.id),
      '[]'::jsonb
    ) AS ingredients_json,
    EXISTS (SELECT 1 FROM public.favorites_v2 f WHERE f.user_id = auth.uid() AND f.recipe_id = r.id) AS is_favorite
  FROM recipes r
  LEFT JOIN recipe_translations rt
    ON rt.recipe_id = r.id AND rt.locale = p_locale AND p_locale IS NOT NULL
  WHERE r.id = p_recipe_id
    AND (r.user_id = auth.uid() OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom'));
$$;

COMMENT ON FUNCTION public.get_recipe_full(uuid, text) IS
  'Full recipe for detail screen. Stage 4 adds nutrition_goals jsonb to response.';
