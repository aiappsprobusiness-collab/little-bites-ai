-- Флаг: пользователю уже показали пример меню — повторные прохождения ведут на короткий CTA без генерации.
ALTER TABLE public.telegram_onboarding_sessions
  ADD COLUMN IF NOT EXISTS menu_example_delivered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.telegram_onboarding_sessions.menu_example_delivered IS
  'После первого успешного превью меню (есть приёмы пищи) — true; дальше только короткое сообщение + ссылка в приложение.';
