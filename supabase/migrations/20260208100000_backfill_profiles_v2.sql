-- Backfill profiles_v2 для пользователей, заведённых до появления триггера (запись создаётся только при INSERT в auth.users).
-- После backfill синхронизируем premium из подтверждённых подписок.

-- 1. Создать запись в profiles_v2 для каждого auth.users, у кого её ещё нет
INSERT INTO public.profiles_v2 (user_id, status, daily_limit, last_reset, requests_today)
SELECT u.id, 'free'::public.profile_status_v2, 5, now(), 0
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles_v2 p WHERE p.user_id = u.id);

-- 2. Выставить premium и premium_until тем, у кого есть подтверждённая подписка
UPDATE public.profiles_v2 p
SET status = 'premium'::public.profile_status_v2,
    premium_until = s.expires_at,
    daily_limit = 30
FROM public.subscriptions s
WHERE s.user_id = p.user_id
  AND s.status = 'confirmed'
  AND s.expires_at IS NOT NULL;
