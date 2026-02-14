-- recipes_pool: хранение рецептов (recipes + recipe_ingredients) и связь chat_history.recipe_id
-- Idempotent: только IF NOT EXISTS / проверка existence. Не ломаем существующие таблицы.

-- 1) Таблица public.recipes — добавляем недостающие колонки (таблица уже есть из 20260203170000)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='source') THEN
    ALTER TABLE public.recipes ADD COLUMN source text NOT NULL DEFAULT 'chat_ai' CHECK (source IN ('chat_ai','week_ai','seed','manual'));
  END IF;
  -- member_id: используем child_id (уже есть), не добавляем дубликат
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='meal_type') THEN
    ALTER TABLE public.recipes ADD COLUMN meal_type text NULL CHECK (meal_type IN ('breakfast','lunch','snack','dinner'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='steps') THEN
    ALTER TABLE public.recipes ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='cooking_time') THEN
    ALTER TABLE public.recipes ADD COLUMN cooking_time integer NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='chef_advice') THEN
    ALTER TABLE public.recipes ADD COLUMN chef_advice text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='advice') THEN
    ALTER TABLE public.recipes ADD COLUMN advice text NULL;
  END IF;
END $$;

-- Индексы (только если не существуют)
CREATE INDEX IF NOT EXISTS recipes_user_created_idx ON public.recipes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recipes_user_member_meal_idx ON public.recipes (user_id, child_id, meal_type);

-- 2) recipe_ingredients: display_text, canonical_amount, canonical_unit уже добавлены в 20260212140000
-- Проверяем наличие canonical_unit check (может быть без constraint name в некоторых миграциях)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='display_text') THEN
    ALTER TABLE public.recipe_ingredients ADD COLUMN display_text text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='canonical_amount') THEN
    ALTER TABLE public.recipe_ingredients ADD COLUMN canonical_amount numeric NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='canonical_unit') THEN
    ALTER TABLE public.recipe_ingredients ADD COLUMN canonical_unit text NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_ingredients_canonical_unit_check') THEN
    ALTER TABLE public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_canonical_unit_check
      CHECK (canonical_unit IS NULL OR canonical_unit IN ('g', 'ml'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON public.recipe_ingredients (recipe_id);

-- 3) chat_history.recipe_id — добавить колонку, если нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chat_history' AND column_name='recipe_id'
  ) THEN
    ALTER TABLE public.chat_history
      ADD COLUMN recipe_id uuid NULL REFERENCES public.recipes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) RLS: recipes и recipe_ingredients уже включены в 20260203170000 — не трогаем
-- Политики уже есть. Ничего не меняем.

-- 5) updated_at trigger: уже существует update_recipes_updated_at в 20260203170000 — не трогаем
