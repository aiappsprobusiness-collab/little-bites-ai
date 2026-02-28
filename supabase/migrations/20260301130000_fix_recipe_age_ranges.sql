-- Fix recipe age ranges: drop harmful defaults (6–36), add indexes and CHECK.
-- New recipes will not get automatic 6–36; filter by age in plan generation.

ALTER TABLE public.recipes
  ALTER COLUMN min_age_months DROP DEFAULT,
  ALTER COLUMN max_age_months DROP DEFAULT;

CREATE INDEX IF NOT EXISTS recipes_age_range_idx
  ON public.recipes (min_age_months, max_age_months);

CREATE INDEX IF NOT EXISTS recipes_pool_age_meal_idx
  ON public.recipes (user_id, meal_type, min_age_months, max_age_months)
  WHERE source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai');

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_age_range_check
  CHECK (min_age_months IS NULL OR max_age_months IS NULL OR min_age_months <= max_age_months);

COMMENT ON CONSTRAINT recipes_age_range_check ON public.recipes IS 'Age range consistency when both set; NULL means no filter.';
