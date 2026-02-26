-- chat_history: добавить meta jsonb для контекста (blocked follow-up и др.).
-- Старые записи остаются с meta = {}.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_history' AND column_name = 'meta'
  ) THEN
    ALTER TABLE public.chat_history
      ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN public.chat_history.meta IS 'Метаданные ответа: blocked (bool), original_query, suggested_alternatives, intended_dish_hint и др. для follow-up после аллергии/dislikes.';
  END IF;
END $$;
