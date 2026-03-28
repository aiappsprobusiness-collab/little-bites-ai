-- Каталог seed: одна строка на (владелец, locale, norm_title, возраст, meal_type).
-- Нужно для toddler 12–36: одно и то же название может быть в разных слотах (breakfast vs snack).

DROP INDEX IF EXISTS public.recipes_seed_catalog_identity_v1;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_seed_catalog_identity_v2
  ON public.recipes (user_id, locale, norm_title, min_age_months, max_age_months, meal_type)
  WHERE source = 'seed'
    AND norm_title IS NOT NULL
    AND meal_type IS NOT NULL;

COMMENT ON INDEX public.recipes_seed_catalog_identity_v2 IS
  'Curated seed catalog identity per owner; includes meal_type for same title in different plan slots. import-infant-seed.mjs / catalog seed import.';
