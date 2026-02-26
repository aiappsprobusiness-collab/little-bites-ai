-- create_user_recipe и update_user_recipe: infer category из name + display_text (как в create_recipe_with_steps).

CREATE OR REPLACE FUNCTION public.create_user_recipe(
  p_title text,
  p_description text,
  p_meal_type text,
  p_tags text[],
  p_chef_advice text DEFAULT NULL,
  p_steps jsonb DEFAULT NULL,
  p_ingredients jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_recipe_id uuid;
  v_meal_type_norm text;
  v_tags_final text[];
  v_tags text[];
  ing jsonb;
  idx int;
  ing_name text;
  ing_amount numeric;
  ing_unit text;
  ing_display_text text;
  ing_canonical_amount numeric;
  ing_canonical_unit text;
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
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) < 1 THEN
    RAISE EXCEPTION 'steps_required';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) < 1 THEN
    RAISE EXCEPTION 'ingredients_required';
  END IF;

  v_meal_type_norm := NULLIF(lower(btrim(COALESCE(p_meal_type, ''))), '');
  IF v_meal_type_norm IS NOT NULL AND v_meal_type_norm NOT IN ('breakfast','lunch','dinner','snack','other') THEN
    v_meal_type_norm := NULL;
  END IF;
  v_tags_final := array_remove(ARRAY['user_custom', CASE WHEN v_meal_type_norm IS NOT NULL THEN 'user_custom_' || v_meal_type_norm END], NULL);
  IF p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR array_length(p_tags, 1) = 0 THEN
    v_tags := v_tags_final;
  ELSE
    v_tags := p_tags;
  END IF;

  INSERT INTO public.recipes (
    user_id, child_id, member_id, title, description, source, meal_type, tags, chef_advice, advice, owner_user_id, visibility
  ) VALUES (
    v_uid, NULL, NULL, btrim(p_title), NULLIF(btrim(COALESCE(p_description, '')), ''),
    'user_custom', NULLIF(btrim(COALESCE(p_meal_type, '')), ''), v_tags,
    NULLIF(btrim(COALESCE(p_chef_advice, '')), ''), NULL, v_uid, 'private'
  )
  RETURNING id INTO v_recipe_id;

  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (v_recipe_id, COALESCE((ing->>'step_number')::integer, idx), COALESCE(btrim(ing->>'instruction'), ''));
  END LOOP;

  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    idx := idx + 1;
    ing_name := NULLIF(trim(COALESCE(ing->>'name', '')), '');
    ing_amount := (ing->>'amount')::numeric;
    ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
    ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
    ing_canonical_amount := (ing->>'canonical_amount')::numeric;
    ing_canonical_unit := NULLIF(trim(ing->>'canonical_unit'), '');
    ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
    ing_order := COALESCE((ing->>'order_index')::integer, idx - 1);

    IF ing_amount IS NULL AND ing_unit IS NULL AND ing_display_text IS NOT NULL THEN
      SELECT p.name_clean, p.amount_num, p.unit_text INTO parsed_name, parsed_amount, parsed_unit
        FROM public.parse_ingredient_display_text(ing_display_text) AS p LIMIT 1;
      IF parsed_amount IS NOT NULL AND parsed_name IS NOT NULL AND parsed_name <> '' THEN
        final_name := parsed_name; final_amount := parsed_amount; final_unit := parsed_unit; final_display_text := ing_display_text;
      ELSE
        final_name := COALESCE(ing_name, ing_display_text); final_amount := NULL; final_unit := NULL; final_display_text := ing_display_text;
      END IF;
    ELSE
      final_name := COALESCE(ing_name, ing_display_text, '');
      final_amount := ing_amount; final_unit := ing_unit;
      final_display_text := COALESCE(ing_display_text,
        CASE WHEN final_amount IS NOT NULL AND final_unit IS NOT NULL THEN final_name || ' — ' || final_amount || ' ' || final_unit
             WHEN final_amount IS NOT NULL THEN final_name || ' — ' || final_amount ELSE final_name END);
    END IF;

    IF ing_canonical_amount IS NOT NULL AND ing_canonical_unit IS NOT NULL AND trim(ing_canonical_unit) <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing_canonical_unit);
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := ing_canonical_amount;
        IF final_canonical_unit = 'kg' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'g'; END IF;
        IF final_canonical_unit = 'l' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'ml'; END IF;
      ELSE final_canonical_amount := NULL; final_canonical_unit := NULL; END IF;
    ELSIF final_amount IS NOT NULL THEN
      SELECT c.canonical_amount, c.canonical_unit INTO final_canonical_amount, final_canonical_unit
        FROM public.ingredient_canonical(final_amount, final_unit) AS c LIMIT 1;
    ELSE final_canonical_amount := NULL; final_canonical_unit := NULL; END IF;

    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(btrim(COALESCE(final_name, '') || ' ' || COALESCE(final_display_text, '')));
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    INSERT INTO public.recipe_ingredients (recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category)
    VALUES (v_recipe_id, final_name, final_amount, final_unit, final_display_text, final_canonical_amount, final_canonical_unit, ing_order, final_category);
  END LOOP;

  RETURN v_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_recipe(
  p_recipe_id uuid,
  p_title text,
  p_description text,
  p_meal_type text,
  p_tags text[],
  p_chef_advice text DEFAULT NULL,
  p_steps jsonb DEFAULT NULL,
  p_ingredients jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_source text;
  v_meal_type_norm text;
  v_tags_final text[];
  v_tags text[];
  ing jsonb;
  idx int;
  ing_name text;
  ing_amount numeric;
  ing_unit text;
  ing_display_text text;
  ing_canonical_amount numeric;
  ing_canonical_unit text;
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
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT r.owner_user_id, r.source INTO v_owner, v_source FROM public.recipes r WHERE r.id = p_recipe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe_not_found'; END IF;
  IF v_source <> 'user_custom' OR v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'not_owner'; END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) < 1 THEN RAISE EXCEPTION 'steps_required'; END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) < 1 THEN RAISE EXCEPTION 'ingredients_required'; END IF;

  v_meal_type_norm := NULLIF(lower(btrim(COALESCE(p_meal_type, ''))), '');
  IF v_meal_type_norm IS NOT NULL AND v_meal_type_norm NOT IN ('breakfast','lunch','dinner','snack','other') THEN v_meal_type_norm := NULL; END IF;
  v_tags_final := array_remove(ARRAY['user_custom', CASE WHEN v_meal_type_norm IS NOT NULL THEN 'user_custom_' || v_meal_type_norm END], NULL);
  IF p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR array_length(p_tags, 1) = 0 THEN v_tags := v_tags_final; ELSE v_tags := p_tags; END IF;

  UPDATE public.recipes
  SET title = btrim(p_title), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      meal_type = NULLIF(btrim(COALESCE(p_meal_type, '')), ''), tags = v_tags,
      chef_advice = NULLIF(btrim(COALESCE(p_chef_advice, '')), ''), updated_at = now()
  WHERE id = p_recipe_id;

  DELETE FROM public.recipe_steps WHERE recipe_id = p_recipe_id;
  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (p_recipe_id, COALESCE((ing->>'step_number')::integer, idx), COALESCE(btrim(ing->>'instruction'), ''));
  END LOOP;

  DELETE FROM public.recipe_ingredients WHERE recipe_id = p_recipe_id;
  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    idx := idx + 1;
    ing_name := NULLIF(trim(COALESCE(ing->>'name', '')), '');
    ing_amount := (ing->>'amount')::numeric;
    ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
    ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
    ing_canonical_amount := (ing->>'canonical_amount')::numeric;
    ing_canonical_unit := NULLIF(trim(ing->>'canonical_unit'), '');
    ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
    ing_order := COALESCE((ing->>'order_index')::integer, idx - 1);

    IF ing_amount IS NULL AND ing_unit IS NULL AND ing_display_text IS NOT NULL THEN
      SELECT p.name_clean, p.amount_num, p.unit_text INTO parsed_name, parsed_amount, parsed_unit
        FROM public.parse_ingredient_display_text(ing_display_text) AS p LIMIT 1;
      IF parsed_amount IS NOT NULL AND parsed_name IS NOT NULL AND parsed_name <> '' THEN
        final_name := parsed_name; final_amount := parsed_amount; final_unit := parsed_unit; final_display_text := ing_display_text;
      ELSE
        final_name := COALESCE(ing_name, ing_display_text); final_amount := NULL; final_unit := NULL; final_display_text := ing_display_text;
      END IF;
    ELSE
      final_name := COALESCE(ing_name, ing_display_text, '');
      final_amount := ing_amount; final_unit := ing_unit;
      final_display_text := COALESCE(ing_display_text,
        CASE WHEN final_amount IS NOT NULL AND final_unit IS NOT NULL THEN final_name || ' — ' || final_amount || ' ' || final_unit
             WHEN final_amount IS NOT NULL THEN final_name || ' — ' || final_amount ELSE final_name END);
    END IF;

    IF ing_canonical_amount IS NOT NULL AND ing_canonical_unit IS NOT NULL AND trim(ing_canonical_unit) <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing_canonical_unit);
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := ing_canonical_amount;
        IF final_canonical_unit = 'kg' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'g'; END IF;
        IF final_canonical_unit = 'l' THEN final_canonical_amount := final_canonical_amount * 1000; final_canonical_unit := 'ml'; END IF;
      ELSE final_canonical_amount := NULL; final_canonical_unit := NULL; END IF;
    ELSIF final_amount IS NOT NULL THEN
      SELECT c.canonical_amount, c.canonical_unit INTO final_canonical_amount, final_canonical_unit
        FROM public.ingredient_canonical(final_amount, final_unit) AS c LIMIT 1;
    ELSE final_canonical_amount := NULL; final_canonical_unit := NULL; END IF;

    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(btrim(COALESCE(final_name, '') || ' ' || COALESCE(final_display_text, '')));
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    INSERT INTO public.recipe_ingredients (recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category)
    VALUES (p_recipe_id, final_name, final_amount, final_unit, final_display_text, final_canonical_amount, final_canonical_unit, ing_order, final_category);
  END LOOP;
END;
$$;
