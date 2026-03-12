-- Одна активная сессия на аккаунт: при входе с другого устройства предыдущее теряет доступ.
-- active_session_key: уникальный ключ текущей активной сессии; клиент сравнивает с локальным значением.

ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS active_session_key text;

COMMENT ON COLUMN public.profiles_v2.active_session_key IS 'Ключ единственной активной сессии; при новом логине обновляется, старые устройства при проверке разлогиниваются.';
