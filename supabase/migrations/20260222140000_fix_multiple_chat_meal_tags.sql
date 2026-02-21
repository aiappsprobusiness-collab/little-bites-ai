-- Fix recipes.tags: leave exactly one chat_* tag (chat_${meal_type}) per recipe.
-- Idempotent: only touches rows where tags contain 2+ of {chat_breakfast, chat_lunch, chat_dinner, chat_snack}.

UPDATE public.recipes r
SET tags = (
  SELECT array_agg(DISTINCT x)
  FROM unnest(
    array_remove(
      array_remove(
        array_remove(
          array_remove(COALESCE(r.tags, ARRAY[]::text[]), 'chat_breakfast'),
          'chat_lunch'),
        'chat_dinner'),
      'chat_snack')
    || ARRAY['chat', 'chat_' || CASE
      WHEN lower(trim(COALESCE(r.meal_type, ''))) IN ('breakfast', 'lunch', 'snack', 'dinner')
      THEN lower(trim(r.meal_type))
      ELSE 'snack'
    END]::text[]
  ) AS x
)
WHERE r.tags IS NOT NULL
  AND (
    SELECT count(*)
    FROM unnest(r.tags) t
    WHERE t IN ('chat_breakfast', 'chat_lunch', 'chat_dinner', 'chat_snack')
  ) > 1;
