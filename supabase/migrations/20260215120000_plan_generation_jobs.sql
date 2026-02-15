-- Таблица для отслеживания фоновой генерации плана (day/week).
-- Позволяет UI показывать прогресс и не блокировать пользователя.

CREATE TABLE IF NOT EXISTS public.plan_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('day', 'week')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  progress_total int NOT NULL DEFAULT 1,
  progress_done int NOT NULL DEFAULT 0,
  last_day_key text,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_generation_jobs_user_id ON public.plan_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_generation_jobs_status ON public.plan_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_plan_generation_jobs_user_member_type ON public.plan_generation_jobs(user_id, member_id, type);

ALTER TABLE public.plan_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan_generation_jobs"
  ON public.plan_generation_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plan_generation_jobs"
  ON public.plan_generation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role / Edge Function will update jobs (via service key); user cannot update from client.
-- So we do NOT add UPDATE policy for user. The Edge Function uses service_role and bypasses RLS,
-- or we use a SECURITY DEFINER function to update job progress.
-- Allow user to update only their own row (for client-side fallback: client could write progress if we keep client gen).
CREATE POLICY "Users can update own plan_generation_jobs"
  ON public.plan_generation_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.plan_generation_jobs IS 'Tracks background plan generation (day/week). status: running|done|error. progress_done/progress_total for UI.';
