-- infer_ingredient_category(name_clean): deterministic category from name for Cooper cart.
-- Apply in create_recipe_with_steps when payload category is null/empty or 'other'.
-- Depends on: 20260220175000 (product_category enum: fish, fats, spices).

-- 1) Deterministic category from ingredient name (lowercased stem matching)
CREATE OR REPLACE FUNCTION public.infer_ingredient_category(name_clean text)
RETURNS public.product_category
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  n text;
BEGIN
  IF name_clean IS NULL OR trim(name_clean) = '' THEN
    RETURN 'other'::public.product_category;
  END IF;
  n := lower(trim(name_clean));

  -- Order matters: more specific tokens first (e.g. "творог" before "сыр" in dairy)
  IF n ~ '(говядин|свинин|баранин|индейк|куриц|фарш|котлет)' THEN RETURN 'meat'::public.product_category; END IF;
  IF n ~ '(рыба|лосос|треск|тунец|семг|форел)' THEN RETURN 'fish'::public.product_category; END IF;
  IF n ~ '(молок|кефир|йогурт|творог|сыр|сметан|сливк)' THEN RETURN 'dairy'::public.product_category; END IF;
  IF n ~ '(круп|овсян|греч|рис|макарон|паста|мука)' THEN RETURN 'grains'::public.product_category; END IF;
  IF n ~ '(морков|кабач|тыкв|капуст|картоф|лук|огурц|помидор)' THEN RETURN 'vegetables'::public.product_category; END IF;
  IF n ~ '(яблок|банан|груш|ягод|клубник)' THEN RETURN 'fruits'::public.product_category; END IF;
  IF n ~ '(масло|оливк|сливочн)' THEN RETURN 'fats'::public.product_category; END IF;
  IF n ~ '(соль|перец|специи|укроп|петруш)' THEN RETURN 'spices'::public.product_category; END IF;

  RETURN 'other'::public.product_category;
END;
$$;

COMMENT ON FUNCTION public.infer_ingredient_category(text) IS 'Deterministic ingredient category from name for Cooper cart. Used when payload category is null or other.';

-- 2) create_recipe_with_steps: when category is NULL/empty or 'other' -> infer from name
-- Reuses full body from 20260220120000, only change: compute final_category = infer when payload category is other/null
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
  ing_name text;
  ing_amount numeric;
  ing_unit text;
  ing_display_text text;
  ing_substitute text;
  ing_category text;
  ing_order int;
  parsed_name text;
  parsed_amount numeric;
  parsed_unit text;
  final_name text;
  final_amount numeric;
  final_unit text;
  final_display_text text;
  final_canonical_amount numeric;
  final_canonical_unit text;
  final_category public.product_category;
  rec record;
