-- Backfill recipes.meal_type из meal_plans_v2.meals.
-- Для каждого слота (breakfast/lunch/snack/dinner) берём recipe_id и ключ слота как meal_type.
-- Обновляем только записи в public.recipes, у которых meal_type IS NULL (не перетираем существующие).

UPDATE public.recipes r
SET meal_type = sub.slot_key
FROM (
  SELECT
    (value->>'recipe_id')::uuid AS recipe_id,
    key AS slot_key
  FROM public.meal_plans_v2,
       LATERAL jsonb_each(COALESCE(meals, '{}'::jsonb)) AS t(key, value)
  WHERE value ? 'recipe_id'
    AND value->>'recipe_id' IS NOT NULL
    AND value->>'recipe_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND key IN ('breakfast', 'lunch', 'snack', 'dinner')
) sub
WHERE r.id = sub.recipe_id
  AND r.meal_type IS NULL;
