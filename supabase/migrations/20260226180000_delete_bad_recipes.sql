-- Безопасное удаление «мусорных» рецептов: миграция только создаёт функцию, ничего не удаляет при деплое.
--
-- Как запускать:
--   Dry run (по умолчанию, ничего не меняет, только отчёт):
--     SELECT * FROM public.delete_bad_recipes(true);
--     или
--     SELECT * FROM public.delete_bad_recipes();
--
--   Реальное удаление (после проверки dry run):
--     SELECT * FROM public.delete_bad_recipes(false);
--
-- Критерии мусора: >70% other среди ингредиентов, <3 ингредиентов, <2 шагов,
-- пустой/короткий title, выбросы canonical_amount (мясо/рыба >1500g, молочное >2500ml, крупы >3000g).

CREATE OR REPLACE FUNCTION public.delete_bad_recipes(p_dry_run boolean DEFAULT true)
RETURNS TABLE (
  recipe_id uuid,
  title text,
  reasons text,
  ingredients_count bigint,
  steps_count bigint,
  other_pct numeric,
  max_canonical_amount numeric,
  planned_refs_count bigint,
  favorites_refs_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plans_updated int;
  plans_deleted int;
  fav_deleted int;
  steps_deleted int;
  ing_deleted int;
  rec_deleted int;
BEGIN
  IF p_dry_run THEN
    RETURN QUERY
    WITH ing_agg AS (
      SELECT
        ri.recipe_id,
        count(*)::bigint AS ing_total,
        count(*) FILTER (WHERE ri.category = 'other')::bigint AS ing_other,
        (count(*) FILTER (WHERE ri.category = 'other')::float / nullif(count(*), 0) * 100)::numeric AS other_pct,
        max(CASE
          WHEN ri.canonical_amount IS NOT NULL
            AND (
              (ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500)
              OR (ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500)
              OR (ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000)
            ) THEN ri.canonical_amount::numeric
          ELSE NULL
        END) AS max_canonical
      FROM public.recipe_ingredients ri
      GROUP BY ri.recipe_id
    ),
    st_agg AS (
      SELECT rs.recipe_id, count(*)::bigint AS steps_count
      FROM public.recipe_steps rs
      GROUP BY rs.recipe_id
    ),
    bad_candidates AS (
      SELECT r.id
      FROM public.recipes r
      LEFT JOIN ing_agg i ON i.recipe_id = r.id
      LEFT JOIN st_agg s ON s.recipe_id = r.id
      WHERE (r.title IS NULL OR btrim(r.title) = '' OR length(btrim(r.title)) < 2)
         OR COALESCE(i.ing_total, 0) < 3
         OR (s.steps_count IS NULL OR s.steps_count < 2)
         OR (COALESCE(i.ing_total, 0) > 0 AND (i.ing_other::float / nullif(i.ing_total, 0)) > 0.7)
      UNION
      SELECT ri.recipe_id
      FROM public.recipe_ingredients ri
      WHERE ri.canonical_amount IS NOT NULL
        AND (
          (ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500)
          OR (ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500)
          OR (ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000)
        )
    ),
    bad_recipes AS (
      SELECT DISTINCT b.id
      FROM bad_candidates b
    ),
    report_base AS (
      SELECT
        r.id AS rid,
        r.title AS rtitle,
        COALESCE(i.ing_total, 0)::bigint AS ing_total,
        COALESCE(s.steps_count, 0)::bigint AS st_count,
        i.other_pct AS opct,
        i.max_canonical AS max_can
      FROM bad_recipes br
      JOIN public.recipes r ON r.id = br.id
      LEFT JOIN ing_agg i ON i.recipe_id = r.id
      LEFT JOIN st_agg s ON s.recipe_id = r.id
    ),
    reasons AS (
      SELECT
        rb.rid,
        rb.rtitle,
        rb.ing_total,
        rb.st_count,
        rb.opct,
        rb.max_can,
        trim(both '|' from concat_ws('|',
          CASE WHEN rb.rtitle IS NULL OR btrim(rb.rtitle) = '' OR length(btrim(rb.rtitle)) < 2 THEN 'title_empty_or_short' END,
          CASE WHEN rb.ing_total < 3 THEN 'ingredients_lt_3' END,
          CASE WHEN rb.st_count IS NULL OR rb.st_count < 2 THEN 'steps_lt_2' END,
          CASE WHEN rb.ing_total > 0 AND (rb.opct IS NULL OR rb.opct > 70) THEN 'other_pct_gt_70' END,
          CASE WHEN rb.max_can IS NOT NULL AND rb.max_can > 1500 THEN 'outlier_amount' END
        )) AS reason_txt
      FROM report_base rb
    ),
    refs AS (
      SELECT
        r.rid,
        (
          (SELECT count(*) FROM public.meal_plans mp WHERE mp.recipe_id = r.rid)
          + (SELECT count(*) FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v) WHERE (t.v->>'recipe_id')::uuid = r.rid)
        )::bigint AS planned_refs,
        (SELECT count(*) FROM public.favorites_v2 f WHERE f.recipe_id = r.rid)::bigint AS fav_refs
      FROM reasons r
    )
    SELECT
      r.rid,
      r.rtitle,
      r.reason_txt,
      r.ing_total,
      r.st_count,
      r.opct,
      r.max_can,
      rf.planned_refs,
      rf.fav_refs
    FROM reasons r
    JOIN refs rf ON rf.rid = r.rid;

    RAISE NOTICE 'delete_bad_recipes(dry_run=true): no changes; see result set for candidates.';
    RETURN;
  END IF;

  -- p_dry_run = false: сохранить отчёт во временную таблицу, выполнить удаление, вернуть отчёт
  CREATE TEMP TABLE IF NOT EXISTS _delete_bad_recipes_report (
    recipe_id uuid,
    title text,
    reasons text,
    ingredients_count bigint,
    steps_count bigint,
    other_pct numeric,
    max_canonical_amount numeric,
    planned_refs_count bigint,
    favorites_refs_count bigint
  );
  TRUNCATE _delete_bad_recipes_report;

  INSERT INTO _delete_bad_recipes_report
  WITH ing_agg AS (
    SELECT
      ri.recipe_id,
      count(*)::bigint AS ing_total,
      count(*) FILTER (WHERE ri.category = 'other')::bigint AS ing_other,
      (count(*) FILTER (WHERE ri.category = 'other')::float / nullif(count(*), 0) * 100)::numeric AS other_pct,
      max(CASE
        WHEN ri.canonical_amount IS NOT NULL
          AND (
            (ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500)
            OR (ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500)
            OR (ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000)
          ) THEN ri.canonical_amount::numeric
        ELSE NULL
      END) AS max_canonical
    FROM public.recipe_ingredients ri
    GROUP BY ri.recipe_id
  ),
  st_agg AS (
    SELECT rs.recipe_id, count(*)::bigint AS steps_count
    FROM public.recipe_steps rs
    GROUP BY rs.recipe_id
  ),
  bad_candidates AS (
    SELECT r.id
    FROM public.recipes r
    LEFT JOIN ing_agg i ON i.recipe_id = r.id
    LEFT JOIN st_agg s ON s.recipe_id = r.id
    WHERE (r.title IS NULL OR btrim(r.title) = '' OR length(btrim(r.title)) < 2)
       OR COALESCE(i.ing_total, 0) < 3
       OR (s.steps_count IS NULL OR s.steps_count < 2)
       OR (COALESCE(i.ing_total, 0) > 0 AND (i.ing_other::float / nullif(i.ing_total, 0)) > 0.7)
    UNION
    SELECT ri.recipe_id
    FROM public.recipe_ingredients ri
    WHERE ri.canonical_amount IS NOT NULL
      AND (
        (ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500)
        OR (ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500)
        OR (ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000)
      )
  ),
  bad_recipes AS (
    SELECT DISTINCT id FROM bad_candidates
  ),
  report_base AS (
    SELECT
      r.id AS rid,
      r.title AS rtitle,
      COALESCE(i.ing_total, 0)::bigint AS ing_total,
      COALESCE(s.steps_count, 0)::bigint AS st_count,
      i.other_pct AS opct,
      i.max_canonical AS max_can
    FROM bad_recipes br
    JOIN public.recipes r ON r.id = br.id
    LEFT JOIN ing_agg i ON i.recipe_id = r.id
    LEFT JOIN st_agg s ON s.recipe_id = r.id
  ),
  reasons AS (
    SELECT
      rb.rid,
      rb.rtitle,
      rb.ing_total,
      rb.st_count,
      rb.opct,
      rb.max_can,
      trim(both '|' from concat_ws('|',
        CASE WHEN rb.rtitle IS NULL OR btrim(rb.rtitle) = '' OR length(btrim(rb.rtitle)) < 2 THEN 'title_empty_or_short' END,
        CASE WHEN rb.ing_total < 3 THEN 'ingredients_lt_3' END,
        CASE WHEN rb.st_count IS NULL OR rb.st_count < 2 THEN 'steps_lt_2' END,
        CASE WHEN rb.ing_total > 0 AND (rb.opct IS NULL OR rb.opct > 70) THEN 'other_pct_gt_70' END,
        CASE WHEN rb.max_can IS NOT NULL AND rb.max_can > 1500 THEN 'outlier_amount' END
      )) AS reason_txt
    FROM report_base rb
  ),
  refs AS (
    SELECT
      r.rid,
      (
        (SELECT count(*) FROM public.meal_plans mp WHERE mp.recipe_id = r.rid)
        + (SELECT count(*) FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v) WHERE (t.v->>'recipe_id')::uuid = r.rid)
      )::bigint AS planned_refs,
      (SELECT count(*) FROM public.favorites_v2 f WHERE f.recipe_id = r.rid)::bigint AS fav_refs
    FROM reasons r
  )
  SELECT r.rid, r.rtitle, r.reason_txt, r.ing_total, r.st_count, r.opct, r.max_can, rf.planned_refs, rf.fav_refs
  FROM reasons r
  JOIN refs rf ON rf.rid = r.rid;

  -- Обнулить слоты в meal_plans_v2
  UPDATE public.meal_plans_v2 mp
  SET meals = (
    SELECT jsonb_object_agg(
      t.k,
      CASE WHEN (t.v->>'recipe_id')::uuid IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report) THEN '{}'::jsonb ELSE t.v END
    )
    FROM jsonb_each(mp.meals) AS t(k, v)
  )
  WHERE EXISTS (
    SELECT 1 FROM jsonb_each(mp.meals) AS t(k, v)
    WHERE (t.v->>'recipe_id')::uuid IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report)
  );
  GET DIAGNOSTICS plans_updated = ROW_COUNT;

  DELETE FROM public.meal_plans WHERE recipe_id IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report);
  GET DIAGNOSTICS plans_deleted = ROW_COUNT;

  DELETE FROM public.favorites_v2 WHERE recipe_id IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report);
  GET DIAGNOSTICS fav_deleted = ROW_COUNT;

  DELETE FROM public.recipe_steps WHERE recipe_id IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report);
  GET DIAGNOSTICS steps_deleted = ROW_COUNT;

  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report);
  GET DIAGNOSTICS ing_deleted = ROW_COUNT;

  DELETE FROM public.recipes WHERE id IN (SELECT _delete_bad_recipes_report.recipe_id FROM _delete_bad_recipes_report);
  GET DIAGNOSTICS rec_deleted = ROW_COUNT;

  RAISE NOTICE 'delete_bad_recipes(dry_run=false): meal_plans_v2 updated=%, meal_plans deleted=%, favorites_v2 deleted=%, recipe_steps=%, recipe_ingredients=%, recipes deleted=%',
    plans_updated, plans_deleted, fav_deleted, steps_deleted, ing_deleted, rec_deleted;

  RETURN QUERY SELECT * FROM _delete_bad_recipes_report;
END;
$$;

COMMENT ON FUNCTION public.delete_bad_recipes(boolean) IS
  'Lists or deletes "bad" recipes (empty title, <3 ingredients, <2 steps, >70% other category, outlier amounts). Default p_dry_run=true: no changes. Use p_dry_run=false to perform delete. Example: SELECT * FROM public.delete_bad_recipes(true);';
