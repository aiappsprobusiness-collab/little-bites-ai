-- get_recipe_previews: разрешить превью для рецептов из пула (любой авторизованный пользователь).
-- Карточки плана показывают рецепты из общего пула; без этого RPC возвращал только свои рецепты → пустые карточки.

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
  WHERE r.id = ANY(recipe_ids)
    AND (
      r.user_id = auth.uid()
      OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom')
      OR (auth.uid() IS NOT NULL AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai'))
    );
$$;

COMMENT ON FUNCTION public.get_recipe_previews(uuid[]) IS 'Preview for recipe cards. Access: own recipes, user_custom by owner, or pool recipes (seed/starter/manual/week_ai/chat_ai) for any authenticated user. is_favorite from favorites_v2.';
