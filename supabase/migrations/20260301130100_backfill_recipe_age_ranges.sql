-- Backfill recipe age ranges: reduce "adult dishes for 6–12 мес" and "baby puree in adult pool".
-- Idempotent: only touch rows where (min_age_months, max_age_months) IN ((6, 36), (NULL, NULL)).

-- 1) Recipes with member_id: set range around member's age (if member is child with age_months).
UPDATE public.recipes r
SET
  min_age_months = LEAST(GREATEST(m.age_months - 1, 0), m.age_months),
  max_age_months = LEAST(m.age_months + 12, 216)
FROM public.members m
WHERE r.member_id = m.id
  AND m.type = 'child'
  AND m.age_months IS NOT NULL
  AND (
    (r.min_age_months = 6 AND r.max_age_months = 36)
    OR (r.min_age_months IS NULL AND r.max_age_months IS NULL)
  );

-- 2) Pool recipes without member_id: infant keywords -> 6–12; adult keywords -> 24–216; else leave or 12–60.
UPDATE public.recipes r
SET
  min_age_months = 6,
  max_age_months = 12
WHERE r.member_id IS NULL
  AND (
    (r.min_age_months = 6 AND r.max_age_months = 36)
    OR (r.min_age_months IS NULL AND r.max_age_months IS NULL)
  )
  AND (
    EXISTS (
      SELECT 1 FROM public.recipe_ingredients ri
      WHERE ri.recipe_id = r.id
        AND (LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%пюре%' OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%прикорм%')
    )
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%пюре%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%прикорм%'
  );

UPDATE public.recipes r
SET
  min_age_months = 24,
  max_age_months = 216
WHERE r.member_id IS NULL
  AND (
    (r.min_age_months = 6 AND r.max_age_months = 36)
    OR (r.min_age_months IS NULL AND r.max_age_months IS NULL)
  )
  AND (
    LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%свинин%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%говядин%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%стейк%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%жарен%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%бекон%'
    OR LOWER(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) LIKE '%колбас%'
    OR EXISTS (
      SELECT 1 FROM public.recipe_ingredients ri
      WHERE ri.recipe_id = r.id
        AND (LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%свинин%'
          OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%говядин%'
          OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%стейк%'
          OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%жарен%'
          OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%бекон%'
          OR LOWER(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')) LIKE '%колбас%')
    )
  );
