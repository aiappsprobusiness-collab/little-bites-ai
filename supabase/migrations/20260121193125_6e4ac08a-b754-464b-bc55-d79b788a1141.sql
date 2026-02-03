-- ================================================
-- FREEMIUM MODEL: Таблицы и поля для подписки (идемпотентно)
-- ================================================

-- 1. subscription_status в profiles (только если таблица есть)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium', 'trial'));
  END IF;
END $$;

-- 2. Таблица использования AI (без зависимостей от app-таблиц)
CREATE TABLE IF NOT EXISTS public.user_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  generations integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- 3. История чата (только если есть children, т.к. FK)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'children') THEN
    CREATE TABLE IF NOT EXISTS public.chat_history (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
      message text NOT NULL,
      response text,
      message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'recipe')),
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- 4. Доп. поля в children
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'children') THEN
    ALTER TABLE public.children
      ADD COLUMN IF NOT EXISTS weight numeric,
      ADD COLUMN IF NOT EXISTS height numeric,
      ADD COLUMN IF NOT EXISTS diet_goals text[] DEFAULT '{}'::text[];
  END IF;
END $$;

-- 5. Доп. поля в recipes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipes') THEN
    ALTER TABLE public.recipes
      ADD COLUMN IF NOT EXISTS macros jsonb,
      ADD COLUMN IF NOT EXISTS is_premium_feature boolean DEFAULT false;
  END IF;
END $$;

-- 6. RLS для user_usage и chat_history
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_history') THEN
    ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 7. Политики user_usage (идемпотентно)
DROP POLICY IF EXISTS "Users can view their own usage" ON public.user_usage;
CREATE POLICY "Users can view their own usage" ON public.user_usage FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.user_usage;
CREATE POLICY "Users can insert their own usage" ON public.user_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own usage" ON public.user_usage;
CREATE POLICY "Users can update their own usage" ON public.user_usage FOR UPDATE USING (auth.uid() = user_id);

-- 8. Политики chat_history (только если таблица есть)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_history') THEN
    DROP POLICY IF EXISTS "Users can view their own chat history" ON public.chat_history;
    CREATE POLICY "Users can view their own chat history" ON public.chat_history FOR SELECT USING (auth.uid() = user_id);
    DROP POLICY IF EXISTS "Users can insert their own chat messages" ON public.chat_history;
    CREATE POLICY "Users can insert their own chat messages" ON public.chat_history FOR INSERT WITH CHECK (auth.uid() = user_id);
    DROP POLICY IF EXISTS "Users can delete their own chat history" ON public.chat_history;
    CREATE POLICY "Users can delete their own chat history" ON public.chat_history FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 9. Триггер updated_at (только если функция есть)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_user_usage_updated_at ON public.user_usage;
    CREATE TRIGGER update_user_usage_updated_at
      BEFORE UPDATE ON public.user_usage FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 10. check_usage_limit (только если profiles и user_usage есть)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_usage') THEN
    CREATE OR REPLACE FUNCTION public.check_usage_limit(_user_id uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
    DECLARE
      _subscription_status text;
      _today_usage integer;
      _daily_limit integer := 5;
      _can_generate boolean;
      _remaining integer;
    BEGIN
      SELECT subscription_status INTO _subscription_status FROM public.profiles WHERE user_id = _user_id;
      IF _subscription_status = 'premium' THEN
        RETURN jsonb_build_object('can_generate', true, 'remaining', -1, 'is_premium', true, 'used_today', 0);
      END IF;
      SELECT COALESCE(generations, 0) INTO _today_usage FROM public.user_usage WHERE user_id = _user_id AND date = CURRENT_DATE;
      _today_usage := COALESCE(_today_usage, 0);
      _remaining := _daily_limit - _today_usage;
      _can_generate := _remaining > 0;
      RETURN jsonb_build_object('can_generate', _can_generate, 'remaining', _remaining, 'is_premium', false, 'used_today', _today_usage, 'daily_limit', _daily_limit);
    END;
    $$;
  END IF;
END $$;

-- 11. increment_usage (всегда: работает только с user_usage)
CREATE OR REPLACE FUNCTION public.increment_usage(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.user_usage (user_id, date, generations)
  VALUES (_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET generations = user_usage.generations + 1, updated_at = now();
END;
$$;
