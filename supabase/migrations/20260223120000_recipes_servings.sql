-- Add servings column to recipes (family-sized default 5). Edge passes servings in payload; RPC update in later migration if needed.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS servings integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.recipes.servings IS 'Number of portions (family-sized default 5).';
