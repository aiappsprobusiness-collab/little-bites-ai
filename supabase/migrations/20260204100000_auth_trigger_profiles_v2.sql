-- Регистрация V2: при создании пользователя в auth.users автоматически создаём запись в public.profiles_v2.
-- Старый триггер on_auth_user_created отключаем, чтобы не писать в public.profiles (и не падать, если таблицы нет).

-- 1. Удаляем старый триггер (писал в public.profiles и public.user_roles)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Функция: создание строки в profiles_v2 для нового пользователя
CREATE OR REPLACE FUNCTION public.handle_new_user_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles_v2 (user_id, status, daily_limit, last_reset, requests_today)
  VALUES (
    NEW.id,
    'free'::public.profile_status_v2,
    5,
    now(),
    0
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user_v2() IS 'V2: создаёт запись в profiles_v2 при регистрации (auth.users INSERT)';

-- 3. Триггер на auth.users
CREATE TRIGGER on_auth_user_created_v2
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_v2();
