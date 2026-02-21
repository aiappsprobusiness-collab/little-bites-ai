-- Fix recipes that were stored with meal_type='dinner' (or other) but are soups by content.
-- Idempotent: only updates rows that still match the condition; tag replacement is safe to repeat.

-- 1) Set meal_type = 'lunch' for recipes that look like soups (title/description) but had dinner (or wrong) meal_type.
UPDATE public.recipes r
SET meal_type = 'lunch'
WHERE r.meal_type IN ('dinner', 'breakfast', 'snack')
  AND (
    r.title ILIKE '%суп%' OR r.title ILIKE '%борщ%' OR r.title ILIKE '%щи%' OR r.title ILIKE '%солянк%'
    OR r.title ILIKE '%уха%' OR r.title ILIKE '%рассольник%' OR r.title ILIKE '%бульон%'
    OR r.title ILIKE '%крем-суп%' OR r.title ILIKE '%суп-пюре%'
    OR r.description ILIKE '%суп%' OR r.description ILIKE '%борщ%' OR r.description ILIKE '%щи%'
    OR r.description ILIKE '%солянк%' OR r.description ILIKE '%уха%' OR r.description ILIKE '%рассольник%'
    OR r.description ILIKE '%бульон%' OR r.description ILIKE '%крем-суп%' OR r.description ILIKE '%суп-пюре%'
  );

-- 2) Replace tag 'chat_dinner' with 'chat_lunch' where meal_type is now 'lunch' and tag exists (no duplicate chat_lunch).
UPDATE public.recipes r
SET tags = (
  SELECT array_agg(DISTINCT x)
  FROM unnest(array_remove(COALESCE(r.tags, ARRAY[]::text[]), 'chat_dinner') || ARRAY['chat_lunch']::text[]) AS x
)
WHERE r.meal_type = 'lunch'
  AND r.tags IS NOT NULL
  AND 'chat_dinner' = ANY(r.tags);
