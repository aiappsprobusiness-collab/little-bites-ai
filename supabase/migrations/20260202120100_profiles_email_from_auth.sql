-- Колонка email в public.profiles (копия из auth.users).
-- Выполняется только если таблица public.profiles существует.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
    UPDATE public.profiles p
    SET email = u.email
    FROM auth.users u
    WHERE p.user_id = u.id AND (p.email IS DISTINCT FROM u.email);

    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.profiles (user_id, display_name, email)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.email);
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
      RETURN NEW;
    END;
    $fn$;

    CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $fn$
    BEGIN
      UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
    CREATE TRIGGER on_auth_user_email_updated
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
      EXECUTE FUNCTION public.sync_profile_email_from_auth();
  END IF;
END
$$;
