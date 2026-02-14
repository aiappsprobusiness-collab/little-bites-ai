-- create_recipe_with_steps(payload jsonb) returns uuid
-- Вставляет рецепт + steps в recipe_steps + ingredients в recipe_ingredients в одной транзакции.
-- Убираем ошибочные CHECK на public.recipes по steps (steps хранятся в recipe_steps).
-- Расширяем source: добавляем 'starter'.

-- 1) Удалить старые constraints на recipes, связанные с steps (если есть)
DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.recipes'::regclass AND contype = 'c'
      AND (conname LIKE 'recipes_steps_nonempty%' OR conname LIKE '%steps%' AND conname LIKE '%recipes%')
  LOOP
    EXECUTE 'ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS ' || quote_ident(c);
  END LOOP;
END $$;

-- 2) Расширить допустимые значения source (добавить 'starter')
DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.recipes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source%IN%'
  LOOP
    EXECUTE 'ALTER TABLE public.recipes DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.recipes ADD CONSTRAINT recipes_source_check
      CHECK (source IN ('week_ai', 'chat_ai', 'starter', 'seed', 'manual'));
  END IF;
END $$;

-- 3) RPC: создание рецепта с шагами и ингредиентами
CREATE OR REPLACE FUNCTION public.create_recipe_with_steps(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid;
  v_steps jsonb;
  v_ingredients jsonb;
  s jsonb;
  ing jsonb;
  idx int;
BEGIN
  IF payload IS NULL THEN
    RAISE EXCEPTION 'payload_required';
  END IF;

  v_user_id := (payload->>'user_id')::uuid;
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id must match auth.uid()';
  END IF;

  IF payload->>'source' IS NULL OR payload->>'source' = '' THEN
    RAISE EXCEPTION 'source_required';
  END IF;
  IF payload->>'source' NOT IN ('week_ai', 'chat_ai', 'starter', 'seed', 'manual') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  v_steps := payload->'steps';
  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' OR jsonb_array_length(v_steps) < 1 THEN
    RAISE EXCEPTION 'steps_required';
  END IF;
  IF jsonb_array_length(v_steps) < 3 THEN
    RAISE EXCEPTION 'steps_required';
  END IF;

  v_ingredients := payload->'ingredients';
  IF v_ingredients IS NULL OR jsonb_typeof(v_ingredients) <> 'array' OR jsonb_array_length(v_ingredients) < 3 THEN
    RAISE EXCEPTION 'ingredients_required';
  END IF;

  INSERT INTO public.recipes (
    user_id,
    child_id,
    member_id,
    title,
    description,
    image_url,
    cooking_time_minutes,
    min_age_months,
    max_age_months,
    calories,
    proteins,
    fats,
    carbs,
    tags,
    source_products,
    source,
    meal_type,
    cooking_time,
    chef_advice,
    advice
  ) VALUES (
    v_user_id,
    COALESCE((payload->>'child_id')::uuid, (payload->>'member_id')::uuid),
    COALESCE((payload->>'member_id')::uuid, (payload->>'child_id')::uuid),
    COALESCE(payload->>'title', 'Рецепт'),
    NULLIF(payload->>'description', ''),
    NULLIF(payload->>'image_url', ''),
    (payload->>'cooking_time_minutes')::integer,
    (payload->>'min_age_months')::integer,
    (payload->>'max_age_months')::integer,
    (payload->>'calories')::integer,
    (payload->>'proteins')::numeric,
    (payload->>'fats')::numeric,
    (payload->>'carbs')::numeric,
    CASE WHEN payload ? 'tags' AND jsonb_typeof(payload->'tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'tags')) ELSE '{}' END,
    CASE WHEN payload ? 'source_products' AND jsonb_typeof(payload->'source_products') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'source_products')) ELSE '{}' END,
    payload->>'source',
    NULLIF(payload->>'meal_type', ''),
    (payload->>'cooking_time_minutes')::integer,
    NULLIF(payload->>'chef_advice', ''),
    NULLIF(payload->>'advice', '')
  )
  RETURNING id INTO v_id;

  idx := 0;
  FOR s IN SELECT * FROM jsonb_array_elements(v_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (
      v_id,
      COALESCE((s->>'step_number')::integer, idx),
      COALESCE(s->>'instruction', '')
    );
  END LOOP;

  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(v_ingredients)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_ingredients (
      recipe_id,
      name,
      amount,
      unit,
      substitute,
      display_text,
      canonical_amount,
      canonical_unit,
      order_index,
      category
    ) VALUES (
      v_id,
      COALESCE(ing->>'name', ''),
      (ing->>'amount')::numeric,
      NULLIF(ing->>'unit', ''),
      NULLIF(ing->>'substitute', ''),
      NULLIF(ing->>'display_text', ''),
      (ing->>'canonical_amount')::numeric,
      NULLIF(ing->>'canonical_unit', ''),
      COALESCE((ing->>'order_index')::integer, idx - 1),
      COALESCE((ing->>'category')::public.product_category, 'other')
    );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS 'Creates recipe + recipe_steps + recipe_ingredients in one transaction. Validates: steps length >= 3, ingredients >= 3, source in (week_ai, chat_ai, starter, seed, manual).';

-- 4) Обновить ensure_starter_recipes_seeded: source='starter', при пустых steps — 3 дефолтных шага
CREATE OR REPLACE FUNCTION public.ensure_starter_recipes_seeded(p_recipes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  recipe_uuid uuid;
  user_uuid uuid;
  ing jsonb;
  s jsonb;
  has_ingredients boolean;
BEGIN
  IF p_recipes IS NULL OR jsonb_array_length(p_recipes) = 0 THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_recipes)
  LOOP
    recipe_uuid := (r->>'id')::uuid;
    user_uuid := (r->>'user_id')::uuid;
    IF user_uuid IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'user_id must match auth.uid()';
    END IF;

    INSERT INTO public.recipes (id, user_id, child_id, title, description, cooking_time_minutes, source)
    VALUES (
      recipe_uuid,
      user_uuid,
      NULL,
      r->>'title',
      NULLIF(r->>'description', ''),
      (r->>'cooking_time_minutes')::integer,
      'starter'
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT EXISTS(SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = recipe_uuid LIMIT 1)
    INTO has_ingredients;

    IF NOT has_ingredients THEN
      FOR ing IN SELECT * FROM jsonb_array_elements(r->'ingredients')
      LOOP
        INSERT INTO public.recipe_ingredients (recipe_id, name, order_index, category)
        VALUES (
          recipe_uuid,
          ing->>'name',
          COALESCE((ing->>'order_index')::integer, 0),
          'other'
        );
      END LOOP;
      IF r->'steps' IS NOT NULL AND jsonb_typeof(r->'steps') = 'array' AND jsonb_array_length(r->'steps') > 0 THEN
        FOR s IN SELECT * FROM jsonb_array_elements(r->'steps')
        LOOP
          INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
          VALUES (
            recipe_uuid,
            COALESCE((s->>'step_number')::integer, 1),
            s->>'instruction'
          );
        END LOOP;
      ELSE
        INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
        VALUES
          (recipe_uuid, 1, 'Подготовьте ингредиенты.'),
          (recipe_uuid, 2, 'Приготовьте по инструкции.'),
          (recipe_uuid, 3, 'Подайте на стол.');
      END IF;
    END IF;
  END LOOP;
END;
$$;
