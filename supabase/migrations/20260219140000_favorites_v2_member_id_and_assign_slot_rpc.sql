-- favorites_v2: add member_id for per-profile favorites. Uniqueness: (user_id, recipe_id) for family, (user_id, recipe_id, member_id) for member.
-- RPC assign_recipe_to_plan_slot for manual "add to plan" from Chat/Favorites.
-- В SQL Editor выполняйте по блокам (каждый блок — отдельный Run), если целиком падает.

-- ========== 1. favorites_v2: add member_id ==========
ALTER TABLE public.favorites_v2
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;

-- ========== 2. Удалить дубликаты (user_id, recipe_id, member_id) перед уникальными индексами ==========
-- Оставляем одну запись с минимальным id на каждую (user_id, recipe_id, member_id)
DELETE FROM public.favorites_v2 a
USING public.favorites_v2 b
WHERE a.user_id = b.user_id
  AND a.recipe_id = b.recipe_id
  AND (a.member_id IS NULL AND b.member_id IS NULL OR a.member_id = b.member_id)
  AND a.id > b.id;

-- ========== 3. Drop old unique constraint ==========
ALTER TABLE public.favorites_v2
  DROP CONSTRAINT IF EXISTS favorites_v2_user_recipe_key;

-- ========== 4. Partial unique: one (user, recipe) for family ==========
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_v2_user_recipe_family
  ON public.favorites_v2 (user_id, recipe_id)
  WHERE member_id IS NULL;

-- ========== 5. Partial unique: one (user, recipe, member) per member ==========
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_v2_user_recipe_member
  ON public.favorites_v2 (user_id, recipe_id, member_id)
  WHERE member_id IS NOT NULL;

-- ========== 6. Indexes for list/filter ==========
CREATE INDEX IF NOT EXISTS idx_favorites_v2_user_member_created
  ON public.favorites_v2 (user_id, member_id, created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_favorites_v2_user_recipe
  ON public.favorites_v2 (user_id, recipe_id);

COMMENT ON COLUMN public.favorites_v2.member_id IS 'NULL = family favorite; set = favorite for this member. Same recipe can be favorited for family and for member(s).';

-- ========== 7. RPC assign_recipe_to_plan_slot ==========
CREATE OR REPLACE FUNCTION public.assign_recipe_to_plan_slot(
  p_member_id uuid,
  p_day_key text,
  p_meal_type text,
  p_recipe_id uuid,
  p_recipe_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_meal_type text;
  v_row_id uuid;
  v_meals jsonb;
  v_new_slot jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_meal_type := lower(trim(p_meal_type));
  IF v_meal_type NOT IN ('breakfast', 'lunch', 'snack', 'dinner') THEN
    RAISE EXCEPTION 'invalid_meal_type';
  END IF;

  IF p_recipe_id IS NULL THEN
    RAISE EXCEPTION 'recipe_id_required';
  END IF;

  IF p_recipe_title IS NULL OR p_recipe_title = '' THEN
    SELECT title INTO p_recipe_title
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  END IF;

  v_new_slot := jsonb_build_object(
    'recipe_id', p_recipe_id,
    'title', COALESCE(NULLIF(trim(p_recipe_title), ''), 'Рецепт')
  );

  SELECT id, meals INTO v_row_id, v_meals
  FROM meal_plans_v2
  WHERE user_id = v_user_id
    AND planned_date = (p_day_key::date)
    AND ((p_member_id IS NULL AND member_id IS NULL) OR (p_member_id IS NOT NULL AND member_id = p_member_id))
  LIMIT 1;

  IF v_row_id IS NOT NULL THEN
    v_meals := COALESCE(v_meals, '{}'::jsonb) || jsonb_build_object(v_meal_type, v_new_slot);
    UPDATE meal_plans_v2
    SET meals = v_meals
    WHERE id = v_row_id;
  ELSE
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, p_member_id, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    RETURNING id INTO v_row_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row_id,
    'planned_date', p_day_key,
    'meal_type', v_meal_type,
    'recipe_id', p_recipe_id,
    'title', v_new_slot->>'title'
  );
END;
$$;

COMMENT ON FUNCTION public.assign_recipe_to_plan_slot(uuid, text, text, uuid, text) IS 'Manual assign recipe to plan slot. Idempotent upsert. Used from Chat/Favorites "Add to plan".';
