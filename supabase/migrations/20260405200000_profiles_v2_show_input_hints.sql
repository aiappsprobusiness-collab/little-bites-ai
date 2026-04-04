-- UX: ротирующиеся подсказки в поле ввода чата рецептов (клиент: ChatPage + profiles_v2.show_input_hints).
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS show_input_hints boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles_v2.show_input_hints IS
  'Показывать ротирующиеся подсказки в поле ввода чата рецептов; false — статичный плейсхолдер.';
