-- recipe_ingredients: display_text (как показывать) и canonical (г/мл для списка покупок)

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS display_text text,
  ADD COLUMN IF NOT EXISTS canonical_amount numeric,
  ADD COLUMN IF NOT EXISTS canonical_unit text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipe_ingredients_canonical_unit_check'
  ) THEN
    ALTER TABLE public.recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_canonical_unit_check
      CHECK (canonical_unit IS NULL OR canonical_unit IN ('g', 'ml'));
  END IF;
END $$;
