-- Страховки webhook: уникальность payment_id, расчёт expires_at в Postgres (календарный interval).
-- 1. Уникальный индекс по payment_id (один платёж банка — одна запись).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_id_unique
  ON public.subscriptions(payment_id) WHERE payment_id IS NOT NULL;

-- 2. RPC: подтверждение подписки с расчётом срока в Postgres (interval '1 month' / '1 year').
-- Идемпотентно: обновляет только если status <> 'confirmed'.
CREATE OR REPLACE FUNCTION public.confirm_subscription_webhook(
  p_subscription_id uuid,
  p_plan text,
  p_payment_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_updated int;
BEGIN
  IF p_plan IS NULL OR p_plan NOT IN ('month', 'year') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan');
  END IF;

  v_started_at := now();
  v_expires_at := v_started_at + (CASE WHEN p_plan = 'year' THEN interval '1 year' ELSE interval '1 month' END);

  UPDATE public.subscriptions
  SET
    status = 'confirmed',
    started_at = v_started_at,
    expires_at = v_expires_at,
    plan = p_plan,
    payment_id = COALESCE(p_payment_id, payment_id)
  WHERE id = p_subscription_id AND status <> 'confirmed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'message', 'already confirmed');
  END IF;

  SELECT user_id INTO v_user_id FROM public.subscriptions WHERE id = p_subscription_id;

  INSERT INTO public.profiles_v2 (user_id, status, premium_until, daily_limit, last_reset, requests_today)
  VALUES (v_user_id, 'premium'::public.profile_status_v2, v_expires_at, 30, v_started_at, 0)
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'premium'::public.profile_status_v2,
    premium_until = v_expires_at,
    daily_limit = 30,
    last_reset = v_started_at,
    requests_today = 0;

  RETURN jsonb_build_object(
    'ok', true,
    'started_at', v_started_at,
    'expires_at', v_expires_at,
    'plan', p_plan,
    'calc_method', 'DB_interval'
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_subscription_webhook(uuid, text, bigint) IS 'Webhook: подтверждение подписки, expires_at = now() + interval; идемпотентно по status.';
