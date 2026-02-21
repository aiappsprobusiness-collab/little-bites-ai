-- DB-level guards: prevent "empty shell" recipes for chat_ai/week_ai/manual + normalize title.
-- Idempotent. No hard NOT NULL that break existing rows. Sources enforced: chat_ai, week_ai, manual only.

-- ========== 1. Add norm_title column ==========
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS norm_title text;

COMMENT ON COLUMN public.recipes.norm_title IS 'Normalized title: lower(btrim(title)), kept in sync by trigger.';

-- Backfill where title is not null
UPDATE public.recipes
SET norm_title = lower(btrim(title))
WHERE title IS NOT NULL
  AND (norm_title IS NULL OR norm_title <> lower(btrim(title)));


-- ========== 2. Trigger: keep norm_title in sync on INSERT/UPDATE of title ==========
CREATE OR REPLACE FUNCTION public.recipes_set_norm_title()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.norm_title := lower(btrim(NEW.title));
  ELSE
    NEW.norm_title := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_norm_title_trigger ON public.recipes;
CREATE TRIGGER recipes_norm_title_trigger
  BEFORE INSERT OR UPDATE OF title
  ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_set_norm_title();


-- ========== 3. Validation trigger: block empty recipes for chat_ai, week_ai, manual ==========
CREATE OR REPLACE FUNCTION public.recipes_validate_not_empty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.source, '') NOT IN ('chat_ai', 'week_ai', 'manual') THEN
    RETURN NEW;
  END IF;

  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    RAISE EXCEPTION 'invalid_recipe: missing_description'
      USING HINT = 'description must be non-empty for source in (chat_ai, week_ai, manual)';
  END IF;

  IF (NEW.chef_advice IS NULL OR btrim(NEW.chef_advice) = '')
     AND (NEW.advice IS NULL OR btrim(NEW.advice) = '') THEN
    RAISE EXCEPTION 'invalid_recipe: missing_advice'
      USING HINT = 'at least one of chef_advice or advice must be non-empty for source in (chat_ai, week_ai, manual)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_validate_not_empty_trigger ON public.recipes;
CREATE TRIGGER recipes_validate_not_empty_trigger
  BEFORE INSERT OR UPDATE OF description, chef_advice, advice, source
  ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_validate_not_empty();


-- ========== 4. Test snippet (run manually; do not run in migration) ==========
-- How to test:
--
-- 1) Bad recipe (missing description) -> should fail:
--    INSERT INTO public.recipes (user_id, title, description, source, chef_advice)
--    VALUES (auth.uid(), 'Test', NULL, 'chat_ai', 'tip');
--    -- expected: ERROR invalid_recipe: missing_description
--
-- 2) Bad recipe (missing both advice) -> should fail:
--    INSERT INTO public.recipes (user_id, title, description, source)
--    VALUES (auth.uid(), 'Test', 'Desc', 'chat_ai');
--    -- expected: ERROR invalid_recipe: missing_advice
--
-- 3) Good recipe -> should pass:
--    INSERT INTO public.recipes (user_id, title, description, source, chef_advice)
--    VALUES (auth.uid(), '  Test Recipe  ', 'Yummy', 'chat_ai', 'tip');
--    -- then: SELECT norm_title FROM public.recipes WHERE title LIKE '%Test Recipe%';
--    -- expected: norm_title = 'test recipe' (normalized)
--
-- 4) seed source is not validated (no exception):
--    INSERT INTO public.recipes (user_id, title, description, source)
--    VALUES (auth.uid(), 'Seed', NULL, 'seed');
--    -- expected: succeeds (if no other constraints)
