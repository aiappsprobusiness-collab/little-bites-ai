-- Feature-level usage for Free limits: chat_recipe, plan_refresh, plan_fill_day, help.
-- События по фичам; сутки по UTC (date_trunc('day', created_at AT TIME ZONE 'UTC')).

-- 1. Таблица событий
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature IN ('chat_recipe', 'plan_refresh', 'plan_fill_day', 'help')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usage_events IS 'События использования по фичам для лимитов Free (2/день на фичу). Premium/Trial не ограничены.';

-- 2. Индексы для подсчёта за текущие сутки (UTC)
CREATE INDEX IF NOT EXISTS idx_usage_events_user_feature_created
  ON public.usage_events(user_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_member_feature_created
  ON public.usage_events(user_id, member_id, feature, created_at DESC);

-- 3. RLS: пользователь видит только свои события (для отладки/статистики); запись только через service_role / Edge
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_events_select_own" ON public.usage_events;
CREATE POLICY "usage_events_select_own" ON public.usage_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: service_role (deepseek-chat) и authenticated (generate-plan от имени user)
DROP POLICY IF EXISTS "usage_events_insert_service" ON public.usage_events;
CREATE POLICY "usage_events_insert_service" ON public.usage_events
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "usage_events_insert_own" ON public.usage_events;
CREATE POLICY "usage_events_insert_own" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Функция: количество использований фичи за текущие сутки (UTC)
CREATE OR REPLACE FUNCTION public.get_usage_count_today(
  p_user_id uuid,
  p_feature text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.usage_events
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;

COMMENT ON FUNCTION public.get_usage_count_today(uuid, text) IS 'Количество событий по фиче за текущие сутки (UTC). Для лимитов Free.';

GRANT EXECUTE ON FUNCTION public.get_usage_count_today(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_usage_count_today(uuid, text) TO authenticated;
