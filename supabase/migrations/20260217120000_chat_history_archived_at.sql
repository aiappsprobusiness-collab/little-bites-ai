-- chat_history: архивирование вместо удаления (очистить чат = скрыть, данные остаются).
-- child_id: null = чат «Семья», иначе = id выбранного member (контекст чата).

-- 1. Колонка archived_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_history' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.chat_history ADD COLUMN archived_at timestamptz NULL;
  END IF;
END $$;

-- 2. Индекс для выборки активного чата по контексту (user + не архив + child_id)
CREATE INDEX IF NOT EXISTS idx_chat_history_user_archived_child
  ON public.chat_history (user_id, archived_at, child_id)
  WHERE archived_at IS NULL;

-- 3. Политика UPDATE: пользователь может ставить archived_at только своим записям
DROP POLICY IF EXISTS "Users can update their own chat history (archive)" ON public.chat_history;
CREATE POLICY "Users can update their own chat history (archive)" ON public.chat_history
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON COLUMN public.chat_history.archived_at IS 'Когда чат «очищен» — записи скрываются (не удаляются). NULL = активный чат.';
