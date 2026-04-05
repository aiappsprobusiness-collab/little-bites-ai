-- Тема UI: только light | dark (клиент больше не предлагает «системную»).
-- Бывший `system` → подстановка `light` (пользователь может выбрать «Тёмная» в профиле).

ALTER TABLE public.profiles_v2 DROP CONSTRAINT IF EXISTS profiles_v2_theme_check;

UPDATE public.profiles_v2 SET theme = 'light' WHERE theme = 'system';

ALTER TABLE public.profiles_v2
  ALTER COLUMN theme SET DEFAULT 'light';

ALTER TABLE public.profiles_v2
  ADD CONSTRAINT profiles_v2_theme_check CHECK (theme IN ('light', 'dark'));

COMMENT ON COLUMN public.profiles_v2.theme IS
  'Тема UI: light или dark. Клиент: ProfilePage + next-themes (lb-theme).';
