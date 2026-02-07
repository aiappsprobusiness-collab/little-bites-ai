-- Trial не при регистрации, а только по кнопке «Попробовать Premium бесплатно».
-- При первом логине: subscriptions со status='free', started_at=now(), expires_at=null.
-- Trial активируется RPC start_trial(): status='trial', started_at=now(), expires_at=now()+3 days.

-- 1. Разрешить status 'free' в subscriptions
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'trial', 'free'));

-- 2. При создании пользователя: профиль + запись в subscriptions со status=free (без trial)
CREATE OR REPLACE FUNCTION public.handle_new_user_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles_v2 (user_id, status, daily_limit, last_reset, requests_today)
  VALUES (NEW.id, 'free'::public.profile_status_v2, 5, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status, order_id, started_at, expires_at)
  VALUES (NEW.id, 'month', 'free', 'free_' || NEW.id::text, now(), NULL)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user_v2() IS 'V2: профиль + запись subscriptions со status=free при регистрации; trial по кнопке';

-- 3. RPC: активировать trial по кнопке «Попробовать Premium бесплатно»
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  updated integer;
BEGIN
  UPDATE public.subscriptions
  SET status = 'trial',
      started_at = now(),
      expires_at = now() + interval '3 days'
  WHERE user_id = auth.uid()
    AND status = 'free';

  GET DIAGNOSTICS updated = ROW_COUNT;

  IF updated > 0 THEN
    UPDATE public.profiles_v2
    SET status = 'trial'::public.profile_status_v2,
        premium_until = now() + interval '3 days'
    WHERE user_id = auth.uid();
  ELSE
    -- Пользователь без free-записи (например, старый): создаём trial-запись
    INSERT INTO public.subscriptions (user_id, plan, status, order_id, started_at, expires_at)
    VALUES (
      auth.uid(),
      'month',
      'trial',
      'trial_' || auth.uid()::text || '_' || to_char(now(), 'YYYYMMDDHH24MISS'),
      now(),
      now() + interval '3 days'
    );
    UPDATE public.profiles_v2
    SET status = 'trial'::public.profile_status_v2,
        premium_until = now() + interval '3 days'
    WHERE user_id = auth.uid();
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.start_trial() IS 'Активация trial 3 дня по кнопке «Попробовать Premium бесплатно»';

GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;
