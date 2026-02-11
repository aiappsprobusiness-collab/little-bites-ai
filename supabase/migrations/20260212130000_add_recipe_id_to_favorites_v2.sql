-- Add recipe_id to favorites_v2 (guaranteed, idempotent where possible)

ALTER TABLE public.favorites_v2
  ADD COLUMN IF NOT EXISTS recipe_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'favorites_v2_recipe_id_fkey'
  ) THEN
    ALTER TABLE public.favorites_v2
      ADD CONSTRAINT favorites_v2_recipe_id_fkey
      FOREIGN KEY (recipe_id)
      REFERENCES public.recipes(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_favorites_v2_recipe_id
  ON public.favorites_v2(recipe_id);
