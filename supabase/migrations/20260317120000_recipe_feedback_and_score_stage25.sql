-- Stage 2.5: recipe_feedback table, recipes.score, trust auto-rules, plan signals.
-- НЕТ события "приготовил". Сигналы: like, dislike, added_to_plan, removed_from_plan, replaced_in_plan.

-- 1) Таблица recipe_feedback (история событий, без upsert)
CREATE TABLE IF NOT EXISTS public.recipe_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_feedback
  ADD CONSTRAINT recipe_feedback_action_check CHECK (
    action IN ('like', 'dislike', 'added_to_plan', 'removed_from_plan', 'replaced_in_plan')
  );

CREATE INDEX IF NOT EXISTS idx_recipe_feedback_recipe_id ON public.recipe_feedback(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_feedback_recipe_action ON public.recipe_feedback(recipe_id, action);
CREATE INDEX IF NOT EXISTS idx_recipe_feedback_created_at ON public.recipe_feedback(created_at DESC);

COMMENT ON TABLE public.recipe_feedback IS 'История событий качества рецепта: лайки, план. Не upsert — каждое действие отдельная запись.';

-- 2) Колонка score в recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS score float DEFAULT 0;

COMMENT ON COLUMN public.recipes.score IS 'Скор: +2*added_to_plan +2*like -3*dislike -2*replaced_in_plan -1*removed_from_plan. Free: только added_to_plan, like, dislike.';

