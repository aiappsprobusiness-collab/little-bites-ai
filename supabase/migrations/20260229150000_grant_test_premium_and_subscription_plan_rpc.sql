-- Тестовый Premium: идемпотентная выдача премиума для заданного user_id с синхронизацией profiles_v2 и subscriptions.
-- Не трогает прод-логику оплаты. Вызов только от service_role/postgres (SQL Editor, Edge).
--
-- Пример вызова (Supabase SQL Editor или миграция):
--   SELECT grant_test_premium('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid, 'month', NULL);   -- месяц от now()
--   SELECT grant_test_premium('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid, 'year', NULL);    -- год от now()
--   SELECT grant_test_premium('...'::uuid, 'month', '2026-12-31 23:59:59+00'::timestamptz);   -- до указанной даты

-- 1. Функция: выдать тестовый Premium (идемпотентно по user_id)
CREATE OR REPLACE FUNCTION public.grant_test_premium(
  p_user_id uuid,
  p_plan text DEFAULT 'month',
  p_premium_until timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_expires_at timestamptz;
  v_sub_id uuid;
  v_order_id text;
BEGIN
  IF p_plan IS NULL OR p_plan NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'grant_test_premium: p_plan must be ''month'' or ''year''';
  END IF;

  IF p_premium_until IS NOT NULL THEN
    v_expires_at := p_premium_until;
  ELSE
    v_expires_at := now() + (CASE WHEN p_plan = 'year' THEN interval '1 year' ELSE interval '1 month' END);
  END IF;

  -- profiles_v2: консистентно с webhook (status, premium_until, daily_limit, last_reset)
  UPDATE public.profiles_v2
  SET
    status = 'premium'::public.profile_status_v2,
    premium_until = v_expires_at,
    daily_limit = 30,
    last_reset = now(),
    requests_today = 0
  WHERE user_id = p_user_id;

  -- Подписка: одна тестовая запись на пользователя (order_id LIKE 'test_%'); при повторном вызове — обновляем
  SELECT id INTO v_sub_id
  FROM public.subscriptions
  WHERE user_id = p_user_id AND order_id LIKE 'test_%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET
      plan = p_plan,
      status = 'confirmed',
      started_at = now(),
      expires_at = v_expires_at,
      payment_id = NULL
    WHERE id = v_sub_id;
  ELSE
    v_order_id := 'test_' || p_user_id::text || '_' || to_char(now(), 'YYYYMMDDHH24MISS');
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at, payment_id, order_id)
    VALUES (p_user_id, p_plan, 'confirmed', now(), v_expires_at, NULL, v_order_id);
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.grant_test_premium(uuid, text, timestamptz) IS
  'Тестовый Premium: выставляет profiles_v2 (status=premium, premium_until) и создаёт/обновляет запись в subscriptions (confirmed). Идемпотентно по user_id. Только для тестовых аккаунтов; вызывать из SQL/Edge под service_role.';

-- Вызов только из SQL Editor / Edge (service_role). Не выдаём authenticated.
GRANT EXECUTE ON FUNCTION public.grant_test_premium(uuid, text, timestamptz) TO service_role;

-- 2. RPC для UI: текущий план и дата окончания из последней подтверждённой подписки (для страницы «Управление подпиской»)
CREATE OR REPLACE FUNCTION public.get_my_latest_confirmed_subscription()
RETURNS TABLE(plan text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT s.plan, s.expires_at
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid() AND s.status = 'confirmed'
  ORDER BY s.expires_at DESC NULLS LAST
  LIMIT 1;
END;
$fn$;

COMMENT ON FUNCTION public.get_my_latest_confirmed_subscription() IS
  'Для UI: план (month/year) и дата окончания из последней подтверждённой подписки текущего пользователя.';

GRANT EXECUTE ON FUNCTION public.get_my_latest_confirmed_subscription() TO authenticated;
