-- Dual measurement UX layer on recipe_ingredients: display_amount/unit/quantity_text + measurement_mode.
-- Canonical g/ml remains source of truth for scaling and shopping math.

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS display_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS display_unit text NULL,
  ADD COLUMN IF NOT EXISTS display_quantity_text text NULL,
  ADD COLUMN IF NOT EXISTS measurement_mode text NOT NULL DEFAULT 'canonical_only';

ALTER TABLE public.recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_measurement_mode_check;
ALTER TABLE public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_measurement_mode_check CHECK (
  measurement_mode IN ('canonical_only', 'dual', 'display_only')
);

COMMENT ON COLUMN public.recipe_ingredients.display_amount IS 'UX household amount (e.g. 2 cloves, 0.5 pcs); scaling with servings multiplies this together with canonical_amount.';
COMMENT ON COLUMN public.recipe_ingredients.display_unit IS 'UX household unit: шт., зубчик, ст. л., ч. л., etc.';
COMMENT ON COLUMN public.recipe_ingredients.display_quantity_text IS 'Irregular UX fragment, e.g. «1 небольшой кочан»; optional.';
COMMENT ON COLUMN public.recipe_ingredients.measurement_mode IS 'canonical_only | dual | display_only (reserved). Portions math uses canonical_* only.';

-- ========== create_recipe_with_steps: persist optional display layer from payload ==========
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
  v_nutrition_goals jsonb;
  v_cuisine text;
  v_region text;
  v_familiarity text;
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
  dis_amt_t text;
  final_display_amount numeric;
  final_display_unit text;
  final_display_quantity_text text;
  final_measurement_mode text;
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

  v_locale := NULLIF(trim(COALESCE(payload->>'locale', '')), '');
  IF v_locale IS NULL THEN v_locale := 'ru'; END IF;

  v_source_lang := NULLIF(trim(COALESCE(payload->>'source_lang', '')), '');

  v_trust_level := NULLIF(trim(COALESCE(payload->>'trust_level', '')), '');
  IF v_trust_level IS NULL OR v_trust_level NOT IN ('seed', 'starter', 'trusted', 'candidate', 'blocked', 'core') THEN
    v_trust_level := CASE
      WHEN v_source = 'seed' THEN 'core'
      WHEN v_source = 'starter' THEN 'starter'
      WHEN v_source = 'manual' THEN 'trusted'
      WHEN v_source IN ('chat_ai', 'week_ai') THEN 'candidate'
      ELSE 'candidate'
    END;
  END IF;

  v_nutrition_goals := COALESCE(payload->'nutrition_goals', '[]'::jsonb);
  IF jsonb_typeof(v_nutrition_goals) <> 'array' THEN
    v_nutrition_goals := '[]'::jsonb;
  END IF;

  v_cuisine := NULLIF(trim(COALESCE(payload->>'cuisine', '')), '');
  v_region := NULLIF(trim(COALESCE(payload->>'region', '')), '');
  v_familiarity := NULLIF(trim(COALESCE(payload->>'familiarity', '')), '');

  IF v_familiarity IS NOT NULL AND v_familiarity NOT IN ('classic', 'adapted', 'specific') THEN
    RAISE EXCEPTION 'invalid_familiarity';
  END IF;

  IF v_familiarity IS NULL THEN
    v_familiarity := public.infer_cultural_familiarity(v_cuisine);
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
    trust_level,
    nutrition_goals,
    cuisine,
    region,
    familiarity
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
    v_trust_level,
    v_nutrition_goals,
    v_cuisine,
    v_region,
    v_familiarity
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
    final_display_amount := NULL;
    final_display_unit := NULL;
    final_display_quantity_text := NULL;
    final_measurement_mode := 'canonical_only';

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

      dis_amt_t := btrim(ing->>'display_amount');
      IF dis_amt_t IS NOT NULL AND dis_amt_t <> '' AND dis_amt_t ~ '^-?\d+\.?\d*$' THEN
        final_display_amount := dis_amt_t::numeric;
      END IF;
      final_display_unit := NULLIF(trim(COALESCE(ing->>'display_unit', '')), '');
      final_display_quantity_text := NULLIF(trim(COALESCE(ing->>'display_quantity_text', '')), '');
      final_measurement_mode := NULLIF(lower(trim(COALESCE(ing->>'measurement_mode', ''))), '');
      IF final_measurement_mode IS NULL OR final_measurement_mode NOT IN ('canonical_only', 'dual', 'display_only') THEN
        final_measurement_mode := 'canonical_only';
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
      final_category := public.infer_ingredient_category(btrim(COALESCE(final_name, '') || ' ' || COALESCE(final_display_text, '')));
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    IF final_measurement_mode = 'dual' AND final_display_quantity_text IS NULL
       AND (final_display_amount IS NULL OR final_display_unit IS NULL OR btrim(final_display_unit) = '') THEN
      final_measurement_mode := 'canonical_only';
      final_display_amount := NULL;
      final_display_unit := NULL;
    END IF;

    is_bad := (final_display_text IS NULL OR length(btrim(COALESCE(final_display_text, ''))) < 3)
      OR (final_name IS NULL OR btrim(final_name) = '')
      OR (final_amount IS NULL AND (final_canonical_amount IS NULL OR final_canonical_amount <= 0))
      OR ((final_unit IS NULL OR btrim(COALESCE(final_unit, '')) = '') AND (final_canonical_unit IS NULL OR btrim(COALESCE(final_canonical_unit, '')) = ''));
    IF is_bad THEN bad_count := bad_count + 1; END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, substitute, display_text, canonical_amount, canonical_unit, order_index, category,
      display_amount, display_unit, display_quantity_text, measurement_mode
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
      final_category,
      final_display_amount,
      final_display_unit,
      final_display_quantity_text,
      final_measurement_mode
    );
  END LOOP;

  IF bad_count > 0 THEN
    RAISE WARNING 'create_recipe_with_steps: bad_ingredients recipe_title=% recipe_id=% total=% bad=%',
      COALESCE(payload->>'title', ''), v_id, total_count, bad_count;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS
  'Creates recipe + steps + ingredients. Optional per-ingredient: display_amount, display_unit, display_quantity_text, measurement_mode (canonical_only|dual|display_only). Dual without quantity text requires amount+unit.';

