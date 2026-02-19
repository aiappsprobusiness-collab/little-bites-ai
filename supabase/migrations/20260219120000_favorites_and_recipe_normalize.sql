-- Favorites: get_recipe_previews is_favorite from favorites_v2 only; deprecate recipes.is_favorite.
-- Recipe normalization: get_recipe_full RPC, cooking_time_minutes only, generation_context, member_id/child_id.

-- ========== 1. get_recipe_previews: is_favorite from favorites_v2 (single source of truth) ==========
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
    AND r.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_recipe_previews(uuid[]) IS 'Preview for recipe cards. is_favorite is computed from favorites_v2 for auth.uid(); do not use recipes.is_favorite.';

-- ========== 2. Deprecate recipes.is_favorite (leave column; do not use as source of truth) ==========
COMMENT ON COLUMN public.recipes.is_favorite IS 'DEPRECATED: Favorites are per-user in favorites_v2. Use get_recipe_previews or get_recipe_full for is_favorite.';

-- ========== 3. get_recipe_full(recipe_id): one call for detail + steps + is_favorite ==========
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
    AND r.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_recipe_full(uuid) IS 'Full recipe for detail screen: recipe row + steps as json + is_favorite from favorites_v2.';

-- ========== 4. generation_context jsonb + allergens (optional) ==========
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'generation_context'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN generation_context jsonb;
    COMMENT ON COLUMN public.recipes.generation_context IS 'Optional: member_id, active_allergies, excluded_ingredients, model, prompt_version at generation time.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'allergens'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN allergens text[] DEFAULT '{}';
    COMMENT ON COLUMN public.recipes.allergens IS 'Allergens contained in recipe (from ingredients/tags). Family allergies are in members; this is recipe fact.';
  END IF;
END $$;

-- ========== 5. create_recipe_with_steps: stop writing cooking_time; only cooking_time_minutes ==========
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
    INSERT INTO public.recipe_ingredients (
      recipe_id, name, amount, unit, substitute, display_text, canonical_amount, canonical_unit, order_index, category
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

COMMENT ON FUNCTION public.create_recipe_with_steps(jsonb) IS 'Creates recipe + recipe_steps + recipe_ingredients. Uses cooking_time_minutes only (cooking_time deprecated). member_id preferred; child_id kept for legacy.';

-- ========== 6. Legacy: sync child_id from member_id when member_id set and child_id null (optional trigger) ==========
CREATE OR REPLACE FUNCTION public.recipes_sync_child_id_from_member_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.member_id IS NOT NULL AND NEW.child_id IS NULL THEN
    NEW.child_id := NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_sync_child_id_trigger ON public.recipes;
CREATE TRIGGER recipes_sync_child_id_trigger
  BEFORE INSERT OR UPDATE OF member_id ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_sync_child_id_from_member_id();