-- 3) Функция пересчёта score и trust_level для одного рецепта
CREATE OR REPLACE FUNCTION public.recompute_recipe_score_and_trust(p_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score float;
  v_dislike_count int;
  v_trust text;
  v_current_trust text;
BEGIN
  SELECT
    COALESCE(SUM(CASE action
      WHEN 'added_to_plan' THEN 2
      WHEN 'like' THEN 2
      WHEN 'dislike' THEN -3
      WHEN 'replaced_in_plan' THEN -2
      WHEN 'removed_from_plan' THEN -1
      ELSE 0
    END), 0),
    COUNT(*) FILTER (WHERE action = 'dislike')
  INTO v_score, v_dislike_count
  FROM recipe_feedback
  WHERE recipe_id = p_recipe_id;

  SELECT trust_level INTO v_current_trust FROM recipes WHERE id = p_recipe_id;

  -- Меняем только candidate
  IF v_current_trust = 'candidate' THEN
    IF v_score >= 5 AND v_dislike_count < 3 THEN
      v_trust := 'trusted';
    ELSIF v_score <= -3 OR v_dislike_count >= 3 THEN
      v_trust := 'blocked';
    ELSE
      v_trust := 'candidate';
    END IF;
    UPDATE recipes SET score = v_score, trust_level = v_trust, updated_at = now() WHERE id = p_recipe_id;
  ELSE
    UPDATE recipes SET score = v_score, updated_at = now() WHERE id = p_recipe_id;
  END IF;
END;
$$;

-- 4) Триггер: после вставки в recipe_feedback пересчитать score и trust
CREATE OR REPLACE FUNCTION public.recipe_feedback_after_insert_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recompute_recipe_score_and_trust(NEW.recipe_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipe_feedback_after_insert_trigger ON public.recipe_feedback;
CREATE TRIGGER recipe_feedback_after_insert_trigger
  AFTER INSERT ON public.recipe_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.recipe_feedback_after_insert_trigger_fn();

-- 5) RLS: вставка только от своего user_id
ALTER TABLE public.recipe_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipe_feedback_insert_own ON public.recipe_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY recipe_feedback_select_own ON public.recipe_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- 6) RPC record_recipe_feedback: like/dislike и план-сигналы. Free — только added_to_plan, like, dislike.
CREATE OR REPLACE FUNCTION public.record_recipe_feedback(p_recipe_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('like', 'dislike', 'added_to_plan', 'removed_from_plan', 'replaced_in_plan') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  -- Free: только added_to_plan, like, dislike
  IF p_action IN ('removed_from_plan', 'replaced_in_plan') THEN
    SELECT status INTO v_status FROM profiles_v2 WHERE user_id = v_user_id LIMIT 1;
    IF v_status IS NULL OR v_status = 'free' THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
  VALUES (p_recipe_id, v_user_id, p_action);
END;
$$;

COMMENT ON FUNCTION public.record_recipe_feedback(uuid, text) IS 'Записать событие качества. Free: только like, dislike, added_to_plan; Premium: все сигналы. Триггер обновляет recipes.score и trust_level.';

-- 7) assign_recipe_to_plan_slot: после успешного upsert записать added_to_plan и при замене — replaced_in_plan (для premium)
-- Читаем текущий слот до merge, затем делаем merge, затем записываем feedback.
CREATE OR REPLACE FUNCTION public.assign_recipe_to_plan_slot(
  p_member_id uuid,
  p_day_key text,
  p_meal_type text,
  p_recipe_id uuid,
  p_recipe_title text DEFAULT NULL,
  p_servings integer DEFAULT NULL
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
  v_servings_base int;
  v_servings_recommended int;
  v_servings int;
  v_existing_row record;
  v_old_recipe_id uuid;
  v_status text;
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

  -- Прочитать текущий слот до merge (для replaced_in_plan)
  IF p_member_id IS NULL THEN
    SELECT id, meals INTO v_existing_row
    FROM meal_plans_v2
    WHERE user_id = v_user_id AND planned_date = (p_day_key::date) AND member_id IS NULL
    LIMIT 1;
  ELSE
    SELECT id, meals INTO v_existing_row
    FROM meal_plans_v2
    WHERE user_id = v_user_id AND member_id = p_member_id AND planned_date = (p_day_key::date)
    LIMIT 1;
  END IF;

  v_old_recipe_id := NULL;
  IF v_existing_row.id IS NOT NULL AND v_existing_row.meals IS NOT NULL AND v_existing_row.meals ? v_meal_type THEN
    v_old_recipe_id := (v_existing_row.meals->v_meal_type->>'recipe_id')::uuid;
  END IF;

  IF p_recipe_title IS NULL OR p_recipe_title = '' THEN
    SELECT title, servings_base, servings_recommended
    INTO p_recipe_title, v_servings_base, v_servings_recommended
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  ELSE
    SELECT servings_base, servings_recommended
    INTO v_servings_base, v_servings_recommended
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  END IF;

  IF p_servings IS NOT NULL AND p_servings >= 1 THEN
    v_servings := p_servings;
  ELSIF COALESCE(v_servings_base, 1) = 5 THEN
    v_servings := 5;
  ELSE
    v_servings := GREATEST(1, COALESCE(v_servings_recommended, 1));
  END IF;

  v_new_slot := jsonb_build_object(
    'recipe_id', p_recipe_id,
    'title', COALESCE(NULLIF(trim(p_recipe_title), ''), 'Рецепт'),
    'servings', v_servings
  );

  IF p_member_id IS NULL THEN
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, NULL, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    ON CONFLICT (user_id, planned_date) WHERE member_id IS NULL
    DO UPDATE SET meals = COALESCE(meal_plans_v2.meals, '{}'::jsonb) || COALESCE(EXCLUDED.meals, '{}'::jsonb)
    RETURNING id, meals INTO v_row_id, v_meals;
  ELSE
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, p_member_id, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    ON CONFLICT (user_id, member_id, planned_date) WHERE member_id IS NOT NULL
    DO UPDATE SET meals = COALESCE(meal_plans_v2.meals, '{}'::jsonb) || COALESCE(EXCLUDED.meals, '{}'::jsonb)
    RETURNING id, meals INTO v_row_id, v_meals;
  END IF;

  IF v_meals IS NULL OR NOT (v_meals ? v_meal_type) OR (v_meals->v_meal_type->>'recipe_id') IS NULL THEN
    RAISE EXCEPTION 'assign_failed_slot_not_saved';
  END IF;

  -- Feedback: added_to_plan для нового рецепта
  INSERT INTO recipe_feedback (recipe_id, user_id, action) VALUES (p_recipe_id, v_user_id, 'added_to_plan');

  -- replaced_in_plan для старого — только premium
  IF v_old_recipe_id IS NOT NULL AND v_old_recipe_id != p_recipe_id THEN
    SELECT status INTO v_status FROM profiles_v2 WHERE user_id = v_user_id LIMIT 1;
    IF v_status IN ('premium', 'trial') THEN
      INSERT INTO recipe_feedback (recipe_id, user_id, action) VALUES (v_old_recipe_id, v_user_id, 'replaced_in_plan');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row_id,
    'planned_date', p_day_key,
    'meal_type', v_meal_type,
    'recipe_id', p_recipe_id,
    'title', v_new_slot->>'title',
    'servings', v_servings,
    'meals', v_meals
  );
END;
$$;

COMMENT ON FUNCTION public.assign_recipe_to_plan_slot(uuid, text, text, uuid, text, integer) IS 'Upsert slot; записывает recipe_feedback: added_to_plan для нового, replaced_in_plan для старого (premium).';
