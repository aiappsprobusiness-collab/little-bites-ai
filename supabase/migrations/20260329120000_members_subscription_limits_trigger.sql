-- Жёсткие лимиты members по фактическому доступу (premium_until / trial_until), дублируя продуктовые лимиты приложения.

CREATE OR REPLACE FUNCTION public.member_row_active_allergy_count(p_allergy_items jsonb, p_allergies text[])
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_allergy_items IS NOT NULL AND jsonb_typeof(p_allergy_items) = 'array' AND jsonb_array_length(p_allergy_items) > 0 THEN
      (SELECT COUNT(*)::integer FROM jsonb_array_elements(p_allergy_items) e
       WHERE COALESCE((e->>'is_active')::boolean, true))
    ELSE COALESCE(cardinality(p_allergies), 0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.members_enforce_subscription_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pu timestamptz;
  tu timestamptz;
  is_paid boolean;
  mcount integer;
  ac integer;
  lk integer;
  dk integer;
BEGIN
  SELECT premium_until, trial_until INTO pu, tu
  FROM public.profiles_v2 WHERE user_id = NEW.user_id;

  is_paid := (pu IS NOT NULL AND pu > now()) OR (tu IS NOT NULL AND tu > now());

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

DROP TRIGGER IF EXISTS members_enforce_subscription_limits_trigger ON public.members;
CREATE TRIGGER members_enforce_subscription_limits_trigger
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.members_enforce_subscription_limits();

COMMENT ON FUNCTION public.member_row_active_allergy_count(jsonb, text[]) IS 'Число активных аллергий в строке members (allergy_items или legacy allergies).';
COMMENT ON FUNCTION public.members_enforce_subscription_limits() IS 'Триггер: max профилей и полей по premium_until/trial_until (7/7/5/5 paid; 1 профиль и 1 аллергия free).';
