-- Add fish, fats, spices to product_category for Cooper cart.
-- Must run and commit before 20260220180000 (infer_ingredient_category uses these values).

DO $$
BEGIN
  ALTER TYPE public.product_category ADD VALUE 'fish';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TYPE public.product_category ADD VALUE 'fats';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TYPE public.product_category ADD VALUE 'spices';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
