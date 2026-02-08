-- Trial: источник истины в profiles_v2. Строго 3 дня, один раз на пользователя.
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_until timestamptz,
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles_v2.trial_started_at IS 'Когда активирован trial (по кнопке)';
COMMENT ON COLUMN public.profiles_v2.trial_until IS 'Окончание trial: now() + 3 days при активации; источник истины для доступа';
COMMENT ON COLUMN public.profiles_v2.trial_used IS 'true после первой активации trial; повторная активация запрещена';
