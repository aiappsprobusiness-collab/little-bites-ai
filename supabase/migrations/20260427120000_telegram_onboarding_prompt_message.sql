-- Сообщение с чипами: message_id для editMessageReplyMarkup.
ALTER TABLE public.telegram_onboarding_sessions
  ADD COLUMN IF NOT EXISTS prompt_message_id bigint;

COMMENT ON COLUMN public.telegram_onboarding_sessions.prompt_message_id IS
  'Telegram message_id последнего промпта с inline-клавиатурой (чипы), для обновления клавиатуры.';
