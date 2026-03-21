-- Allow chat_ai / week_ai / manual recipes with non-empty description but without chef_advice and advice.
-- Quality gate may persist chef_advice = null intentionally.

CREATE OR REPLACE FUNCTION public.recipes_validate_not_empty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.source, '') NOT IN ('chat_ai', 'week_ai', 'manual') THEN
    RETURN NEW;
  END IF;
  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    RAISE EXCEPTION 'invalid_recipe: missing_description'
      USING HINT = 'description must be non-empty for source in (chat_ai, week_ai, manual)';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.recipes_validate_not_empty() IS 'For chat_ai/week_ai/manual: requires non-empty description only; chef_advice and advice may both be null.';
