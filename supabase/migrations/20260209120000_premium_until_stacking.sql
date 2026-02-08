-- Premium всегда начинается сразу; при повторной оплате срок продлевается от now() или от текущего premium_until (stacking).
-- Trial не участвует в расчёте premium_until.
CREATE OR REPLACE FUNCTION public.confirm_subscription_webhook(
  p_subscription_id uuid,
  p_plan text,
  p_payment_id bigint DEFAULT NULL
)
RETURNS TABLE(subscription_id uuid, was_updated boolean, started_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_premium_until timestamptz;
  v_base timestamptz;
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_updated int;
BEGIN
  IF p_plan IS NULL OR p_plan NOT IN ('month', 'year') THEN
    subscription_id := p_subscription_id;
    was_updated := false;
    started_at := NULL;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT s.user_id, p.premium_until
  INTO v_user_id, v_existing_premium_until
  FROM public.subscriptions s
  LEFT JOIN public.profiles_v2 p ON p.user_id = s.user_id
  WHERE s.id = p_subscription_id;

  IF v_user_id IS NULL THEN
    subscription_id := p_subscription_id;
    was_updated := false;
    started_at := NULL;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- База для срока: now() или текущий premium_until, если он в будущем (stacking). Trial не учитываем.
  v_base := greatest(now(), coalesce(v_existing_premium_until, '1970-01-01'::timestamptz));
  v_expires_at := v_base + (CASE WHEN p_plan = 'year' THEN interval '1 year' ELSE interval '1 month' END);
  v_started_at := now();

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
    subscription_id := p_subscription_id;
    was_updated := false;
    started_at := NULL;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.profiles_v2 (user_id, status, premium_until, daily_limit, last_reset, requests_today)
  VALUES (v_user_id, 'premium'::public.profile_status_v2, v_expires_at, 30, v_started_at, 0)
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'premium'::public.profile_status_v2,
    premium_until = v_expires_at,
    daily_limit = 30,
    last_reset = v_started_at,
    requests_today = 0;

  subscription_id := p_subscription_id;
  was_updated := true;
  started_at := v_started_at;
  expires_at := v_expires_at;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.confirm_subscription_webhook(uuid, text, bigint) IS 'Webhook: premium_until = greatest(now(), current premium_until) + interval; stacking; trial не учитывается.';
