-- favorites_v2: add recipe_id for toggle-by-recipe flow. is_favorite in get_recipe_previews comes from favorites_v2.

-- 1. Add recipe_id to favorites_v2 (nullable: Chat-origin favorites have recipe_data only)
ALTER TABLE public.favorites_v2
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE CASCADE;

-- 2. Unique: one favorite per (user, recipe) when recipe_id is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_v2_user_recipe
  ON public.favorites_v2(user_id, recipe_id)
  WHERE recipe_id IS NOT NULL;

-- 3. Index for lookups by recipe_id
CREATE INDEX IF NOT EXISTS idx_favorites_v2_recipe_id ON public.favorites_v2(recipe_id) WHERE recipe_id IS NOT NULL;

-- 4. Update get_recipe_previews: is_favorite from favorites_v2 (not recipes.is_favorite)
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
    EXISTS (
      SELECT 1 FROM public.favorites_v2 f
      WHERE f.user_id = auth.uid()
        AND f.recipe_id = r.id
    ) AS is_favorite
  FROM recipes r
  WHERE r.id = ANY(recipe_ids)
    AND r.user_id = auth.uid();
$$;
