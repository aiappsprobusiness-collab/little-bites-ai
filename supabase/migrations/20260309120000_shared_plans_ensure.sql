-- Повторное создание shared_plans: версия 20260306120000 уже занята в schema_migrations другой миграцией.
-- Идемпотентно: создаём таблицу и объекты только если их ещё нет.

CREATE TABLE IF NOT EXISTS public.shared_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_plans_ref_unique UNIQUE (ref)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_plans_ref ON public.shared_plans(ref);

COMMENT ON TABLE public.shared_plans IS 'Шаринг плана дня: /p/:ref. payload: дата, приёмы пищи (названия, типы).';

ALTER TABLE public.shared_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_plans' AND policyname = 'shared_plans_insert_own') THEN
    CREATE POLICY "shared_plans_insert_own"
      ON public.shared_plans
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_plans' AND policyname = 'shared_plans_select_by_ref') THEN
    CREATE POLICY "shared_plans_select_by_ref"
      ON public.shared_plans
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

GRANT SELECT ON public.shared_plans TO anon;
GRANT SELECT, INSERT ON public.shared_plans TO authenticated;
