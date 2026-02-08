-- Аудит определения плана подписки: "почему этому пользователю дали year/month".
-- Запись только при реальном подтверждении (не при idempotent replay), без PII/секретов.
CREATE TABLE IF NOT EXISTS public.subscription_plan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  subscription_id uuid,
  order_id text,
  payment_id text,
  tbank_status text,
  amount bigint,
  plan_detected text NOT NULL CHECK (plan_detected IN ('month', 'year')),
  source_of_plan text NOT NULL CHECK (source_of_plan IN ('Data', 'OrderId', 'DB', 'Amount')),
  data_keys text[],
  raw_order_id_hint text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_audit_payment_id ON public.subscription_plan_audit(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_plan_audit_order_id ON public.subscription_plan_audit(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_plan_audit_subscription_id ON public.subscription_plan_audit(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_plan_audit_created_at ON public.subscription_plan_audit(created_at DESC);

COMMENT ON TABLE public.subscription_plan_audit IS 'Аудит: почему выбран plan (month/year) и source; только при реальном confirm, не при replay.';

ALTER TABLE public.subscription_plan_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_plan_audit_service_only" ON public.subscription_plan_audit;
CREATE POLICY "subscription_plan_audit_service_only" ON public.subscription_plan_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Смена типа возврата в Postgres требует DROP + CREATE (нельзя только REPLACE).
DROP FUNCTION IF EXISTS public.confirm_subscription_webhook(uuid, text, bigint);

-- RPC возвращает was_updated, чтобы webhook писал audit только при реальном обновлении (не при idempotent).
CREATE FUNCTION public.confirm_subscription_webhook(
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
    subscription_id := p_subscription_id;
    was_updated := false;
    started_at := NULL;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT s.user_id INTO v_user_id FROM public.subscriptions s WHERE s.id = p_subscription_id;

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

COMMENT ON FUNCTION public.confirm_subscription_webhook(uuid, text, bigint) IS 'Webhook: подтверждение подписки; RETURNS was_updated для записи audit только при реальном confirm.';
