-- Store recipe name for items added from favorites/chat (no FK to recipes)
-- Выполняется только если таблица shopping_list_items существует.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items') THEN
    ALTER TABLE public.shopping_list_items ADD COLUMN IF NOT EXISTS recipe_title TEXT;
    COMMENT ON COLUMN public.shopping_list_items.recipe_title IS 'Name of recipe when added from favorites/chat; used for grouping in "by recipe" view';
  END IF;
END
$$;
