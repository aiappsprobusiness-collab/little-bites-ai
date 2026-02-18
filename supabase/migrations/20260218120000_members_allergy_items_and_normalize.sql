-- Safe downgrade: аллергии с is_active. Не удаляем данные.
-- allergy_items: jsonb array of { value, is_active, sort_order }.

-- 1. Колонка allergy_items в members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS allergy_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.members.allergy_items IS 'Аллергии: [{ value, is_active, sort_order }]. При free активна только первая.';

-- 2. Бэкфилл из allergies (text[]) в allergy_items
UPDATE public.members m
SET allergy_items = sub.agg
FROM (
  SELECT m2.id,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('value', t.elem, 'is_active', true, 'sort_order', t.ord - 1)
        ORDER BY t.ord
      )
       FROM unnest(m2.allergies) WITH ORDINALITY AS t(elem, ord)),
      '[]'::jsonb
    ) AS agg
  FROM public.members m2
  WHERE m2.allergies IS NOT NULL
    AND array_length(m2.allergies, 1) > 0
    AND (m2.allergy_items = '[]'::jsonb OR m2.allergy_items IS NULL)
) sub
WHERE m.id = sub.id;

-- 3. RPC: для free оставить активной только первую аллергию. Идемпотентна: если уже 1 активная — ничего не делать.
CREATE OR REPLACE FUNCTION public.normalize_allergies_for_free(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  items jsonb;
  updated jsonb;
  i int;
  first_idx int;
  active_count int;
BEGIN
  FOR r IN
    SELECT id, allergy_items
    FROM public.members
    WHERE user_id = p_user_id
      AND allergy_items IS NOT NULL
      AND jsonb_array_length(allergy_items) > 0
  LOOP
    items := r.allergy_items;
    active_count := 0;
    FOR i IN 0 .. (jsonb_array_length(items) - 1) LOOP
      IF (items->i->>'is_active')::boolean = true THEN
        active_count := active_count + 1;
      END IF;
    END LOOP;
    IF active_count = 1 THEN
      CONTINUE;
    END IF;
    first_idx := -1;
    FOR i IN 0 .. (jsonb_array_length(items) - 1) LOOP
      IF (items->i->>'is_active')::boolean = true AND first_idx < 0 THEN
        first_idx := i;
        EXIT;
      END IF;
    END LOOP;
    IF first_idx < 0 THEN
      first_idx := 0;
    END IF;
    updated := '[]'::jsonb;
    FOR i IN 0 .. (jsonb_array_length(items) - 1) LOOP
      updated := updated || jsonb_build_array(
        jsonb_build_object(
          'value', COALESCE(items->i->'value', to_jsonb(items->i->>'value')),
          'is_active', i = first_idx,
          'sort_order', COALESCE((items->i->>'sort_order')::int, i)
        )
      );
    END LOOP;
    UPDATE public.members
    SET allergy_items = updated
    WHERE id = r.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.normalize_allergies_for_free(uuid) IS 'Safe downgrade: для каждого профиля оставить активной только первую аллергию. Идемпотентна: при уже одной активной — skip.';
