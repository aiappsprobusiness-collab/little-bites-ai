-- Fix ingredient parsing in create_recipe_with_steps: parse display_text when amount/unit null,
-- normalize canonical_unit, compute canonical_amount. Single source of truth for recipe_ingredients.

-- 1) Allow extended canonical_unit for recipe_ingredients (g, kg, ml, l, pcs, tsp, tbsp)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_ingredients_canonical_unit_check') THEN
    ALTER TABLE public.recipe_ingredients DROP CONSTRAINT recipe_ingredients_canonical_unit_check;
  END IF;
  ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_canonical_unit_check
    CHECK (canonical_unit IS NULL OR canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Helper: parse display_text like "Тыква — 150 г" or "Яблоко - 1 шт." -> (name_clean, amount_num, unit_text)
CREATE OR REPLACE FUNCTION public.parse_ingredient_display_text(display_text text)
RETURNS TABLE(name_clean text, amount_num numeric, unit_text text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  rest text;
  num_part text;
  am numeric;
  u text;
  n text;
BEGIN
  IF display_text IS NULL OR trim(display_text) = '' THEN
    name_clean := '';
    amount_num := NULL;
    unit_text := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  -- Split by em dash or hyphen (— or -) from the right: "Name — 150 г"
  rest := trim(display_text);
  parts := regexp_split_to_array(rest, '\s*[—\-]\s*');
  IF array_length(parts, 1) < 2 THEN
    name_clean := trim(rest);
    amount_num := NULL;
    unit_text := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  -- Last part is "150 г" or "1 шт."
  rest := trim(parts[array_length(parts, 1)]);
  n := trim(array_to_string(parts[1:array_length(parts, 1) - 1], ' — '));
  -- Extract number (including 0.5, 1,5) and unit
  IF rest ~ '^(\d+(?:[.,]\d+)?)\s*(.*)$' THEN
    num_part := (regexp_match(rest, '^(\d+(?:[.,]\d+)?)\s*(.*)$'))[1];
    u := trim((regexp_match(rest, '^(\d+(?:[.,]\d+)?)\s*(.*)$'))[2]);
    num_part := replace(num_part, ',', '.');
    am := num_part::numeric;
    name_clean := n;
    amount_num := am;
    unit_text := NULLIF(u, '');
    RETURN NEXT;
    RETURN;
  END IF;
  name_clean := trim(display_text);
  amount_num := NULL;
  unit_text := NULL;
  RETURN NEXT;
END;
$$;

-- 3) Helper: normalize unit to canonical (g, kg, ml, l, pcs, tsp, tbsp)
CREATE OR REPLACE FUNCTION public.normalize_ingredient_unit(unit text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  u text;
BEGIN
  IF unit IS NULL OR trim(unit) = '' THEN RETURN NULL; END IF;
  u := lower(trim(unit));
  u := regexp_replace(u, '\.$', ''); -- trailing dot
  IF u IN ('г', 'гр', 'g', 'грамм') THEN RETURN 'g'; END IF;
  IF u IN ('кг', 'kg', 'килограмм') THEN RETURN 'kg'; END IF;
  IF u IN ('мл', 'ml', 'миллилитр') THEN RETURN 'ml'; END IF;
  IF u IN ('л', 'l', 'литр') THEN RETURN 'l'; END IF;
  IF u IN ('шт', 'шт.', 'pcs', 'штук') THEN RETURN 'pcs'; END IF;
  IF u IN ('ч.л', 'ч.л.', 'чайная ложка', 'tsp', 'чл') THEN RETURN 'tsp'; END IF;
  IF u IN ('ст.л', 'ст.л.', 'столовая ложка', 'tbsp', 'стл') THEN RETURN 'tbsp'; END IF;
  RETURN u;
END;
$$;

-- 4) Helper: compute canonical_amount and canonical_unit (convert kg->g, l->ml)
CREATE OR REPLACE FUNCTION public.ingredient_canonical(amount_num numeric, unit_text text)
RETURNS TABLE(canonical_amount numeric, canonical_unit text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  norm text;
BEGIN
  IF amount_num IS NULL THEN
    canonical_amount := NULL;
    canonical_unit := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  norm := public.normalize_ingredient_unit(unit_text);
  IF norm = 'kg' THEN
    canonical_amount := amount_num * 1000;
    canonical_unit := 'g';
    RETURN NEXT;
    RETURN;
  END IF;
  IF norm = 'l' THEN
    canonical_amount := amount_num * 1000;
    canonical_unit := 'ml';
    RETURN NEXT;
    RETURN;
  END IF;
  IF norm IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
    canonical_amount := amount_num;
    canonical_unit := norm;
    RETURN NEXT;
    RETURN;
  END IF;
  -- unknown unit: do not set canonical (stored amount/unit remain)
  canonical_amount := NULL;
  canonical_unit := NULL;
  RETURN NEXT;
END;
$$;

-- 5) create_recipe_with_steps: normalize each ingredient (parse display_text, fill amount/unit/canonical)
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
    -- Support ingredient as string (use as display_text) or as object
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

    -- If amount/unit missing but display_text present, parse
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

    -- Canonical: use payload if present and unit allowed, else compute from amount/unit
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
      COALESCE(ing_category::public.product_category, 'other'::public.product_category)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS 'Creates recipe + steps + ingredients. Parses display_text when amount/unit null; normalizes canonical_unit (g,kg,ml,l,pcs,tsp,tbsp).';
