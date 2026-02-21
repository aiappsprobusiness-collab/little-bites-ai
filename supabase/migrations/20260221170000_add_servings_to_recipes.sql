-- Add servings column (nullable for backward compatibility with existing rows).
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS servings integer;

COMMENT ON COLUMN public.recipes.servings IS
  'Number of servings recipe quantities are scaled for';
