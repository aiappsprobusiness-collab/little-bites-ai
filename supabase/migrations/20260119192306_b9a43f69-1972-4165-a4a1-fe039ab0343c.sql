-- Fix security: search_path для триггер-функций. Выполняется только если есть profiles и user_roles.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.profiles (user_id, display_name)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
  END IF;
END
$$;
