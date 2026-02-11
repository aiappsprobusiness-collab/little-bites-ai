-- Add is_favorite to get_recipe_previews RPC return
-- Must DROP first because return type changes

DROP FUNCTION IF EXISTS public.get_recipe_previews(uuid[]);

CREATE FUNCTION public.get_recipe_previews(recipe_ids uuid[])
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
    r.title,
    r.description,
    r.cooking_time_minutes,
    r.min_age_months,
    r.max_age_months,
    COALESCE(
      (
        SELECT array_agg(sub.name)
        FROM (
          SELECT ri.name
          FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.id
          ORDER BY ri.order_index, ri.id
          LIMIT 4
        ) sub
      ),
      '{}'::text[]
    ) AS ingredient_names,
    (
      SELECT count(*)::bigint
      FROM recipe_ingredients
      WHERE recipe_id = r.id
    ) AS ingredient_total_count,
    COALESCE(r.is_favorite, false) AS is_favorite
  FROM recipes r
  WHERE r.id = ANY(recipe_ids)
    AND r.user_id = auth.uid();
$$;
