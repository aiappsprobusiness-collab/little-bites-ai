-- Колонка email в profiles_v2: копия из auth.users (логин пользователя).
-- 1) Добавить колонку, 2) Заполнить из auth.users, 3) Триггер при создании, 4) Синхронизация при смене email в Auth.

-- 1. Добавить email в profiles_v2
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.profiles_v2.email IS 'Копия auth.users.email (логин пользователя)';

-- 2. Заполнить email из auth.users для всех существующих записей
UPDATE public.profiles_v2 p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND (p.email IS DISTINCT FROM u.email);

-- 3. При создании пользователя сразу записывать email в profiles_v2
CREATE OR REPLACE FUNCTION public.handle_new_user_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles_v2 (user_id, status, daily_limit, last_reset, requests_today, email)
  VALUES (NEW.id, 'free'::public.profile_status_v2, 5, now(), 0, NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.subscriptions (user_id, plan, status, order_id, started_at, expires_at)
  VALUES (NEW.id, 'month', 'free', 'free_' || NEW.id::text, now(), NULL)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user_v2() IS 'V2: профиль (с email из Auth) + запись subscriptions со status=free при регистрации; trial по кнопке';

-- 4. Синхронизация email при смене в Auth (смена почты в настройках)
CREATE OR REPLACE FUNCTION public.sync_profiles_v2_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.profiles_v2 SET email = NEW.email WHERE user_id = NEW.id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated_v2 ON auth.users;
CREATE TRIGGER on_auth_user_email_updated_v2
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profiles_v2_email_from_auth();

-- 5. Если в profiles_v2 вставили строку без email (например, из webhook), подтянуть из auth.users
CREATE OR REPLACE FUNCTION public.profiles_v2_fill_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  u_email text;
BEGIN
  IF NEW.email IS NULL THEN
    SELECT u.email INTO u_email FROM auth.users u WHERE u.id = NEW.user_id;
    NEW.email := u_email;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_v2_fill_email_trigger ON public.profiles_v2;
CREATE TRIGGER profiles_v2_fill_email_trigger
  BEFORE INSERT OR UPDATE OF user_id ON public.profiles_v2
  FOR EACH ROW
  WHEN (NEW.email IS NULL)
  EXECUTE FUNCTION public.profiles_v2_fill_email_from_auth();
