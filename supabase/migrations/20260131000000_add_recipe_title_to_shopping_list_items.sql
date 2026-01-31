-- Store recipe name for items added from favorites/chat (no FK to recipes)
ALTER TABLE public.shopping_list_items
ADD COLUMN IF NOT EXISTS recipe_title TEXT;

COMMENT ON COLUMN public.shopping_list_items.recipe_title IS 'Name of recipe when added from favorites/chat; used for grouping in "by recipe" view';
