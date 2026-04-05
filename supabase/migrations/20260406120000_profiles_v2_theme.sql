-- Тема интерфейса: light | dark | system (клиент: ThemeProvider + ProfilePage).
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.profiles_v2.theme IS
  'Предпочтение темы UI: light, dark или system (следовать prefers-color-scheme). Клиент синхронизирует с localStorage.';
