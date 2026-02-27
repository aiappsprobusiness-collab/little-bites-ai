-- Короткие ссылки для шаринга рецептов: /r/:shareRef → recipe_id.
-- share_ref: 8–12 символов base62, не UUID.

CREATE TABLE public.share_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_ref text NOT NULL,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_refs_share_ref_unique UNIQUE (share_ref)
);

CREATE UNIQUE INDEX idx_share_refs_share_ref ON public.share_refs(share_ref);

COMMENT ON TABLE public.share_refs IS 'Короткие ссылки для шаринга: /r/:shareRef → рецепт.';

ALTER TABLE public.share_refs ENABLE ROW LEVEL SECURITY;

-- Вставка: только авторизованные пользователи (при шаринге с клиента).
CREATE POLICY "share_refs_insert_authenticated"
  ON public.share_refs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Чтение: публичное (редирект по короткой ссылке без авторизации).
CREATE POLICY "share_refs_select_anon"
  ON public.share_refs
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.share_refs TO anon;
GRANT SELECT ON public.share_refs TO authenticated;
GRANT INSERT ON public.share_refs TO authenticated;
