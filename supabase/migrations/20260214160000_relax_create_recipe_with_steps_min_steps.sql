-- Relax create_recipe_with_steps: allow steps >= 1 (was >= 3) so weekly plans can save 1–2 real steps without placeholders.
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
  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' THEN
    RAISE EXCEPTION 'steps_required';
  END IF;
  -- Relaxed: accept any array length (0 or more) so weekly can save real steps only (no placeholders).

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
