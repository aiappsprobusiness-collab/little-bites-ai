-- Remove starter/seed recipes and related data. Safe: only deletes recipes whose id
-- matches the deterministic UUID v5 (userId:starterId) from the starter namespace.
-- Does not touch user-created recipes.

-- Ensure uuid-ossp for uuid_generate_v5
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Namespace used by client for starter recipe IDs (same as STARTER_RECIPE_NS in JS)
-- Starter ids: s1-r1..s32-r4 (32*4) + neutral-r1..neutral-r4
DO $$
DECLARE
  starter_ns uuid := '3d9f4d6a-3a6c-4e3b-9f5d-8c5f3b2a1d11';
  starter_ids text[] := ARRAY[
    's1-r1','s1-r2','s1-r3','s1-r4','s2-r1','s2-r2','s2-r3','s2-r4','s3-r1','s3-r2','s3-r3','s3-r4',
    's4-r1','s4-r2','s4-r3','s4-r4','s5-r1','s5-r2','s5-r3','s5-r4','s6-r1','s6-r2','s6-r3','s6-r4',
    's7-r1','s7-r2','s7-r3','s7-r4','s8-r1','s8-r2','s8-r3','s8-r4','s9-r1','s9-r2','s9-r3','s9-r4',
    's10-r1','s10-r2','s10-r3','s10-r4','s11-r1','s11-r2','s11-r3','s11-r4','s12-r1','s12-r2','s12-r3','s12-r4',
    's13-r1','s13-r2','s13-r3','s13-r4','s14-r1','s14-r2','s14-r3','s14-r4','s15-r1','s15-r2','s15-r3','s15-r4',
    's16-r1','s16-r2','s16-r3','s16-r4','s17-r1','s17-r2','s17-r3','s17-r4','s18-r1','s18-r2','s18-r3','s18-r4',
    's19-r1','s19-r2','s19-r3','s19-r4','s20-r1','s20-r2','s20-r3','s20-r4','s21-r1','s21-r2','s21-r3','s21-r4',
    's22-r1','s22-r2','s22-r3','s22-r4','s23-r1','s23-r2','s23-r3','s23-r4','s24-r1','s24-r2','s24-r3','s24-r4',
    's25-r1','s25-r2','s25-r3','s25-r4','s26-r1','s26-r2','s26-r3','s26-r4','s27-r1','s27-r2','s27-r3','s27-r4',
    's28-r1','s28-r2','s28-r3','s28-r4','s29-r1','s29-r2','s29-r3','s29-r4','s30-r1','s30-r2','s30-r3','s30-r4',
    's31-r1','s31-r2','s31-r3','s31-r4','s32-r1','s32-r2','s32-r3','s32-r4',
    'neutral-r1','neutral-r2','neutral-r3','neutral-r4'
  ];
  deleted_plans int;
  deleted_favs int;
  deleted_recipes int;
BEGIN
  -- 1) Clear meal_plans_v2 slots that reference starter recipe_ids (do not delete rows; only clear those slots)
  WITH to_delete AS (
    SELECT r.id
    FROM recipes r
    CROSS JOIN unnest(starter_ids) AS sid
    WHERE r.id = extensions.uuid_generate_v5(starter_ns, r.user_id::text || ':' || sid)
  )
  UPDATE meal_plans_v2 mp
  SET meals = COALESCE(
    (
      SELECT jsonb_object_agg(t.key, t.value)
      FROM jsonb_each(mp.meals) AS t(key, value)
      WHERE (t.value->>'recipe_id') IS NULL
         OR (t.value->>'recipe_id')::uuid NOT IN (SELECT id FROM to_delete)
    ),
    '{}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM jsonb_each(mp.meals) AS t(_, value)
    WHERE (value->>'recipe_id')::uuid IN (SELECT id FROM to_delete)
  );

  GET DIAGNOSTICS deleted_plans = ROW_COUNT;

  -- 2) Remove favorites_v2 rows that reference starter recipes
  WITH to_delete AS (
    SELECT r.id
    FROM recipes r
    CROSS JOIN unnest(starter_ids) AS sid
    WHERE r.id = extensions.uuid_generate_v5(starter_ns, r.user_id::text || ':' || sid)
  )
  DELETE FROM favorites_v2 WHERE recipe_id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS deleted_favs = ROW_COUNT;

  -- 3) Delete starter recipes (CASCADE removes recipe_ingredients, recipe_steps)
  WITH to_delete AS (
    SELECT r.id
    FROM recipes r
    CROSS JOIN unnest(starter_ids) AS sid
    WHERE r.id = extensions.uuid_generate_v5(starter_ns, r.user_id::text || ':' || sid)
  )
  DELETE FROM recipes WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS deleted_recipes = ROW_COUNT;

  RAISE NOTICE 'remove_starter_recipes: cleared % plan slot refs, deleted % favorites, deleted % recipes', deleted_plans, deleted_favs, deleted_recipes;
END;
$$;

-- Drop the RPC that seeded starter recipes (no longer used)
DROP FUNCTION IF EXISTS public.ensure_starter_recipes_seeded(jsonb);
