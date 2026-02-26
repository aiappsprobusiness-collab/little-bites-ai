-- recipes.is_soup: явный признак супа для правила "слот обед = только супы".
-- Назначение рецепта в слот (assign_recipe_to_plan_slot) НЕ меняет recipes.meal_type и recipes.is_soup —
-- меняется только meal_plans_v2.meals (слот указывает на recipe_id).

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_soup boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recipes.is_soup IS 'True if recipe is a soup; used to fill lunch slot from pool with soup-only. Assign to plan slot does not change this.';

-- Backfill: супы по title, description, tags (эвристика без ложных срабатываний)
UPDATE public.recipes r
SET is_soup = true
WHERE r.is_soup = false
  AND (
    lower(COALESCE(r.title, '')) ~ '(суп|борщ|щи|солянка|уха|рассольник|похлёбка|крем-суп|суп-пюре|бульон|лапша|рамен|минестроне|гаспачо)'
    OR lower(COALESCE(r.description, '')) ~ '(суп|борщ|щи|солянка|уха|рассольник|похлёбка|крем-суп|суп-пюре|бульон|лапша|рамен)'
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(r.tags, '{}')) AS t
      WHERE lower(t) ~ '(суп|борщ|щи|soup)'
    )
  );
