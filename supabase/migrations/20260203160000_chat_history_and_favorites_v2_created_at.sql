-- Таблицы для чата и избранного: работают без старых таблиц (children, favorites).
-- chat_history: создаём без FK на children, чтобы работало при только V2-миграциях.
-- favorites_v2: добавляем created_at для сортировки в приложении.

-- 1. chat_history (если ещё нет)
CREATE TABLE IF NOT EXISTS public.chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid NULL,
  message text NOT NULL,
  response text,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'recipe')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON public.chat_history(created_at DESC);

ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chat history" ON public.chat_history;
CREATE POLICY "Users can view their own chat history" ON public.chat_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own chat messages" ON public.chat_history;
CREATE POLICY "Users can insert their own chat messages" ON public.chat_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own chat history" ON public.chat_history;
CREATE POLICY "Users can delete their own chat history" ON public.chat_history
  FOR DELETE USING (auth.uid() = user_id);

-- 2. favorites_v2: добавить created_at для сортировки (идемпотентно)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'favorites_v2' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.favorites_v2 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

COMMENT ON TABLE public.chat_history IS 'История сообщений чата с AI; child_id опционально (V2: можно привязать к members позже).';
