-- Таблица для учёта токенов по типам действий (генерация рецепта в чате, план на неделю, Мы рядом и т.д.)
CREATE TABLE IF NOT EXISTS public.token_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_log_user_created ON public.token_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_log_action_created ON public.token_usage_log (action_type, created_at DESC);

COMMENT ON TABLE public.token_usage_log IS 'Лог использования токенов по действиям: chat_recipe, weekly_plan, sos_consultant и др.';
COMMENT ON COLUMN public.token_usage_log.action_type IS 'Тип действия: chat_recipe (рецепт в чате), weekly_plan (план на неделю), sos_consultant (Мы рядом), diet_plan, balance_check, chat (обычный чат)';

-- RPC: агрегация токенов по типу действия и дате (для отчётов)
CREATE OR REPLACE FUNCTION public.get_token_usage_by_action(
  _from_date date DEFAULT NULL,
  _to_date date DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  action_type text,
  request_count bigint,
  sum_input_tokens bigint,
  sum_output_tokens bigint,
  sum_total_tokens bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.action_type,
    count(*)::bigint AS request_count,
    sum(t.input_tokens)::bigint AS sum_input_tokens,
    sum(t.output_tokens)::bigint AS sum_output_tokens,
    sum(t.total_tokens)::bigint AS sum_total_tokens
  FROM token_usage_log t
  WHERE
    (_from_date IS NULL OR t.created_at::date >= _from_date)
    AND (_to_date IS NULL OR t.created_at::date <= _to_date)
    AND (_user_id IS NULL OR t.user_id = _user_id)
  GROUP BY t.action_type
  ORDER BY t.action_type;
$$;

COMMENT ON FUNCTION public.get_token_usage_by_action IS 'Сводка токенов по типу действия за период. Без дат — за всё время. _user_id = NULL — по всем пользователям.';
