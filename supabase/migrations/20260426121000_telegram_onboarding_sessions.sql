-- Хранение состояния Telegram onboarding-диалога (pre-auth).
CREATE TABLE IF NOT EXISTS public.telegram_onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE,
  telegram_user_id bigint,
  step text NOT NULL DEFAULT 'idle' CHECK (step IN ('idle', 'await_age', 'await_allergies', 'await_likes', 'await_dislikes', 'done')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  age_months integer CHECK (age_months IS NULL OR (age_months >= 6 AND age_months <= 216)),
  allergies text[] NOT NULL DEFAULT '{}',
  likes text[] NOT NULL DEFAULT '{}',
  dislikes text[] NOT NULL DEFAULT '{}',
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_onboarding_sessions_last_event_at
  ON public.telegram_onboarding_sessions(last_event_at DESC);

ALTER TABLE public.telegram_onboarding_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.telegram_onboarding_sessions IS 'State machine storage for Telegram pre-auth onboarding bot.';
