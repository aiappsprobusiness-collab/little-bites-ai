-- Синхронизация is_paid в members_enforce_subscription_limits с клиентом (useSubscription):
-- помимо profiles_v2.premium_until / trial_until учитываем активную подтверждённую подписку
-- в public.subscriptions и внутренний список email безлимита (как UNLIMITED_ACCESS_EMAILS в приложении).

CREATE OR REPLACE FUNCTION public.members_enforce_subscription_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pu timestamptz;
  tu timestamptz;
  prof_email text;
  is_paid boolean;
  mcount integer;
  ac integer;
  lk integer;
  dk integer;
  has_confirmed_sub boolean;
BEGIN
  SELECT p.premium_until, p.trial_until, p.email
  INTO pu, tu, prof_email
  FROM public.profiles_v2 p
  WHERE p.user_id = NEW.user_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = NEW.user_id
      AND s.status = 'confirmed'
      AND s.expires_at IS NOT NULL
      AND s.expires_at > now()
  ) INTO has_confirmed_sub;

  is_paid :=
    (pu IS NOT NULL AND pu > now())
    OR (tu IS NOT NULL AND tu > now())
    OR has_confirmed_sub
    OR lower(btrim(COALESCE(prof_email, ''))) = 'alesah007@gmail.com';

  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*)::integer INTO mcount FROM public.members WHERE user_id = NEW.user_id;
    IF is_paid THEN
      IF mcount >= 7 THEN
        RAISE EXCEPTION 'member profile limit reached (premium)';
      END IF;
    ELSE
      IF mcount >= 1 THEN
        RAISE EXCEPTION 'member profile limit reached (free)';
      END IF;
    END IF;
  END IF;

  ac := public.member_row_active_allergy_count(NEW.allergy_items, NEW.allergies);
  lk := COALESCE(cardinality(NEW.likes), 0);
  dk := COALESCE(cardinality(NEW.dislikes), 0);

  IF is_paid THEN
    IF ac > 7 OR lk > 5 OR dk > 5 THEN
      RAISE EXCEPTION 'member field limit exceeded (premium)';
    END IF;
  ELSE
    IF ac > 1 THEN
      RAISE EXCEPTION 'member allergy limit exceeded (free)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.members_enforce_subscription_limits() IS
  'Триггер: max профилей и полей. Paid если premium_until/trial_until в будущем, или subscriptions confirmed с expires_at > now(), или email безлимита (см. useSubscription UNLIMITED_ACCESS_EMAILS). Лимиты paid: 7/7/5/5; free: 1 профиль, 1 аллергия.';
