-- Согласие с юридическими документами при регистрации (terms + privacy): время и версия текста.
-- Версия передаётся из приложения в raw_user_meta_data (accepted_terms_version) при signUp;
-- триггер handle_new_user_v2 переносит значения в profiles_v2.

ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text;

COMMENT ON COLUMN public.profiles_v2.accepted_terms_at IS 'Когда пользователь принял соглашение и политику при регистрации (серверное время)';
COMMENT ON COLUMN public.profiles_v2.accepted_terms_version IS 'Версия юртекстов на момент согласия (строка из приложения, напр. дата)';

CREATE OR REPLACE FUNCTION public.handle_new_user_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_terms_version text;
  v_terms_at timestamptz;
BEGIN
  v_terms_version := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'accepted_terms_version', '')), '');

  IF v_terms_version IS NOT NULL THEN
    v_terms_at := now();
  ELSE
    v_terms_at := NULL;
    v_terms_version := NULL;
  END IF;

  INSERT INTO public.profiles_v2 (
    user_id,
    status,
    daily_limit,
    last_reset,
    requests_today,
    email,
    accepted_terms_at,
    accepted_terms_version
  )
  VALUES (
    NEW.id,
    'free'::public.profile_status_v2,
    5,
    now(),
    0,
    NEW.email,
    v_terms_at,
    v_terms_version
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    accepted_terms_at = COALESCE(public.profiles_v2.accepted_terms_at, EXCLUDED.accepted_terms_at),
    accepted_terms_version = COALESCE(public.profiles_v2.accepted_terms_version, EXCLUDED.accepted_terms_version);

  INSERT INTO public.subscriptions (user_id, plan, status, order_id, started_at, expires_at)
  VALUES (NEW.id, 'month', 'free', 'free_' || NEW.id::text, now(), NULL)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user_v2() IS 'V2: профиль (email + опционально accepted_terms_* из raw_user_meta_data) + subscriptions free при регистрации';
