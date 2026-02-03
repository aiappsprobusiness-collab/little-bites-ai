-- Удаление таблицы children: данные о членах семьи хранятся в members.
-- 1) Убираем FK на children в recipes и meal_plans.
-- 2) Обнуляем child_id (старые id из children не совпадают с members.id).
-- 3) Добавляем FK child_id -> members(id).
-- 4) Удаляем таблицу children.

-- 1a. recipes: снять FK на children
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'recipes'
      AND constraint_name = 'recipes_child_id_fkey'
  ) THEN
    ALTER TABLE public.recipes DROP CONSTRAINT recipes_child_id_fkey;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 1b. recipes: обнулить старые ссылки, затем FK на members
UPDATE public.recipes SET child_id = NULL WHERE child_id IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE public.recipes
      ADD CONSTRAINT recipes_child_id_fkey
      FOREIGN KEY (child_id) REFERENCES public.members(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
END $$;

-- 2a. meal_plans: снять FK на children
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'meal_plans'
      AND constraint_name = 'meal_plans_child_id_fkey'
  ) THEN
    ALTER TABLE public.meal_plans DROP CONSTRAINT meal_plans_child_id_fkey;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2b. meal_plans: обнулить старые ссылки, затем FK на members
UPDATE public.meal_plans SET child_id = NULL WHERE child_id IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meal_plans' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE public.meal_plans
      ADD CONSTRAINT meal_plans_child_id_fkey
      FOREIGN KEY (child_id) REFERENCES public.members(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
END $$;

-- 3. chat_history: если есть FK на children — удалить (в V2 child_id уже без FK)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'chat_history'
      AND constraint_name = 'chat_history_child_id_fkey'
  ) THEN
    ALTER TABLE public.chat_history DROP CONSTRAINT chat_history_child_id_fkey;
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- 4. Удалить таблицу children
DROP TABLE IF EXISTS public.children;

COMMENT ON COLUMN public.recipes.child_id IS 'member_id: для какого члена семьи рецепт (V2: ссылка на members).';
COMMENT ON COLUMN public.meal_plans.child_id IS 'member_id: план для какого члена семьи (V2: ссылка на members).';
