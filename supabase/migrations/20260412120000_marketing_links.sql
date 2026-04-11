-- Маркетинговые короткие ссылки /go/:slug (UTM в url), управление через admin UI.

CREATE TABLE public.marketing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  url text NOT NULL,
  campaign text NOT NULL,
  content text NOT NULL,
  medium text NOT NULL DEFAULT 'shorts',
  source text NOT NULL DEFAULT 'youtube',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_links_created_at_idx ON public.marketing_links (created_at DESC);

ALTER TABLE public.marketing_links ENABLE ROW LEVEL SECURITY;

-- Редирект /go/:slug и список в админке: чтение для всех с anon-ключом.
CREATE POLICY "marketing_links_select_public"
  ON public.marketing_links
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Вставка с клиента; ограничение доступа к UI — VITE_ADMIN_MODE на фронте (временная схема).
CREATE POLICY "marketing_links_insert_public"
  ON public.marketing_links
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
