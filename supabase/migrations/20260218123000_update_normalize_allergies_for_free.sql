-- Обновление RPC normalize_allergies_for_free: сделать идемпотентной.
-- Если у профиля уже ровно 1 активная аллергия — для этого профиля не выполнять UPDATE (CONTINUE).
-- Логика выбора «первой» активной и нормализации — без изменений.

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

    -- 1) посчитать active_count
    active_count := 0;
    FOR i IN 0 .. (jsonb_array_length(items) - 1) LOOP
      IF COALESCE((items->i->>'is_active')::boolean, false) = true THEN
        active_count := active_count + 1;
      END IF;
    END LOOP;

    -- 2) если уже ровно 1 активная — ничего не делаем (идемпотентность)
    IF active_count = 1 THEN
      CONTINUE;
    END IF;

    -- 3) нормализация: оставить одну активную (первую по порядку/sort_order), остальные деактивировать
    first_idx := -1;
    FOR i IN 0 .. (jsonb_array_length(items) - 1) LOOP
      IF COALESCE((items->i->>'is_active')::boolean, false) = true AND first_idx < 0 THEN
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

COMMENT ON FUNCTION public.normalize_allergies_for_free(uuid) IS 'Safe downgrade: для каждого профиля оставить активной только первую аллергию. Идемпотентна: при уже одной активной — skip. Вызов: RPC как раньше.';
