-- Источники ингредиентов: meta.source_recipes = [{ id: uuid, title: text }, ...]
-- Позволяет фильтровать список по рецептам без отдельной таблицы.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shopping_list_items' AND column_name = 'meta') THEN
    ALTER TABLE public.shopping_list_items ADD COLUMN meta JSONB DEFAULT NULL;
  END IF;
END $$;
