-- Stage 1: locale, source_lang, trust_level для мультиязычности и пула.
-- Не меняем UI, не вводим recipe_translations. Только foundation.

-- 1) Колонки в recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS source_lang text,
  ADD COLUMN IF NOT EXISTS trust_level text;

COMMENT ON COLUMN public.recipes.locale IS 'Язык контента строки (ru, en, es). По умолчанию ru.';
COMMENT ON COLUMN public.recipes.source_lang IS 'Язык, на котором сгенерирован контент (для AI/manual).';
COMMENT ON COLUMN public.recipes.trust_level IS 'Уровень доверия пула: seed, starter, trusted, candidate, blocked.';

-- 2) CHECK для trust_level
ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_trust_level_check;
ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_trust_level_check CHECK (
    trust_level IS NULL OR trust_level IN ('seed', 'starter', 'trusted', 'candidate', 'blocked')
  );

-- 3) Backfill trust_level по source (существующие данные)
UPDATE public.recipes
SET trust_level = CASE
  WHEN source IN ('seed', 'starter') THEN source
  WHEN source = 'manual' THEN 'trusted'
  WHEN source IN ('chat_ai', 'week_ai') THEN 'candidate'
  WHEN source = 'user_custom' THEN 'trusted'
  ELSE 'candidate'
END
WHERE trust_level IS NULL;

-- 4) Backfill locale (на случай если были строки до DEFAULT)
UPDATE public.recipes
SET locale = 'ru'
WHERE locale IS NULL;

-- 5) create_recipe_with_steps: принимать опционально locale, source_lang, trust_level (с дефолтами)
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
  v_locale text;
  v_source_lang text;
  v_trust_level text;
  v_source text;
  s jsonb;
  ing jsonb;
  idx int;
  total_count int;
  bad_count int;
  is_bad boolean;
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
  amt_t text;
  ord_t text;
  can_amt_t text;
BEGIN
  IF payload IS NULL THEN RAISE EXCEPTION 'payload_required'; END IF;

  v_user_id := (payload->>'user_id')::uuid;
  IF v_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'user_id must match auth.uid()'; END IF;
  IF payload->>'source' IS NULL OR payload->>'source' = '' THEN RAISE EXCEPTION 'source_required'; END IF;
  IF payload->>'source' NOT IN ('week_ai', 'chat_ai', 'starter', 'seed', 'manual') THEN RAISE EXCEPTION 'invalid_source'; END IF;

  v_source := payload->>'source';

  v_steps := payload->'steps';
  IF v_steps IS NULL OR jsonb_typeof(v_steps) <> 'array' THEN RAISE EXCEPTION 'steps_required'; END IF;
  v_ingredients := payload->'ingredients';
  IF v_ingredients IS NULL OR jsonb_typeof(v_ingredients) <> 'array' OR jsonb_array_length(v_ingredients) < 3 THEN
    RAISE EXCEPTION 'ingredients_required';
  END IF;

  -- locale: не передан → 'ru'
  v_locale := NULLIF(trim(COALESCE(payload->>'locale', '')), '');
  IF v_locale IS NULL THEN v_locale := 'ru'; END IF;

  -- source_lang: не передан → null (backward compatible)
  v_source_lang := NULLIF(trim(COALESCE(payload->>'source_lang', '')), '');

  -- trust_level: не передан → по source
  v_trust_level := NULLIF(trim(COALESCE(payload->>'trust_level', '')), '');
  IF v_trust_level IS NULL OR v_trust_level NOT IN ('seed', 'starter', 'trusted', 'candidate', 'blocked') THEN
    v_trust_level := CASE
      WHEN v_source IN ('seed', 'starter') THEN v_source
      WHEN v_source = 'manual' THEN 'trusted'
      WHEN v_source IN ('chat_ai', 'week_ai') THEN 'candidate'
      ELSE 'candidate'
    END;
  END IF;

  total_count := jsonb_array_length(v_ingredients);
  bad_count := 0;

  INSERT INTO public.recipes (
    user_id,
    child_id,
    member_id,
    title,
    description,
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
    generation_context,
    servings_base,
    servings_recommended,
    locale,
    source_lang,
    trust_level
  ) VALUES (
    v_user_id,
    COALESCE((payload->>'child_id')::uuid, (payload->>'member_id')::uuid),
    COALESCE((payload->>'member_id')::uuid, (payload->>'child_id')::uuid),
    COALESCE(payload->>'title', 'Рецепт'),
    NULLIF(payload->>'description', ''),
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
    CASE WHEN payload ? 'generation_context' THEN payload->'generation_context' ELSE NULL END,
    GREATEST(1, COALESCE((payload->>'servings_base')::integer, 1)),
    GREATEST(1, COALESCE((payload->>'servings_recommended')::integer, 1)),
    v_locale,
    v_source_lang,
    v_trust_level
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
      amt_t := btrim(ing->>'amount');
      IF amt_t IS NOT NULL AND amt_t <> '' AND amt_t ~ '^\d+\.?\d*$' THEN
        ing_amount := amt_t::numeric;
      ELSE
        ing_amount := NULL;
      END IF;
      ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
      ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
      ing_substitute := NULLIF(trim(COALESCE(ing->>'substitute', '')), '');
      ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
      ord_t := btrim(ing->>'order_index');
      IF ord_t IS NOT NULL AND ord_t <> '' AND ord_t ~ '^\d+$' THEN
        ing_order := ord_t::integer;
      ELSE
        ing_order := idx - 1;
      END IF;
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

    can_amt_t := btrim(ing->>'canonical_amount');
    IF can_amt_t IS NOT NULL AND can_amt_t <> '' AND can_amt_t ~ '^\d+\.?\d*$'
       AND ing->>'canonical_unit' IS NOT NULL AND trim(ing->>'canonical_unit') <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing->>'canonical_unit');
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := can_amt_t::numeric;
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

    IF btrim(COALESCE(final_unit, '')) = 'д' AND final_canonical_unit = 'g' THEN
      final_unit := 'г';
      final_display_text := replace(replace(final_display_text, ' д ', ' г '), ' д', ' г');
    END IF;

    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(final_name);
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    is_bad := (final_display_text IS NULL OR length(btrim(COALESCE(final_display_text, ''))) < 3)
      OR (final_name IS NULL OR btrim(final_name) = '')
      OR (final_amount IS NULL AND (final_canonical_amount IS NULL OR final_canonical_amount <= 0))
      OR ((final_unit IS NULL OR btrim(COALESCE(final_unit, '')) = '') AND (final_canonical_unit IS NULL OR btrim(COALESCE(final_canonical_unit, '')) = ''));
    IF is_bad THEN bad_count := bad_count + 1; END IF;

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

  IF bad_count > 0 THEN
    RAISE WARNING 'create_recipe_with_steps: bad_ingredients recipe_title=% recipe_id=% total=% bad=%',
      COALESCE(payload->>'title', ''), v_id, total_count, bad_count;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS 'Creates recipe + steps + ingredients. Stage 1: accepts optional locale (default ru), source_lang, trust_level (default by source). Safe numeric casts. Unit typo д->г.';
