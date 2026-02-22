-- User custom recipes ("Мои рецепты"): owner_user_id, visibility, source='user_custom'.
-- RLS: public recipes for all; private only for owner. Exclude user_custom from pool.
-- RPC: create_user_recipe, update_user_recipe, delete_user_recipe.

-- ========== 1. recipes: add source value 'user_custom', owner_user_id, visibility ==========
DO $$
DECLARE
  c name;
BEGIN
  -- Drop existing source check if any
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.recipes'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%source%' OR conname LIKE '%source%')
  LOOP
    EXECUTE 'ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS ' || quote_ident(c);
  END LOOP;
  -- Add extended check including user_custom
  ALTER TABLE public.recipes ADD CONSTRAINT recipes_source_check
    CHECK (source IN ('week_ai', 'chat_ai', 'starter', 'seed', 'manual', 'user_custom'));
END $$;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

COMMENT ON COLUMN public.recipes.owner_user_id IS 'Owner of user_custom recipe; NULL for non–user_custom.';
COMMENT ON COLUMN public.recipes.visibility IS 'public: visible to all; private: only owner_user_id.';

-- ========== 2. recipe_ingredients: ensure FK CASCADE (already in ensure_recipes_tables) ==========
-- No change if already ON DELETE CASCADE. Verify:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'recipe_ingredients'
      AND tc.constraint_type = 'FOREIGN KEY' AND rc.delete_rule = 'CASCADE'
  ) THEN
    NULL; -- already CASCADE
  ELSE
    -- If FK exists without CASCADE, we would alter; recipe_ingredients_recipe_id_fkey is from ensure_recipes ON DELETE CASCADE
    NULL;
  END IF;
END $$;

-- ========== 3. RLS recipes: SELECT = public OR (private AND owner) ==========
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own recipes" ON public.recipes;
CREATE POLICY "recipes_select_public_or_owned"
  ON public.recipes FOR SELECT
  USING (
    visibility = 'public'
    OR (visibility = 'private' AND owner_user_id = auth.uid())
    OR (user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own recipes" ON public.recipes;
CREATE POLICY "recipes_insert_own"
  ON public.recipes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (source <> 'user_custom')
      OR (source = 'user_custom' AND owner_user_id = auth.uid() AND visibility = 'private')
    )
  );

DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
CREATE POLICY "recipes_update_own"
  ON public.recipes FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (source = 'user_custom' AND visibility = 'private' AND owner_user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (source = 'user_custom' AND visibility = 'private' AND owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;
CREATE POLICY "recipes_delete_own"
  ON public.recipes FOR DELETE
  USING (
    user_id = auth.uid()
    OR (source = 'user_custom' AND visibility = 'private' AND owner_user_id = auth.uid())
  );

-- ========== 4. RLS recipe_ingredients: access via parent recipe ==========
DROP POLICY IF EXISTS "Users can view ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_select_via_recipe"
  ON public.recipe_ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.visibility = 'public' OR r.user_id = auth.uid() OR (r.visibility = 'private' AND r.owner_user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can insert ingredients to their recipes" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_insert_own_recipe"
  ON public.recipe_ingredients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.user_id = auth.uid() OR (r.source = 'user_custom' AND r.visibility = 'private' AND r.owner_user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_update_own_recipe"
  ON public.recipe_ingredients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.user_id = auth.uid() OR (r.source = 'user_custom' AND r.visibility = 'private' AND r.owner_user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can delete ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_delete_own_recipe"
  ON public.recipe_ingredients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.user_id = auth.uid() OR (r.source = 'user_custom' AND r.visibility = 'private' AND r.owner_user_id = auth.uid()))
    )
  );

-- ========== 5. get_recipe_previews: allow owner_user_id for user_custom ==========
DROP FUNCTION IF EXISTS public.get_recipe_previews(uuid[]);
CREATE FUNCTION public.get_recipe_previews(recipe_ids uuid[])
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  cooking_time_minutes integer,
  min_age_months integer,
  max_age_months integer,
  ingredient_names text[],
  ingredient_total_count bigint,
  is_favorite boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.title,
    r.description,
    r.cooking_time_minutes,
    r.min_age_months,
    r.max_age_months,
    COALESCE(
      (SELECT array_agg(sub.name) FROM (
        SELECT ri.name FROM recipe_ingredients ri
        WHERE ri.recipe_id = r.id
        ORDER BY ri.order_index, ri.id
        LIMIT 4
      ) sub),
      '{}'::text[]
    ) AS ingredient_names,
    (SELECT count(*)::bigint FROM recipe_ingredients WHERE recipe_id = r.id) AS ingredient_total_count,
    EXISTS (
      SELECT 1 FROM public.favorites_v2 f
      WHERE f.user_id = auth.uid() AND f.recipe_id = r.id
    ) AS is_favorite
  FROM recipes r
  WHERE r.id = ANY(recipe_ids)
    AND (r.user_id = auth.uid() OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom'));
$$;

COMMENT ON FUNCTION public.get_recipe_previews(uuid[]) IS 'Preview for recipe cards. Access: user_id or owner_user_id for user_custom. is_favorite from favorites_v2.';

-- ========== 6. get_recipe_full: allow owner_user_id for user_custom ==========
CREATE OR REPLACE FUNCTION public.get_recipe_full(p_recipe_id uuid)
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
  chef_advice text,
  advice text,
  created_at timestamptz,
  updated_at timestamptz,
  steps_json jsonb,
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
    r.title,
    r.description,
    r.image_url,
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
    r.chef_advice,
    r.advice,
    r.created_at,
    r.updated_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('step_number', rs.step_number, 'instruction', rs.instruction) ORDER BY rs.step_number)
       FROM recipe_steps rs WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    ) AS steps_json,
    EXISTS (SELECT 1 FROM public.favorites_v2 f WHERE f.user_id = auth.uid() AND f.recipe_id = r.id) AS is_favorite
  FROM recipes r
  WHERE r.id = p_recipe_id
    AND (r.user_id = auth.uid() OR (r.owner_user_id = auth.uid() AND r.source = 'user_custom'));
$$;

-- ========== 7. Indexes ==========
CREATE INDEX IF NOT EXISTS idx_recipes_owner_source_visibility_created
  ON public.recipes (owner_user_id, source, visibility, created_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id_order
  ON public.recipe_ingredients (recipe_id, order_index);

-- ========== 8. Validation trigger: do not require description/advice for user_custom ==========
-- recipes_validate_not_empty already applies only to source IN ('chat_ai','week_ai','manual'), so user_custom is skipped. No change.

-- ========== 9. RPC: create_user_recipe ==========
CREATE OR REPLACE FUNCTION public.create_user_recipe(
  p_title text,
  p_description text,
  p_meal_type text,
  p_tags text[],
  p_chef_advice text,
  p_steps jsonb,
  p_ingredients jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_recipe_id uuid;
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
  IF p_chef_advice IS NULL OR btrim(p_chef_advice) = '' THEN
    RAISE EXCEPTION 'chef_advice_required';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) < 1 THEN
    RAISE EXCEPTION 'steps_required';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) < 1 THEN
    RAISE EXCEPTION 'ingredients_required';
  END IF;

  INSERT INTO public.recipes (
    user_id,
    child_id,
    member_id,
    title,
    description,
    source,
    meal_type,
    tags,
    chef_advice,
    advice,
    owner_user_id,
    visibility
  ) VALUES (
    v_uid,
    NULL,
    NULL,
    btrim(p_title),
    NULLIF(btrim(p_description), ''),
    'user_custom',
    NULLIF(btrim(p_meal_type), ''),
    COALESCE(p_tags, '{}'),
    btrim(p_chef_advice),
    NULL,
    v_uid,
    'private'
  )
  RETURNING id INTO v_recipe_id;

  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (
      v_recipe_id,
      COALESCE((ing->>'step_number')::integer, idx),
      COALESCE(btrim(ing->>'instruction'), '')
    );
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

    IF ing_canonical_amount IS NOT NULL AND ing_canonical_unit IS NOT NULL AND trim(ing_canonical_unit) <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing_canonical_unit);
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := ing_canonical_amount;
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

    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(final_name);
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category
    ) VALUES (
      v_recipe_id,
      final_name,
      final_amount,
      final_unit,
      final_display_text,
      final_canonical_amount,
      final_canonical_unit,
      ing_order,
      final_category
    );
  END LOOP;

  RETURN v_recipe_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_recipe(text, text, text, text[], text, jsonb, jsonb) IS 'Creates private user_custom recipe + steps + ingredients. Same ingredient normalization as create_recipe_with_steps.';

