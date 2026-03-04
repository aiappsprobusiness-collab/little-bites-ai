-- Только для проверки: рецепты chat_ai за последние 3 дня с NULL в ключевых полях.
-- Не миграция, не применять к продакшену без необходимости.

-- Количество записей с NULL по полям (source = chat_ai, created_at за 3 дня)
SELECT
  COUNT(*) FILTER (WHERE min_age_months IS NULL) AS null_min_age,
  COUNT(*) FILTER (WHERE max_age_months IS NULL) AS null_max_age,
  COUNT(*) FILTER (WHERE proteins IS NULL)       AS null_proteins,
  COUNT(*) FILTER (WHERE calories IS NULL)       AS null_calories,
  COUNT(*) FILTER (WHERE cooking_time_minutes IS NULL) AS null_cooking_time,
  COUNT(*) AS total
FROM recipes
WHERE source = 'chat_ai'
  AND created_at >= NOW() - INTERVAL '3 days';

-- 10 примеров id, title, created_at с NULL в min_age_months или proteins или calories или cooking_time_minutes
SELECT id, title, created_at,
  min_age_months, max_age_months, cooking_time_minutes, calories, proteins, fats, carbs
FROM recipes
WHERE source = 'chat_ai'
  AND created_at >= NOW() - INTERVAL '3 days'
  AND (min_age_months IS NULL OR max_age_months IS NULL OR proteins IS NULL
       OR calories IS NULL OR cooking_time_minutes IS NULL)
ORDER BY created_at DESC
LIMIT 10;
