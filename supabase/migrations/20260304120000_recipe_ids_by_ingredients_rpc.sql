-- RPC: возвращает recipe_id рецептов по фильтру ингредиентов.
-- scope: 'favorites' = рецепты из favorites_v2 (user_id + member_id); 'my_recipes' = рецепты owner_user_id, source = user_custom.
-- mode: 'include' = хотя бы один ингредиент совпадает с термином; 'exclude' = ни один не совпадает.

CREATE OR REPLACE FUNCTION public.get_recipe_ids_by_ingredients(
  ingredient_terms text[],
  mode text DEFAULT 'include',
  scope text DEFAULT 'favorites',
  p_member_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT recipe_id AS id FROM favorites_v2
    WHERE user_id = auth.uid()
      AND (p_member_id IS NULL AND member_id IS NULL OR member_id = p_member_id)
      AND scope = 'favorites'
    UNION ALL
    SELECT id FROM recipes
    WHERE owner_user_id = auth.uid() AND source = 'user_custom'
      AND scope = 'my_recipes'
  ),
  terms_pattern AS (
    SELECT '%' || trim(t) || '%' AS pat
    FROM unnest(COALESCE(ingredient_terms, '{}'::text[])) AS t
    WHERE trim(t) <> ''
  ),
  term_count AS (SELECT count(*) AS n FROM terms_pattern),
  with_match AS (
    SELECT s.id,
      EXISTS (
        SELECT 1 FROM recipe_ingredients ri
        CROSS JOIN terms_pattern tp
        WHERE ri.recipe_id = s.id AND ri.name ILIKE tp.pat
      ) AS has_match
    FROM scoped s
  )
  SELECT wm.id FROM with_match wm CROSS JOIN term_count tc
  WHERE tc.n = 0
     OR (mode = 'include' AND wm.has_match)
     OR (mode = 'exclude' AND NOT wm.has_match);
$$;

COMMENT ON FUNCTION public.get_recipe_ids_by_ingredients(text[], text, text, uuid) IS
  'Recipe IDs filtered by ingredient name (ILIKE any term). scope: favorites | my_recipes; mode: include | exclude.';
