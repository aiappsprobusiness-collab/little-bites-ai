-- Последний выбранный член семьи (Premium/Trial): источник правды в profiles_v2.
-- ON DELETE SET NULL: при удалении member ссылка сбрасывается; клиент выбирает fallback.

ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS last_active_member_id uuid NULL
  REFERENCES public.members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_v2_last_active_member_id
  ON public.profiles_v2(last_active_member_id)
  WHERE last_active_member_id IS NOT NULL;

COMMENT ON COLUMN public.profiles_v2.last_active_member_id IS
  'Последний выбранный member_id для UI (чат/план); NULL = семейный режим или не задано. Должен принадлежать тому же user_id, что и строка profiles_v2.';

-- Запрет подставить чужой member_id (FK гарантирует только существование строки в members).
CREATE OR REPLACE FUNCTION public.profiles_v2_validate_last_active_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.last_active_member_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = NEW.last_active_member_id
      AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'last_active_member_id must reference a member owned by the same user';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_v2_last_active_member_check ON public.profiles_v2;

CREATE TRIGGER profiles_v2_last_active_member_check
  BEFORE INSERT OR UPDATE OF last_active_member_id, user_id ON public.profiles_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_v2_validate_last_active_member();

COMMENT ON FUNCTION public.profiles_v2_validate_last_active_member() IS
  'Гарантирует, что profiles_v2.last_active_member_id указывает на members с тем же user_id.';
