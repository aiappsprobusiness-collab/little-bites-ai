-- Справочник блогеров для ссылок t.me/bot?start=... (код = blogger_id в URL; атрибуция в usage_events).
-- Клиентский доступ как у marketing_links: защита только VITE_ADMIN_MODE + скрытый путь (см. docs).

CREATE TABLE public.telegram_bloggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  channel_url text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_bloggers_code_key UNIQUE (code),
  CONSTRAINT telegram_bloggers_code_format CHECK (
    code = lower(code)
    AND char_length(code) >= 1
    AND char_length(code) <= 32
    AND code ~ '^[a-z0-9_]+$'
  )
);

CREATE INDEX telegram_bloggers_is_active_idx ON public.telegram_bloggers (is_active, created_at DESC);
CREATE INDEX telegram_bloggers_display_name_idx ON public.telegram_bloggers (display_name);

CREATE TRIGGER telegram_bloggers_set_updated_at
  BEFORE UPDATE ON public.telegram_bloggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.telegram_bloggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_bloggers_select_public"
  ON public.telegram_bloggers
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "telegram_bloggers_insert_public"
  ON public.telegram_bloggers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "telegram_bloggers_update_public"
  ON public.telegram_bloggers
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "telegram_bloggers_delete_public"
  ON public.telegram_bloggers
  FOR DELETE
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.telegram_bloggers IS
  'Справочник блогеров: code совпадает с blogger_id в t.me/...?start= (см. docs/dev/TELEGRAM_BLOGGER_LINKS.md)';
