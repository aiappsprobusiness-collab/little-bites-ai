-- Share плана питания: /p/:ref → план дня (названия блюд, типы, дата).
-- ref: короткий id 8–10 символов.

CREATE TABLE public.shared_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_plans_ref_unique UNIQUE (ref)
);

CREATE UNIQUE INDEX idx_shared_plans_ref ON public.shared_plans(ref);

COMMENT ON TABLE public.shared_plans IS 'Шаринг плана дня: /p/:ref. payload: дата, приёмы пищи (названия, типы).';

ALTER TABLE public.shared_plans ENABLE ROW LEVEL SECURITY;

-- Вставка: только авторизованные (свой user_id).
CREATE POLICY "shared_plans_insert_own"
  ON public.shared_plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Чтение по ref: публичное (landing без авторизации).
CREATE POLICY "shared_plans_select_by_ref"
  ON public.shared_plans
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.shared_plans TO anon;
GRANT SELECT, INSERT ON public.shared_plans TO authenticated;
