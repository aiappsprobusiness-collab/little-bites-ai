-- Таблица meal_plans для плана питания (если применены только V2-миграции, этой таблицы может не быть).
-- Зависимости: auth.users, public.members, public.recipes (V2).

DO $$ BEGIN
  CREATE TYPE public.meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  meal_type public.meal_type NOT NULL,
  is_completed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON public.meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_planned_date ON public.meal_plans(planned_date);
CREATE INDEX IF NOT EXISTS idx_meal_plans_child_id ON public.meal_plans(child_id);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can view their own meal plans" ON public.meal_plans FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can insert their own meal plans" ON public.meal_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can update their own meal plans" ON public.meal_plans FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can delete their own meal plans" ON public.meal_plans FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER update_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