-- ========== 10. RPC: update_user_recipe ==========
CREATE OR REPLACE FUNCTION public.update_user_recipe(
  p_recipe_id uuid,
  p_title text,
  p_description text,
  p_meal_type text,
  p_tags text[],
  p_chef_advice text,
  p_steps jsonb,
  p_ingredients jsonb
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

  SELECT r.owner_user_id, r.source INTO v_owner, v_source
  FROM public.recipes r
  WHERE r.id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipe_not_found';
  END IF;
  IF v_source <> 'user_custom' OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF p_chef_advice IS NULL OR btrim(p_chef_advice) = '' THEN
    RAISE EXCEPTION 'chef_advice_required';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) < 1 THEN
    RAISE EXCEPTION 'steps_required';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) < 1 THEN
    RAISE EXCEPTION 'ingredients_required';
  END IF;

  UPDATE public.recipes
  SET
    title = btrim(p_title),
    description = NULLIF(btrim(p_description), ''),
    meal_type = NULLIF(btrim(p_meal_type), ''),
    tags = COALESCE(p_tags, '{}'),
    chef_advice = btrim(p_chef_advice),
    updated_at = now()
  WHERE id = p_recipe_id;

  DELETE FROM public.recipe_steps WHERE recipe_id = p_recipe_id;
  idx := 0;
  FOR ing IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    idx := idx + 1;
    INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
    VALUES (
      p_recipe_id,
      COALESCE((ing->>'step_number')::integer, idx),
      COALESCE(btrim(ing->>'instruction'), '')
    );
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

    IF ing_canonical_amount IS NOT NULL AND ing_canonical_unit IS NOT NULL AND trim(ing_canonical_unit) <> '' THEN
      final_canonical_unit := public.normalize_ingredient_unit(ing_canonical_unit);
      IF final_canonical_unit IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
        final_canonical_amount := ing_canonical_amount;
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

    IF ing_category IS NULL OR trim(ing_category) = '' OR lower(trim(ing_category)) = 'other' THEN
      final_category := public.infer_ingredient_category(final_name);
    ELSE
      final_category := COALESCE(ing_category::public.product_category, 'other'::public.product_category);
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, display_text, canonical_amount, canonical_unit, order_index, category
    ) VALUES (
      p_recipe_id,
      final_name,
      final_amount,
      final_unit,
      final_display_text,
      final_canonical_amount,
      final_canonical_unit,
      ing_order,
      final_category
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_user_recipe(uuid, text, text, text, text[], text, jsonb, jsonb) IS 'Updates user_custom recipe and replaces steps/ingredients. Owner only.';

-- ========== 11. RPC: delete_user_recipe ==========
CREATE OR REPLACE FUNCTION public.delete_user_recipe(p_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_source text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT r.owner_user_id, r.source INTO v_owner, v_source
  FROM public.recipes r
  WHERE r.id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipe_not_found';
  END IF;
  IF v_source <> 'user_custom' OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  DELETE FROM public.recipe_ingredients WHERE recipe_id = p_recipe_id;
  DELETE FROM public.recipe_steps WHERE recipe_id = p_recipe_id;
  DELETE FROM public.recipes WHERE id = p_recipe_id;
END;
$$;

COMMENT ON FUNCTION public.delete_user_recipe(uuid) IS 'Deletes user_custom recipe and related steps/ingredients. Owner only.';
