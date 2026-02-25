-- Step 2: Base serving architecture. Store base portion (1); UI scales.
-- Rename servings -> servings_base, default 1; add servings_recommended.

ALTER TABLE public.recipes
  RENAME COLUMN servings TO servings_base;

ALTER TABLE public.recipes
  ALTER COLUMN servings_base SET DEFAULT 1;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS servings_recommended integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.recipes.servings_base IS 'Base serving count; ingredient amounts in DB are for this many portions (legacy 5, new 1).';
COMMENT ON COLUMN public.recipes.servings_recommended IS 'Recommended display portions for UX (e.g. lunch 3, dinner 2, else 1).';
