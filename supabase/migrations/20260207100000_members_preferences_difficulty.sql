-- Extend members table for Profile alignment (preferences, difficulty).
-- No new tables. Backward compatible: existing rows get default preferences = '{}', difficulty = NULL.

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS preferences text[] DEFAULT '{}';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS difficulty text;

COMMENT ON COLUMN public.members.preferences IS 'Food/cooking preferences (e.g. vegetarian, quick meals).';
COMMENT ON COLUMN public.members.difficulty IS 'Recipe difficulty: easy, medium, or any.';
