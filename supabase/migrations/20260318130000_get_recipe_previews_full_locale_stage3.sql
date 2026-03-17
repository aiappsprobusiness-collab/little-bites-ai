-- Stage 3: locale-aware get_recipe_previews and get_recipe_full.
-- Optional p_locale: when set, use recipe_translations with fallback to recipes.*
-- Empty translation field => fallback (NULLIF(trim(...), '') + COALESCE).
-- Calls without p_locale unchanged (same as before).

-- ========== get_recipe_previews(recipe_ids, p_locale) ==========
DROP FUNCTION IF EXISTS public.get_recipe_previews(uuid[]);

CREATE FUNCTION public.get_recipe_previews(recipe_ids uuid[], p_locale text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  cooking_time_minutes integer,
  min_age_months integer,
  max_age_months integer,
  ingredient_names text[],
  ingredient_total_count bigint,
  is_favorite boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    COALESCE(NULLIF(trim(rt.title), ''), r.title) AS title,
    COALESCE(NULLIF(trim(rt.description), ''), r.description) AS description,
    r.cooking_time_minutes,
    r.min_age_months,
    r.max_age_months,
    COALESCE(
      (SELECT array_agg(sub.name) FROM (
        SELECT ri.name FROM recipe_ingredients ri
        WHERE ri.recipe_id = r.id
        ORDER BY ri.order_index, ri.id
        LIMIT 4
      ) sub),
      '{}'::text[]
    ) AS ingredient_names,
    (SELECT count(*)::bigint FROM recipe_ingredients WHERE recipe_id = r.id) AS ingredient_total_count,
    EXISTS (
      SELECT 1 FROM public.favorites_v2 f
      WHERE f.user_id = auth.uid() AND f.recipe_id = r.id
    ) AS is_favorite
  FROM recipes r
  LEFT JOIN recipe_translations rt
    ON rt.recipe_id = r.id AND rt.locale = p_locale AND p_locale IS NOT NULL
  WHERE r.id = ANY(recipe_ids)
    AND (
      r.user_id = auth.uid()
      OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom')
      OR (auth.uid() IS NOT NULL AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai'))
    );
$$;

COMMENT ON FUNCTION public.get_recipe_previews(uuid[], text) IS
  'Preview for recipe cards. Optional p_locale: use recipe_translations with fallback to recipes. Access: own, user_custom by owner, or pool. is_favorite from favorites_v2.';

-- ========== get_recipe_full(p_recipe_id, p_locale) ==========
DROP FUNCTION IF EXISTS public.get_recipe_full(uuid);

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
  chef_advice text,
  advice text,
  created_at timestamptz,
  updated_at timestamptz,
  steps_json jsonb,
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
    COALESCE(NULLIF(trim(rt.chef_advice), ''), r.chef_advice) AS chef_advice,
    r.advice,
    r.created_at,
    r.updated_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('step_number', rs.step_number, 'instruction', rs.instruction) ORDER BY rs.step_number)
       FROM recipe_steps rs WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    ) AS steps_json,
    EXISTS (SELECT 1 FROM public.favorites_v2 f WHERE f.user_id = auth.uid() AND f.recipe_id = r.id) AS is_favorite
  FROM recipes r
  LEFT JOIN recipe_translations rt
    ON rt.recipe_id = r.id AND rt.locale = p_locale AND p_locale IS NOT NULL
  WHERE r.id = p_recipe_id
    AND (r.user_id = auth.uid() OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom'));
$$;

COMMENT ON FUNCTION public.get_recipe_full(uuid, text) IS
  'Full recipe for detail screen. Optional p_locale: title/description/chef_advice from recipe_translations with fallback to recipes. Steps/ingredients not localized yet.';
