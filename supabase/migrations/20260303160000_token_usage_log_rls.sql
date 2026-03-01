-- RLS для public.token_usage_log: INSERT/SELECT только для своей строки (auth.uid() = user_id).
-- Устраняет ошибку 42501 при записи из Edge Function deepseek-chat (anon + Authorization).

ALTER TABLE public.token_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_usage_log_insert_own ON public.token_usage_log;
CREATE POLICY token_usage_log_insert_own
  ON public.token_usage_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS token_usage_log_select_own ON public.token_usage_log;
CREATE POLICY token_usage_log_select_own
  ON public.token_usage_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
