-- Trial при первом логине: добавляем status 'trial' в subscriptions и создаём trial при регистрации.
-- RPC для отмены подписки (доступ до expires_at).

-- 1. Разрешить status 'trial' в subscriptions
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'trial'));

-- 2. При создании пользователя: профиль + запись trial в subscriptions + обновить профиль на trial
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
  VALUES (NEW.id, 'month', 'trial', 'trial_' || NEW.id::text, now(), now() + interval '3 days')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.profiles_v2
  SET status = 'trial'::public.profile_status_v2,
      premium_until = now() + interval '3 days'
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user_v2() IS 'V2: профиль + trial 3 дня при регистрации';

-- 3. RPC: отменить подписку (доступ сохраняется до expires_at)
CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.subscriptions
  SET status = 'cancelled'
  WHERE user_id = auth.uid()
    AND status IN ('confirmed', 'trial');
END;
$fn$;

COMMENT ON FUNCTION public.cancel_my_subscription() IS 'Отмена подписки; доступ до expires_at не меняется';

-- Вызов для authenticated
GRANT EXECUTE ON FUNCTION public.cancel_my_subscription() TO authenticated;
