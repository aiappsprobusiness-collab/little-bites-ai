-- Истечение premium/trial в profiles_v2 (зеркало subscriptionAccess / useSubscription).
-- Whitelist email не сбрасывается при истёкшем premium_until.

CREATE OR REPLACE FUNCTION public.is_internal_unlimited_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_email, ''))) = 'alesah007@gmail.com';
$$;

COMMENT ON FUNCTION public.is_internal_unlimited_email(text) IS
  'Внутренний безлимит (зеркало UNLIMITED_ACCESS_EMAILS в subscriptionAccess.ts).';

CREATE OR REPLACE FUNCTION public.expire_profile_subscription_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid;
  v_status public.profile_status_v2;
  v_premium_until timestamptz;
  v_trial_until timestamptz;
  v_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.status, p.premium_until, p.trial_until, p.email
  INTO v_status, v_premium_until, v_trial_until, v_email
  FROM public.profiles_v2 p
  WHERE p.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status = 'trial'::public.profile_status_v2
     AND v_trial_until IS NOT NULL
     AND v_trial_until <= now() THEN
    UPDATE public.profiles_v2
    SET status = 'free'::public.profile_status_v2,
        daily_limit = 5
    WHERE user_id = v_user_id;
    RETURN;
  END IF;

  IF v_status = 'premium'::public.profile_status_v2
     AND v_premium_until IS NOT NULL
     AND v_premium_until <= now()
     AND NOT public.is_internal_unlimited_email(v_email) THEN
    UPDATE public.profiles_v2
    SET status = 'free'::public.profile_status_v2,
        daily_limit = 5
    WHERE user_id = v_user_id;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.expire_profile_subscription_if_needed() IS
  'Сброс trial/premium в free при истечении trial_until/premium_until. Whitelist email не трогаем.';

GRANT EXECUTE ON FUNCTION public.expire_profile_subscription_if_needed() TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_subscription_profiles_batch()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.profiles_v2 p
  SET status = 'free'::public.profile_status_v2,
      daily_limit = 5
  WHERE (
      (p.status = 'trial'::public.profile_status_v2
       AND p.trial_until IS NOT NULL
       AND p.trial_until <= now())
      OR (
        p.status = 'premium'::public.profile_status_v2
        AND p.premium_until IS NOT NULL
        AND p.premium_until <= now()
        AND NOT public.is_internal_unlimited_email(p.email)
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.expire_stale_subscription_profiles_batch() IS
  'Пакетный сброс истёкших trial/premium (cron/SQL). Whitelist premium не сбрасывается.';

GRANT EXECUTE ON FUNCTION public.expire_stale_subscription_profiles_batch() TO service_role;
