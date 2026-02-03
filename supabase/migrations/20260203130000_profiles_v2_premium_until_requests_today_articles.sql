-- profiles_v2: добавить premium_until (timestamptz), requests_today (int4)
-- articles: таблица контента в стиле Flo (id, title, content, is_premium, age_category)
-- RLS включён для всех; индексы на user_id где есть.

-- 1. Новые поля в profiles_v2
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS premium_until timestamptz,
  ADD COLUMN IF NOT EXISTS requests_today integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles_v2.premium_until IS 'Дата окончания премиума/триала';
COMMENT ON COLUMN public.profiles_v2.requests_today IS 'Количество запросов за текущий день (сбрасывается по last_reset)';

-- 2. Таблица articles (контент в стиле Flo)
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_premium boolean NOT NULL DEFAULT false,
  age_category text
);

CREATE INDEX IF NOT EXISTS idx_articles_age_category ON public.articles(age_category);
CREATE INDEX IF NOT EXISTS idx_articles_is_premium ON public.articles(is_premium);

COMMENT ON TABLE public.articles IS 'Контент в стиле Flo: статьи по age_category (infant/toddler/school/adult), is_premium для платного контента';

-- 3. RLS для articles (чтение — авторизованные; запись — только через service role / админ)
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "articles_select_authenticated" ON public.articles;
CREATE POLICY "articles_select_authenticated" ON public.articles
  FOR SELECT TO authenticated
  USING (true);

-- Запись только для service_role (через backend); для anon/authenticated запрет по умолчанию
DROP POLICY IF EXISTS "articles_service_all" ON public.articles;
CREATE POLICY "articles_service_all" ON public.articles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Убедиться, что индексы на user_id есть у всех таблиц с user_id (profiles_v2, members, favorites_v2, meal_plans_v2 уже созданы в 20260203120000)
-- Дополнительный индекс на profiles_v2 для запросов по premium_until при необходимости
CREATE INDEX IF NOT EXISTS idx_profiles_v2_premium_until ON public.profiles_v2(premium_until) WHERE premium_until IS NOT NULL;
