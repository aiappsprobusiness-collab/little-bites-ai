-- Таблицы списка покупок (если в проекте их ещё нет).
-- Enum product_category создаём при отсутствии (базовые значения; fish/fats/spices добавляются другими миграциями).

DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('vegetables', 'fruits', 'dairy', 'meat', 'grains', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_lists') THEN
    CREATE TABLE public.shopping_lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Список покупок',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON public.shopping_lists(user_id);
    ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view their own shopping lists" ON public.shopping_lists FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can insert their own shopping lists" ON public.shopping_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update their own shopping lists" ON public.shopping_lists FOR UPDATE USING (auth.uid() = user_id);
    CREATE POLICY "Users can delete their own shopping lists" ON public.shopping_lists FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items') THEN
    CREATE TABLE public.shopping_list_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shopping_list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
      recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      amount DECIMAL(10,2),
      unit TEXT,
      category public.product_category DEFAULT 'other',
      is_purchased BOOLEAN DEFAULT false,
      recipe_title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON public.shopping_list_items(shopping_list_id);
    ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view items of their lists" ON public.shopping_list_items
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.shopping_lists sl WHERE sl.id = shopping_list_id AND sl.user_id = auth.uid()));
    CREATE POLICY "Users can insert items to their lists" ON public.shopping_list_items
      FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.shopping_lists sl WHERE sl.id = shopping_list_id AND sl.user_id = auth.uid()));
    CREATE POLICY "Users can update items of their lists" ON public.shopping_list_items
      FOR UPDATE USING (EXISTS (SELECT 1 FROM public.shopping_lists sl WHERE sl.id = shopping_list_id AND sl.user_id = auth.uid()));
    CREATE POLICY "Users can delete items of their lists" ON public.shopping_list_items
      FOR DELETE USING (EXISTS (SELECT 1 FROM public.shopping_lists sl WHERE sl.id = shopping_list_id AND sl.user_id = auth.uid()));
  END IF;
END $$;

-- Добавить recipe_title в существующую таблицу, если её уже создали без этой колонки
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shopping_list_items' AND column_name = 'recipe_title') THEN
    ALTER TABLE public.shopping_list_items ADD COLUMN recipe_title TEXT;
  END IF;
END $$;
