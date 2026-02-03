-- Add likes field to children table (только если таблица children существует)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'children') THEN
    ALTER TABLE public.children ADD COLUMN IF NOT EXISTS likes TEXT[] DEFAULT '{}';
    UPDATE public.children SET likes = '{}' WHERE likes IS NULL;
  END IF;
END
$$;
