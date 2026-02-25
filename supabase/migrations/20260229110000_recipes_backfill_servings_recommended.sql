-- Step 3: Backfill servings_recommended by meal_type.
-- Old recipes keep servings_base=5 (already set by rename). New recipes get default 1.

UPDATE public.recipes
SET servings_recommended = CASE
  WHEN meal_type = 'lunch' THEN 3
  WHEN meal_type = 'dinner' THEN 2
  ELSE 1
END;
