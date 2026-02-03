-- Создание таблиц recipes, recipe_ingredients, recipe_steps если их нет (например, при применении только V2-миграций).
-- Зависимости: auth.users, public.members (V2).

DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('vegetables', 'fruits', 'dairy', 'meat', 'grains', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  image_url text,
  cooking_time_minutes integer,
  min_age_months integer DEFAULT 6,
  max_age_months integer DEFAULT 36,
  calories integer,
  proteins decimal(5,2),
  fats decimal(5,2),
  carbs decimal(5,2),
  is_favorite boolean DEFAULT false,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  times_cooked integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  source_products text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount decimal(10,2),
  unit text,
  category public.product_category DEFAULT 'other',
  order_index integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recipe_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  instruction text NOT NULL,
  duration_minutes integer,
  image_url text
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own recipes" ON public.recipes;
CREATE POLICY "Users can view their own recipes" ON public.recipes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own recipes" ON public.recipes;
CREATE POLICY "Users can insert their own recipes" ON public.recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
CREATE POLICY "Users can update their own recipes" ON public.recipes FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;
CREATE POLICY "Users can delete their own recipes" ON public.recipes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "Users can view ingredients of their recipes" ON public.recipe_ingredients
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert ingredients to their recipes" ON public.recipe_ingredients;
CREATE POLICY "Users can insert ingredients to their recipes" ON public.recipe_ingredients
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "Users can update ingredients of their recipes" ON public.recipe_ingredients
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "Users can delete ingredients of their recipes" ON public.recipe_ingredients
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view steps of their recipes" ON public.recipe_steps;
CREATE POLICY "Users can view steps of their recipes" ON public.recipe_steps
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert steps to their recipes" ON public.recipe_steps;
CREATE POLICY "Users can insert steps to their recipes" ON public.recipe_steps
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update steps of their recipes" ON public.recipe_steps;
CREATE POLICY "Users can update steps of their recipes" ON public.recipe_steps
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete steps of their recipes" ON public.recipe_steps;
CREATE POLICY "Users can delete steps of their recipes" ON public.recipe_steps
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_recipes_updated_at ON public.recipes;
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON public.recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_child_id ON public.recipes(child_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON public.recipe_steps(recipe_id);
