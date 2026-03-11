-- Метаданные списка покупок: последняя синхронизация с планом (для баннера «Меню изменилось»).
-- meta: { last_synced_range?, last_synced_member_id?, last_synced_plan_signature?, last_synced_at? }

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_lists')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shopping_lists' AND column_name = 'meta') THEN
    ALTER TABLE public.shopping_lists ADD COLUMN meta JSONB DEFAULT NULL;
    COMMENT ON COLUMN public.shopping_lists.meta IS 'Sync state: last_synced_range, last_synced_member_id, last_synced_plan_signature, last_synced_at (iso string)';
  END IF;
END $$;