-- ========== get_recipe_full: expose category + measurement fields in ingredients_json ==========
DROP FUNCTION IF EXISTS public.get_recipe_full(uuid, text);

CREATE FUNCTION public.get_recipe_full(p_recipe_id uuid, p_locale text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  child_id uuid,
  member_id uuid,
  title text,
  description text,
  image_url text,
  cooking_time_minutes integer,
  min_age_months integer,
  max_age_months integer,
  calories integer,
  proteins numeric,
  fats numeric,
  carbs numeric,
  tags text[],
  source_products text[],
  source text,
  meal_type text,
  nutrition_goals jsonb,
  chef_advice text,
  advice text,
  created_at timestamptz,
  updated_at timestamptz,
  steps_json jsonb,
  ingredients_json jsonb,
  is_favorite boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.user_id,
    r.child_id,
    r.member_id,
    COALESCE(NULLIF(trim(rt.title), ''), r.title) AS title,
    COALESCE(NULLIF(trim(rt.description), ''), r.description) AS description,
    NULL::text AS image_url,
    r.cooking_time_minutes,
    r.min_age_months,
    r.max_age_months,
    r.calories,
    r.proteins,
    r.fats,
    r.carbs,
    r.tags,
    r.source_products,
    r.source,
    r.meal_type,
    COALESCE(r.nutrition_goals, '[]'::jsonb) AS nutrition_goals,
    COALESCE(NULLIF(trim(rt.chef_advice), ''), r.chef_advice) AS chef_advice,
    r.advice,
    r.created_at,
    r.updated_at,
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', rs.id,
           'step_number', rs.step_number,
           'instruction', COALESCE(NULLIF(trim(rst.instruction), ''), rs.instruction)
         ) ORDER BY rs.step_number
       )
       FROM recipe_steps rs
       LEFT JOIN recipe_step_translations rst ON rst.recipe_step_id = rs.id AND rst.locale = p_locale
       WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    ) AS steps_json,
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'name', COALESCE(NULLIF(trim(rit.name), ''), ri.name),
           'display_text', COALESCE(NULLIF(trim(rit.display_text), ''), ri.display_text),
           'amount', ri.amount,
           'unit', ri.unit,
           'substitute', ri.substitute,
           'canonical_amount', ri.canonical_amount,
           'canonical_unit', ri.canonical_unit,
           'order_index', ri.order_index,
           'category', ri.category,
           'display_amount', ri.display_amount,
           'display_unit', ri.display_unit,
           'display_quantity_text', ri.display_quantity_text,
           'measurement_mode', ri.measurement_mode
         ) ORDER BY ri.order_index NULLS LAST, ri.name
       )
       FROM recipe_ingredients ri
       LEFT JOIN recipe_ingredient_translations rit ON rit.recipe_ingredient_id = ri.id AND rit.locale = p_locale
       WHERE ri.recipe_id = r.id),
      '[]'::jsonb
    ) AS ingredients_json,
    EXISTS (SELECT 1 FROM public.favorites_v2 f WHERE f.user_id = auth.uid() AND f.recipe_id = r.id) AS is_favorite
  FROM recipes r
  LEFT JOIN recipe_translations rt
    ON rt.recipe_id = r.id AND rt.locale = p_locale AND p_locale IS NOT NULL
  WHERE r.id = p_recipe_id
    AND (
      r.user_id = auth.uid()
      OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom')
      OR (auth.uid() IS NOT NULL AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai'))
    );
$$;

COMMENT ON FUNCTION public.get_recipe_full(uuid, text) IS
  'Full recipe for detail screen. ingredients_json includes category, display_amount, display_unit, display_quantity_text, measurement_mode. Pool access aligned with get_recipe_previews.';

-- ========== get_recipe_by_share_ref ==========
CREATE OR REPLACE FUNCTION public.get_recipe_by_share_ref(p_share_ref text, p_locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
  v_result jsonb;
BEGIN
  IF p_share_ref IS NULL OR trim(p_share_ref) = '' THEN
    RETURN NULL;
  END IF;

  SELECT recipe_id INTO v_recipe_id
  FROM public.share_refs
  WHERE share_ref = trim(p_share_ref)
  LIMIT 1;

  IF v_recipe_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'recipe', CASE
      WHEN p_locale IS NULL OR trim(p_locale) = '' THEN to_jsonb(r)
      ELSE to_jsonb(r) || jsonb_build_object(
        'title', COALESCE(NULLIF(trim(rt.title), ''), r.title),
        'description', COALESCE(NULLIF(trim(rt.description), ''), r.description),
        'chef_advice', COALESCE(NULLIF(trim(rt.chef_advice), ''), r.chef_advice)
      )
    END,
    'ingredients', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', ri.id,
           'name', COALESCE(NULLIF(trim(rit.name), ''), ri.name),
           'display_text', COALESCE(NULLIF(trim(rit.display_text), ''), ri.display_text),
           'amount', ri.amount,
           'unit', ri.unit,
           'order_index', ri.order_index,
           'category', ri.category,
           'canonical_amount', ri.canonical_amount,
           'canonical_unit', ri.canonical_unit,
           'substitute', ri.substitute,
           'display_amount', ri.display_amount,
           'display_unit', ri.display_unit,
           'display_quantity_text', ri.display_quantity_text,
           'measurement_mode', ri.measurement_mode
         ) ORDER BY ri.order_index NULLS LAST, ri.name
       )
       FROM public.recipe_ingredients ri
       LEFT JOIN public.recipe_ingredient_translations rit ON rit.recipe_ingredient_id = ri.id AND rit.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
       WHERE ri.recipe_id = r.id),
      '[]'::jsonb
    ),
    'steps', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', rs.id,
           'step_number', rs.step_number,
           'instruction', COALESCE(NULLIF(trim(rst.instruction), ''), rs.instruction),
           'duration_minutes', rs.duration_minutes,
           'image_url', rs.image_url
         ) ORDER BY rs.step_number
       )
       FROM public.recipe_steps rs
       LEFT JOIN public.recipe_step_translations rst ON rst.recipe_step_id = rs.id AND rst.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
       WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM public.recipes r
  LEFT JOIN public.recipe_translations rt ON rt.recipe_id = r.id AND rt.locale = trim(p_locale) AND p_locale IS NOT NULL AND trim(p_locale) <> ''
  WHERE r.id = v_recipe_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_recipe_by_share_ref(text, text) IS
  'Public share link recipe. ingredients include measurement_mode and display_* fields.';

