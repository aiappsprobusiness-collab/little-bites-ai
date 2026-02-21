-- Remove meal_plans_v2 rows where meals is null or empty jsonb (stabilize weekly fill: no "normalized_meals_empty" from stale empty rows).
DELETE FROM public.meal_plans_v2
WHERE meals IS NULL OR meals = '{}'::jsonb;
