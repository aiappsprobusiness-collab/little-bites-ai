-- recipes: добавить member_id, backfill из child_id, индекс. child_id не удаляем (backwards compatible).

-- 1) Добавить колонку member_id, если её нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE public.recipes
      ADD COLUMN member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Backfill: заполнить member_id из child_id, если member_id NULL (child_id уже хранит member id — legacy)
UPDATE public.recipes
SET member_id = child_id
WHERE member_id IS NULL AND child_id IS NOT NULL;

-- 3) Индекс для фильтрации по user_id + member_id
CREATE INDEX IF NOT EXISTS recipes_user_member_idx ON public.recipes (user_id, member_id);

-- child_id не удаляем: оставляем для обратной совместимости.