-- ========== user_custom recipes ==========
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
  dis_amt_t text;
  final_display_amount numeric;
  final_display_unit text;
  final_display_quantity_text text;
  final_measurement_mode text;
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
  IF v_meal_type_norm IS NOT NULL AND v_meal_type_norm NOT IN ('breakfast', 'lunch', 'dinner', 'snack') THEN
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
    'user_custom', v_meal_type_norm, v_tags,
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
    final_display_amount := NULL;
    final_display_unit := NULL;
    final_display_quantity_text := NULL;
    final_measurement_mode := 'canonical_only';

    ing_name := NULLIF(trim(COALESCE(ing->>'name', '')), '');
    ing_amount := (ing->>'amount')::numeric;
    ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
    ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
    ing_canonical_amount := (ing->>'canonical_amount')::numeric;
    ing_canonical_unit := NULLIF(trim(ing->>'canonical_unit'), '');
    ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
    ing_order := COALESCE((ing->>'order_index')::integer, idx - 1);

    dis_amt_t := btrim(ing->>'display_amount');
    IF dis_amt_t IS NOT NULL AND dis_amt_t <> '' AND dis_amt_t ~ '^-?\d+\.?\d*$' THEN
      final_display_amount := dis_amt_t::numeric;
    END IF;
    final_display_unit := NULLIF(trim(COALESCE(ing->>'display_unit', '')), '');
    final_display_quantity_text := NULLIF(trim(COALESCE(ing->>'display_quantity_text', '')), '');
    final_measurement_mode := NULLIF(lower(trim(COALESCE(ing->>'measurement_mode', ''))), '');
    IF final_measurement_mode IS NULL OR final_measurement_mode NOT IN ('canonical_only', 'dual', 'display_only') THEN
      final_measurement_mode := 'canonical_only';
    END IF;

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

    IF final_measurement_mode = 'dual' AND final_display_quantity_text IS NULL
       AND (final_display_amount IS NULL OR final_display_unit IS NULL OR btrim(final_display_unit) = '') THEN
      final_measurement_mode := 'canonical_only';
      final_display_amount := NULL;
      final_display_unit := NULL;
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category,
      display_amount, display_unit, display_quantity_text, measurement_mode
    ) VALUES (
      v_recipe_id, final_name, final_amount, final_unit, final_display_text, final_canonical_amount, final_canonical_unit, ing_order, final_category,
      final_display_amount, final_display_unit, final_display_quantity_text, final_measurement_mode
    );
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
  dis_amt_t text;
  final_display_amount numeric;
  final_display_unit text;
  final_display_quantity_text text;
  final_measurement_mode text;
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
  IF v_meal_type_norm IS NOT NULL AND v_meal_type_norm NOT IN ('breakfast', 'lunch', 'dinner', 'snack') THEN v_meal_type_norm := NULL; END IF;
  v_tags_final := array_remove(ARRAY['user_custom', CASE WHEN v_meal_type_norm IS NOT NULL THEN 'user_custom_' || v_meal_type_norm END], NULL);
  IF p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR array_length(p_tags, 1) = 0 THEN v_tags := v_tags_final; ELSE v_tags := p_tags; END IF;

  UPDATE public.recipes
  SET title = btrim(p_title), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      meal_type = v_meal_type_norm, tags = v_tags,
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
    final_display_amount := NULL;
    final_display_unit := NULL;
    final_display_quantity_text := NULL;
    final_measurement_mode := 'canonical_only';

    ing_name := NULLIF(trim(COALESCE(ing->>'name', '')), '');
    ing_amount := (ing->>'amount')::numeric;
    ing_unit := NULLIF(trim(COALESCE(ing->>'unit', '')), '');
    ing_display_text := NULLIF(trim(COALESCE(ing->>'display_text', '')), '');
    ing_canonical_amount := (ing->>'canonical_amount')::numeric;
    ing_canonical_unit := NULLIF(trim(ing->>'canonical_unit'), '');
    ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other');
    ing_order := COALESCE((ing->>'order_index')::integer, idx - 1);

    dis_amt_t := btrim(ing->>'display_amount');
    IF dis_amt_t IS NOT NULL AND dis_amt_t <> '' AND dis_amt_t ~ '^-?\d+\.?\d*$' THEN
      final_display_amount := dis_amt_t::numeric;
    END IF;
    final_display_unit := NULLIF(trim(COALESCE(ing->>'display_unit', '')), '');
    final_display_quantity_text := NULLIF(trim(COALESCE(ing->>'display_quantity_text', '')), '');
    final_measurement_mode := NULLIF(lower(trim(COALESCE(ing->>'measurement_mode', ''))), '');
    IF final_measurement_mode IS NULL OR final_measurement_mode NOT IN ('canonical_only', 'dual', 'display_only') THEN
      final_measurement_mode := 'canonical_only';
    END IF;

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

    IF final_measurement_mode = 'dual' AND final_display_quantity_text IS NULL
       AND (final_display_amount IS NULL OR final_display_unit IS NULL OR btrim(final_display_unit) = '') THEN
      final_measurement_mode := 'canonical_only';
      final_display_amount := NULL;
      final_display_unit := NULL;
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category,
      display_amount, display_unit, display_quantity_text, measurement_mode
    ) VALUES (
      p_recipe_id, final_name, final_amount, final_unit, final_display_text, final_canonical_amount, final_canonical_unit, ing_order, final_category,
      final_display_amount, final_display_unit, final_display_quantity_text, final_measurement_mode
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.create_user_recipe(text, text, text, text[], text, jsonb, jsonb) IS
  'Creates private user_custom recipe. Ingredients may include display_amount, display_unit, display_quantity_text, measurement_mode.';

COMMENT ON FUNCTION public.update_user_recipe(uuid, text, text, text, text[], text, jsonb, jsonb) IS
  'Updates user_custom recipe; same optional ingredient measurement fields as create_user_recipe.';