BEGIN
  IF payload IS NULL THEN RAISE EXCEPTION 'payload_required'; END IF;

  v_user_id := (payload->>'user_id')::uuid;
  IF v_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'user_id must match auth.uid()'; END IF;
  IF payload->>'source' IS NULL OR payload->>'source' = '' THEN RAISE EXCEPTION 'source_required'; END IF;
  IF payload->>'source' NOT IN ('week_ai', 'chat_ai', 'starter', 'seed', 'manual') THEN RAISE EXCEPTION 'invalid_source'; END IF;

  v_steps := payload->'steps';
  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' THEN RAISE EXCEPTION 'steps_required'; END IF;
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
    chef_advice,
    advice,
    generation_context
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
    CASE WHEN payload ? 'tags' AND jsonb_typeof(payload->'tags') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(payload->'tags')) ELSE '{}' END,
    CASE WHEN payload ? 'source_products' AND jsonb_typeof(payload->'source_products') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(payload->'source_products')) ELSE '{}' END,
    payload->>'source',
    NULLIF(payload->>'meal_type', ''),
    NULLIF(payload->>'chef_advice', ''),
    NULLIF(payload->>'advice', ''),
    CASE WHEN payload ? 'generation_context' THEN payload->'generation_context' ELSE NULL END
  )
  RETURNING id INTO v_id;

  idx := 0;
  FOR s IN SELECT * FROM jsonb_array_elements(v_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (v_id, COALESCE((s->>'step_number')::integer, idx), COALESCE(s->>'instruction', ''));
  END LOOP;

  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(v_ingredients)
  LOOP
    idx := idx + 1;
    IF jsonb_typeof(ing) = 'string' THEN
      ing_name := NULL;
      ing_amount := NULL;
      ing_unit := NULL;
      ing_display_text := NULLIF(trim(ing #>> '{}'), '');
      ing_substitute := NULL;
      ing_category := 'other';
      ing_order := idx - 1;
    ELSE
      ing_name := NULLIF(trim(COALESCE(ing->>'name', '')), '');
      ing_amount := (ing->>'amount')::numeric;
      ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
      ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
      ing_substitute := NULLIF(trim(COALESCE(ing->>'substitute', '')), '');
      ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
      ing_order := COALESCE((ing->>'order_index')::integer, idx - 1);
    END IF;

    IF ing_amount IS NULL AND ing_unit IS NULL AND ing_display_text IS NOT NULL THEN
      SELECT p.name_clean, p.amount_num, p.unit_text
        INTO parsed_name, parsed_amount, parsed_unit
        FROM public.parse_ingredient_display_text(ing_display_text) AS p
        LIMIT 1;
      IF parsed_amount IS NOT NULL AND parsed_name IS NOT NULL AND parsed_name <> '' THEN
        final_name := parsed_name;
        final_amount := parsed_amount;
        final_unit := parsed_unit;
        final_display_text := ing_display_text;
      ELSE
        final_name := COALESCE(ing_name, ing_display_text);
        final_amount := NULL;
        final_unit := NULL;
        final_display_text := ing_display_text;
      END IF;
    ELSE
      final_name := COALESCE(ing_name, ing_display_text, '');
      final_amount := ing_amount;
      final_unit := ing_unit;
      final_display_text := COALESCE(ing_display_text,
        CASE WHEN final_amount IS NOT NULL AND final_unit IS NOT NULL THEN final_name || ' — ' || final_amount || ' ' || final_unit
             WHEN final_amount IS NOT NULL THEN final_name || ' — ' || final_amount
             ELSE final_name END);
    END IF;

    IF (ing->>'canonical_amount') IS NOT NULL AND (ing->>'canonical_amount')::numeric IS NOT NULL
       AND ing->>'canonical_unit' IS NOT NULL AND trim(ing->>'canonical_unit') <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing->>'canonical_unit');
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := (ing->>'canonical_amount')::numeric;
        IF final_canonical_unit = 'kg' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'g'; END IF;
        IF final_canonical_unit = 'l' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'ml'; END IF;
      ELSE
        final_canonical_amount := NULL;
        final_canonical_unit := NULL;
      END IF;
    ELSIF final_amount IS NOT NULL THEN
      SELECT c.canonical_amount, c.canonical_unit INTO final_canonical_amount, final_canonical_unit
        FROM public.ingredient_canonical(final_amount, final_unit) AS c LIMIT 1;
    ELSE
      final_canonical_amount := NULL;
      final_canonical_unit := NULL;
    END IF;

    -- Auto-category: if payload category is null/empty or 'other' -> infer from name
    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(final_name);
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, substitute, display_text, canonical_amount, canonical_unit, order_index, category
    ) VALUES (
      v_id,
      final_name,
      final_amount,
      final_unit,
      ing_substitute,
      final_display_text,
      final_canonical_amount,
      final_canonical_unit,
      ing_order,
      final_category
    );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS 'Creates recipe + steps + ingredients. Parses display_text when amount/unit null; normalizes canonical_unit; infers category when payload category is null/other.';

-- 3) Backfill category only: set category = infer_ingredient_category(name) where category is null or 'other'
DO $$
DECLARE
  total_updated int;
BEGIN
  UPDATE public.recipe_ingredients
  SET category = public.infer_ingredient_category(name)
  WHERE (category IS NULL OR category = 'other'::public.product_category)
    AND name IS NOT NULL AND trim(name) <> '';

  GET DIAGNOSTICS total_updated = ROW_COUNT;
  IF total_updated > 0 THEN
    RAISE NOTICE 'Backfill recipe_ingredients category: updated % row(s).', total_updated;
  END IF;
END;
$$;
