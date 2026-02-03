-- Переводим subscription_status в enum для строгой типизации (без отдельного is_premium).
-- Один источник правды: is_premium = (subscription_status = 'premium') в коде и в check_usage_limit.

-- 1. Создаём enum (идемпотентно: не падаем, если тип уже есть)
DO $$
BEGIN
  CREATE TYPE public.subscription_status_enum AS ENUM ('free', 'trial', 'premium');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2–8. Выполняем только если таблица public.profiles существует (идемпотентно для чистой БД)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    -- 2. Убираем старый CHECK и дефолт
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
    ALTER TABLE public.profiles
      ALTER COLUMN subscription_status DROP DEFAULT;

    -- 3. Меняем тип колонки на enum (игнорируем, если колонки или типа нет)
    BEGIN
      ALTER TABLE public.profiles
        ALTER COLUMN subscription_status TYPE public.subscription_status_enum
        USING subscription_status::text::public.subscription_status_enum;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- 4. Дефолт обратно на 'free'
    ALTER TABLE public.profiles
      ALTER COLUMN subscription_status SET DEFAULT 'free'::public.subscription_status_enum;

    -- 5. Колонка email
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS email text;

    -- 6. Заполняем email из auth.users
    UPDATE public.profiles p
    SET email = u.email
    FROM auth.users u
    WHERE p.user_id = u.id AND (p.email IS DISTINCT FROM u.email);
  END IF;
END
$$;

-- 7. Триггер создания профиля (функция — только если есть profiles)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.profiles (user_id, display_name, email)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.email);
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'user');
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

-- 8. Синхронизация email при смене в Auth
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
      RETURN NEW;
    END;
    $fn$;
    DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
    CREATE TRIGGER on_auth_user_email_updated
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW
      WHEN (OLD.email IS DISTINCT FROM NEW.email)
      EXECUTE FUNCTION public.sync_profile_email_from_auth();
  END IF;
END
$$;
