-- Trial строго 3 дня, один раз. Возврат jsonb для UI (already_active / already_used / activated).
-- Смена типа возврата (void → jsonb) требует DROP.
DROP FUNCTION IF EXISTS public.start_trial();
CREATE FUNCTION public.start_trial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_trial_until timestamptz;
  v_trial_used boolean;
  v_result text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('result', 'error', 'error', 'not_authenticated', 'trial_until', null);
  END IF;

  SELECT trial_until, trial_used
  INTO v_trial_until, v_trial_used
  FROM public.profiles_v2
  WHERE user_id = v_user_id;

  -- Уже активный trial: no-op
  IF v_trial_until IS NOT NULL AND v_trial_until > now() THEN
    RAISE NOTICE 'start_trial user_id=% result=already_active trial_until=%', v_user_id, v_trial_until;
    RETURN jsonb_build_object('result', 'already_active', 'trial_until', v_trial_until);
  END IF;

  -- Trial уже был использован и истёк
  IF v_trial_used = true AND (v_trial_until IS NULL OR v_trial_until <= now()) THEN
    RAISE NOTICE 'start_trial user_id=% result=already_used trial_until=%', v_user_id, v_trial_until;
    RETURN jsonb_build_object('result', 'already_used', 'trial_until', v_trial_until);
  END IF;

  -- Активация: 3 дня календарно в Postgres
  v_trial_until := now() + interval '3 days';
  v_result := 'activated';

  -- Trial не трогает premium_until: иначе trial маскируется под premium и ломает модель доступа.
  UPDATE public.profiles_v2
  SET
    trial_started_at = now(),
    trial_until = v_trial_until,
    trial_used = true,
    status = 'trial'::public.profile_status_v2,
    daily_limit = 30,
    last_reset = now(),
    requests_today = 0
  WHERE user_id = v_user_id;

  UPDATE public.subscriptions
  SET status = 'trial',
      started_at = now(),
      expires_at = v_trial_until
  WHERE user_id = v_user_id AND status = 'free';

  RAISE NOTICE 'start_trial user_id=% result=activated trial_until=%', v_user_id, v_trial_until;
  RETURN jsonb_build_object('result', v_result, 'trial_until', v_trial_until);
END;
$fn$;

COMMENT ON FUNCTION public.start_trial() IS 'Trial 3 дня по кнопке; один раз на пользователя; возвращает result (activated|already_active|already_used) и trial_until';

GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
