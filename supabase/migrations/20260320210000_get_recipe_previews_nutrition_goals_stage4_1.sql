-- Stage 4.1: expose nutrition_goals in get_recipe_previews (plan/favorites preview cards).

DROP FUNCTION IF EXISTS public.get_recipe_previews(uuid[], text);

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
  is_favorite boolean,
  nutrition_goals jsonb
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
    ) AS is_favorite,
    COALESCE(r.nutrition_goals, '[]'::jsonb) AS nutrition_goals
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
  'Preview for recipe cards. Stage 4.1 adds nutrition_goals jsonb. Optional p_locale: recipe_translations with fallback.';
