-- ================================================
-- FREEMIUM MODEL: Таблицы и поля для подписки
-- ================================================

-- 1. Добавляем поле subscription_status в profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium', 'trial'));

-- 2. Создаем таблицу для отслеживания использования AI
CREATE TABLE IF NOT EXISTS public.user_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  generations integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- 3. Создаем таблицу для истории чата
CREATE TABLE IF NOT EXISTS public.chat_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  message text NOT NULL,
  response text,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'recipe')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Добавляем дополнительные поля в children для диет-планирования
ALTER TABLE public.children
ADD COLUMN IF NOT EXISTS weight numeric,
ADD COLUMN IF NOT EXISTS height numeric,
ADD COLUMN IF NOT EXISTS diet_goals text[] DEFAULT '{}'::text[];

-- 5. Добавляем макросы и флаг премиум-функции в recipes
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS macros jsonb,
ADD COLUMN IF NOT EXISTS is_premium_feature boolean DEFAULT false;

-- 6. Включаем RLS для новых таблиц
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- 7. RLS политики для user_usage
CREATE POLICY "Users can view their own usage" 
ON public.user_usage 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage" 
ON public.user_usage 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage" 
ON public.user_usage 
FOR UPDATE 
USING (auth.uid() = user_id);

-- 8. RLS политики для chat_history
CREATE POLICY "Users can view their own chat history" 
ON public.chat_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages" 
ON public.chat_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat history" 
ON public.chat_history 
FOR DELETE 
USING (auth.uid() = user_id);

-- 9. Триггеры для updated_at
CREATE TRIGGER update_user_usage_updated_at
BEFORE UPDATE ON public.user_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Функция для проверки лимита генераций (5 в день для бесплатных)
CREATE OR REPLACE FUNCTION public.check_usage_limit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _subscription_status text;
  _today_usage integer;
  _daily_limit integer := 5;
  _can_generate boolean;
  _remaining integer;
BEGIN
  -- Получаем статус подписки
  SELECT subscription_status INTO _subscription_status
  FROM public.profiles
  WHERE user_id = _user_id;
  
  -- Если премиум - безлимит
  IF _subscription_status = 'premium' THEN
    RETURN jsonb_build_object(
      'can_generate', true,
      'remaining', -1,
      'is_premium', true,
      'used_today', 0
    );
  END IF;
  
  -- Получаем использование за сегодня
  SELECT COALESCE(generations, 0) INTO _today_usage
  FROM public.user_usage
  WHERE user_id = _user_id AND date = CURRENT_DATE;
  
  _today_usage := COALESCE(_today_usage, 0);
  _remaining := _daily_limit - _today_usage;
  _can_generate := _remaining > 0;
  
  RETURN jsonb_build_object(
    'can_generate', _can_generate,
    'remaining', _remaining,
    'is_premium', false,
    'used_today', _today_usage,
    'daily_limit', _daily_limit
  );
END;
$$;

-- 11. Функция для увеличения счетчика использования
CREATE OR REPLACE FUNCTION public.increment_usage(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_usage (user_id, date, generations)
  VALUES (_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    generations = user_usage.generations + 1,
    updated_at = now();
END;
$$;