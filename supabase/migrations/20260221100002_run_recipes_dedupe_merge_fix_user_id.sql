-- Fix: build merge map using user_id from recipes (view may not expose user_id in older DB).

CREATE OR REPLACE FUNCTION public.run_recipes_dedupe_merge(p_dry_run boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  duplicates_total int;
  will_update_favorites int;
  will_update_plans int;
  will_delete_recipes int;
  updated_fav int := 0;
  fav_deleted int := 0;
  updated_plans int := 0;
  updated_chat int := 0;
  trashed int := 0;
  deleted int := 0;
  batch_ids uuid[];
  batch_size int := 500;
  plan_rec RECORD;
  broken_plan_links_count bigint;
  broken_favorites_links_count bigint;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _merge_map (loser_id uuid PRIMARY KEY, winner_id uuid, delete_reason text);
  TRUNCATE _merge_map;

  INSERT INTO _merge_map (loser_id, winner_id, delete_reason)
  SELECT DISTINCT ON (p1.recipe_id) p1.recipe_id AS loser_id, p2.recipe_id AS winner_id, p1.group_type AS delete_reason
  FROM public.recipes_dedupe_candidates_preview p1
  JOIN public.recipes r1 ON r1.id = p1.recipe_id
  JOIN public.recipes_dedupe_candidates_preview p2 ON p2.group_type = p1.group_type AND p2.group_key = p1.group_key AND p2.is_winner
  JOIN public.recipes r2 ON r2.id = p2.recipe_id AND r2.user_id = r1.user_id
  WHERE p1.will_delete AND p1.recipe_id <> p2.recipe_id
  ORDER BY p1.recipe_id, p1.group_type;

  SELECT count(*) INTO duplicates_total FROM _merge_map;

  IF duplicates_total = 0 THEN
    RAISE NOTICE 'run_recipes_dedupe_merge: no duplicates to merge';
    RETURN;
  END IF;

  SELECT count(*) INTO will_update_favorites
  FROM public.favorites_v2 f
  WHERE f.recipe_id IN (SELECT loser_id FROM _merge_map);

  SELECT count(*) INTO will_update_plans
  FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v)
  WHERE (v->>'recipe_id')::uuid IN (SELECT loser_id FROM _merge_map);

  will_delete_recipes := duplicates_total;

  IF p_dry_run THEN
    RAISE NOTICE 'run_recipes_dedupe_merge (dry_run): duplicates_total=%, will_update_favorites=%, will_update_plans=%, will_delete_recipes=%',
      duplicates_total, will_update_favorites, will_update_plans, will_delete_recipes;
    RETURN;
  END IF;

  UPDATE public.favorites_v2 f
  SET recipe_id = m.winner_id
  FROM _merge_map m
  WHERE f.recipe_id = m.loser_id
    AND NOT EXISTS (
      SELECT 1 FROM public.favorites_v2 f2
      WHERE f2.user_id = f.user_id AND f2.recipe_id = m.winner_id AND f2.id <> f.id
    );
  GET DIAGNOSTICS updated_fav = ROW_COUNT;

  DELETE FROM public.favorites_v2
  WHERE recipe_id IN (SELECT loser_id FROM _merge_map);
  GET DIAGNOSTICS fav_deleted = ROW_COUNT;
  updated_fav := updated_fav + fav_deleted;

  FOR plan_rec IN
    SELECT mp.id, mp.meals
    FROM public.meal_plans_v2 mp
    WHERE EXISTS (
      SELECT 1 FROM jsonb_each(mp.meals) AS t(k, v)
      WHERE (v->>'recipe_id')::uuid IN (SELECT loser_id FROM _merge_map)
    )
  LOOP
    UPDATE public.meal_plans_v2
    SET meals = (
      SELECT jsonb_object_agg(
        t.k,
        CASE
          WHEN (t.value->>'recipe_id')::uuid IN (SELECT loser_id FROM _merge_map) THEN
            jsonb_set(t.value, '{recipe_id}', to_jsonb((SELECT m.winner_id::text FROM _merge_map m WHERE m.loser_id = (t.value->>'recipe_id')::uuid LIMIT 1)))
          ELSE t.value
        END
      )
      FROM jsonb_each(plan_rec.meals) AS t(k, value)
    )
    WHERE id = plan_rec.id;
    updated_plans := updated_plans + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_history' AND column_name = 'recipe_id'
  ) THEN
    UPDATE public.chat_history ch
    SET recipe_id = m.winner_id
    FROM _merge_map m
    WHERE ch.recipe_id = m.loser_id;
    GET DIAGNOSTICS updated_chat = ROW_COUNT;
  END IF;

  INSERT INTO public.recipes_trash
  SELECT r.*, now(), m.delete_reason
  FROM public.recipes r
  JOIN _merge_map m ON m.loser_id = r.id;
  GET DIAGNOSTICS trashed = ROW_COUNT;

  INSERT INTO public.recipe_steps_trash
  SELECT rs.*, now(), m.delete_reason
  FROM public.recipe_steps rs
  JOIN _merge_map m ON m.loser_id = rs.recipe_id;

  INSERT INTO public.recipe_ingredients_trash
  SELECT ri.*, now(), m.delete_reason
  FROM public.recipe_ingredients ri
  JOIN _merge_map m ON m.loser_id = ri.recipe_id;

  LOOP
    SELECT array_agg(loser_id) INTO batch_ids FROM (SELECT loser_id FROM _merge_map LIMIT batch_size) s;
    EXIT WHEN batch_ids IS NULL OR array_length(batch_ids, 1) IS NULL;
    DELETE FROM public.recipe_steps WHERE recipe_id = ANY(batch_ids);
    DELETE FROM public.recipe_ingredients WHERE recipe_id = ANY(batch_ids);
    DELETE FROM public.recipes WHERE id = ANY(batch_ids);
    deleted := deleted + array_length(batch_ids, 1);
    DELETE FROM _merge_map WHERE loser_id = ANY(batch_ids);
  END LOOP;

  SELECT count(*) INTO broken_plan_links_count
  FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v)
  WHERE v->>'recipe_id' IS NOT NULL
    AND (v->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
    AND (v->>'recipe_id')::uuid NOT IN (SELECT id FROM public.recipes);

  SELECT count(*) INTO broken_favorites_links_count
  FROM public.favorites_v2 f
  WHERE f.recipe_id IS NOT NULL
    AND f.recipe_id NOT IN (SELECT id FROM public.recipes);

  RAISE NOTICE 'run_recipes_dedupe_merge: duplicates_total=%, updated_favorites=%, updated_plans=%, updated_chat=%, trashed=%, deleted=%, broken_plan_links_count=%, broken_favorites_links_count=%',
    duplicates_total, updated_fav, updated_plans, updated_chat, trashed, deleted, broken_plan_links_count, broken_favorites_links_count;
END;
$$;
