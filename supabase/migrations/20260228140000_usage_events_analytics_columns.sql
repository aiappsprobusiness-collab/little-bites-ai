-- Расширение usage_events для аналитики trial flow и вирусности (шаринг).
-- Лимиты по feature (get_usage_count_today) не меняются: считаем по user_id + feature + created_at.

-- 1. Разрешить user_id = NULL для анонимных событий (landing, до регистрации)
ALTER TABLE public.usage_events
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Разрешить любые значения feature (для аналитики: landing_view, auth_start, share_click и т.д.)
ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_feature_check;

-- 3. Новые колонки (все nullable, кроме properties)
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS anon_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS page text,
  ADD COLUMN IF NOT EXISTS entry_point text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4. Индексы для аналитики
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at_desc
  ON public.usage_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created_desc
  ON public.usage_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_feature_created_desc
  ON public.usage_events(feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_anon_created_desc
  ON public.usage_events(anon_id, created_at DESC)
  WHERE anon_id IS NOT NULL;

COMMENT ON COLUMN public.usage_events.anon_id IS 'Анонимный id до авторизации (localStorage).';
COMMENT ON COLUMN public.usage_events.properties IS 'Доп. данные события (paywall_reason, recipe_id, share_ref и т.д.).';
