-- Переводим subscription_status в enum для строгой типизации (без отдельного is_premium).
-- Один источник правды: is_premium = (subscription_status = 'premium') в коде и в check_usage_limit.

-- 1. Создаём enum (порядок значений как в текущем CHECK)
CREATE TYPE public.subscription_status_enum AS ENUM ('free', 'trial', 'premium');

-- 2. Убираем старый CHECK и дефолт, чтобы сменить тип колонки
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_status DROP DEFAULT;

-- 3. Меняем тип колонки на enum с сохранением данных
ALTER TABLE public.profiles
  ALTER COLUMN subscription_status TYPE public.subscription_status_enum
  USING subscription_status::text::public.subscription_status_enum;

-- 4. Дефолт обратно на 'free'
ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'free'::public.subscription_status_enum;

-- 5. Колонка email в profiles (копия из auth.users для удобства)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 6. Заполняем email из auth.users для существующих профилей
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND (p.email IS DISTINCT FROM u.email);

-- 7. Триггер создания профиля: подставляем email при INSERT
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- 8. Синхронизация email при смене в Auth
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();
