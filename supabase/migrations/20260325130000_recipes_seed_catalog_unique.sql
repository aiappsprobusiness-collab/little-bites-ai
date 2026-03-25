-- Идемпотентный каталог seed-рецептов: не более одной строки на комбинацию
-- (владелец, локаль, нормализованный заголовок, диапазон возраста) для source = seed.
-- Поддерживает повторный импорт scripts/import-infant-seed.mjs без дублей.

CREATE UNIQUE INDEX IF NOT EXISTS recipes_seed_catalog_identity_v1
  ON public.recipes (user_id, locale, norm_title, min_age_months, max_age_months)
  WHERE source = 'seed'
    AND norm_title IS NOT NULL;

COMMENT ON INDEX public.recipes_seed_catalog_identity_v1 IS
  'Uniqueness for curated seed pool per catalog user; used by import-infant-seed.mjs upsert key.';
