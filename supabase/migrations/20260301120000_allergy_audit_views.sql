-- Allergy audit views: health-check для нарушений аллергий в рецептах и планах.
-- Только VIEW, без изменений/удаления данных. Использование — см. комментарии в конце.

-- ========== 1. Список токенов аллергенов (в унисон с Edge _shared/allergens) ==========
-- Минимум: кур, куриц, chicken, орех, nut, молок, яйц, рыба, глютен (+ расширения для матча по подстрокам).
CREATE OR REPLACE VIEW public.recipes_allergy_tokens_audit AS
WITH tokens_list AS (
  SELECT unnest(ARRAY[
    'кур', 'куриц', 'курин', 'chicken', 'poultry',
    'орех', 'орехи', 'орешн', 'nut', 'nuts',
    'молок', 'молочн', 'milk', 'dairy', 'лактоз', 'lactose', 'казеин', 'casein',
    'яйц', 'яичн', 'egg', 'eggs',
    'рыб', 'fish', 'лосос', 'треск', 'тунец',
    'глютен', 'пшениц', 'gluten', 'wheat'
  ]::text[]) AS token
),
recipes_text AS (
  SELECT
    r.id AS recipe_id,
    r.title,
    r.meal_type,
    r.is_soup,
    r.created_at,
    lower(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) AS search_text,
    left(COALESCE(r.title, '') || ' ' || COALESCE(r.description, ''), 300) AS sample_text
  FROM public.recipes r
),
matched AS (
  SELECT
    rt.recipe_id,
    rt.title,
    rt.meal_type,
    rt.is_soup,
    rt.created_at,
    rt.sample_text,
    tl.token
  FROM recipes_text rt
  CROSS JOIN tokens_list tl
  WHERE position(tl.token IN rt.search_text) > 0
)
SELECT
  recipe_id,
  title,
  meal_type,
  is_soup,
  created_at,
  array_agg(DISTINCT token ORDER BY token) FILTER (WHERE token IS NOT NULL) AS matched_tokens,
  max(sample_text) AS sample_text
FROM matched
GROUP BY recipe_id, title, meal_type, is_soup, created_at;

COMMENT ON VIEW public.recipes_allergy_tokens_audit IS 'Аудит: рецепты, в title/description которых встречены токены аллергенов (кур, орех, молок, яйц, рыба, глютен и т.д.). Только строки с непустым matched_tokens.';

-- ========== 2. Нарушения аллергий в планах (meal_plans_v2) ==========
-- Для каждой строки плана с рецептом: какие токены нашлись в рецепте, какие аллергии у профиля/семьи.
-- member_id есть => аллергии этого member; иначе (member_id NULL) => режим family, аллергии всех members пользователя.
CREATE OR REPLACE VIEW public.meal_plans_v2_allergy_violations_audit AS
WITH tokens_list AS (
  SELECT unnest(ARRAY[
    'кур', 'куриц', 'курин', 'chicken', 'poultry',
    'орех', 'орехи', 'орешн', 'nut', 'nuts',
    'молок', 'молочн', 'milk', 'dairy', 'лактоз', 'lactose', 'казеин', 'casein',
    'яйц', 'яичн', 'egg', 'eggs',
    'рыб', 'fish', 'лосос', 'треск', 'тунец',
    'глютен', 'пшениц', 'gluten', 'wheat'
  ]::text[]) AS token
),
-- Активные аллергии по member: из allergy_items (is_active) или fallback на allergies
member_allergies AS (
  SELECT
    m.id AS member_id,
    m.user_id,
    COALESCE(
      (
        SELECT array_agg(e->>'value' ORDER BY (e->>'sort_order')::int NULLS LAST)
        FROM jsonb_array_elements(m.allergy_items) e
        WHERE (e->>'is_active')::boolean IS NOT FALSE
          AND e->>'value' IS NOT NULL
          AND trim(e->>'value') <> ''
      ),
      m.allergies
    ) AS allergies
  FROM public.members m
),
-- Семейные аллергии: все активные аллергии всех members пользователя (без дублей)
family_allergies AS (
  SELECT
    m.user_id,
    array_agg(DISTINCT a.elem ORDER BY a.elem) AS allergies
  FROM public.members m,
       LATERAL unnest(
         COALESCE(
           (SELECT array_agg(e->>'value') FROM jsonb_array_elements(m.allergy_items) e WHERE (e->>'is_active')::boolean IS NOT FALSE AND e->>'value' IS NOT NULL AND trim(e->>'value') <> ''),
           m.allergies,
           '{}'::text[]
         )
       ) AS a(elem)
  WHERE a.elem IS NOT NULL AND trim(a.elem) <> ''
  GROUP BY m.user_id
),
slots AS (
  SELECT
    mp.id AS plan_id,
    mp.user_id,
    mp.member_id,
    mp.planned_date,
    t.key AS slot_key,
    (t.value->>'recipe_id')::uuid AS recipe_id
  FROM public.meal_plans_v2 mp,
       jsonb_each(mp.meals) t
  WHERE t.value->>'recipe_id' IS NOT NULL
    AND (t.value->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
),
slots_with_recipe AS (
  SELECT
    s.plan_id,
    s.user_id,
    s.member_id,
    s.planned_date,
    s.slot_key,
    s.recipe_id,
    r.title AS recipe_title,
    lower(COALESCE(r.title, '') || ' ' || COALESCE(r.description, '')) AS search_text
  FROM slots s
  JOIN public.recipes r ON r.id = s.recipe_id
),
slot_matched_tokens AS (
  SELECT
    s.plan_id,
    s.user_id,
    s.member_id,
    s.planned_date,
    s.slot_key,
    s.recipe_id,
    s.recipe_title,
    tl.token
  FROM slots_with_recipe s
  CROSS JOIN tokens_list tl
  WHERE position(tl.token IN s.search_text) > 0
),
aggregated AS (
  SELECT
    plan_id,
    user_id,
    member_id,
    planned_date,
    slot_key,
    recipe_id,
    recipe_title,
    array_agg(DISTINCT token ORDER BY token) AS matched_tokens
  FROM slot_matched_tokens
  GROUP BY plan_id, user_id, member_id, planned_date, slot_key, recipe_id, recipe_title
)
SELECT
  a.user_id,
  a.member_id,
  a.planned_date,
  a.slot_key,
  a.recipe_id,
  a.recipe_title,
  a.matched_tokens,
  CASE
    WHEN a.member_id IS NOT NULL THEN ma.allergies
    ELSE fa.allergies
  END AS allergies,
  CASE
    WHEN a.member_id IS NOT NULL THEN 'member'::text
    ELSE 'family'::text
  END AS mode
FROM aggregated a
LEFT JOIN member_allergies ma ON ma.member_id = a.member_id
LEFT JOIN family_allergies fa ON fa.user_id = a.user_id AND a.member_id IS NULL;

COMMENT ON VIEW public.meal_plans_v2_allergy_violations_audit IS 'Аудит: слоты планов, в рецептах которых встречены токены аллергенов; аллергии профиля (member) или семьи (family).';

-- RLS: запросы к view выполняются с правами вызывающего (как в других audit-views проекта).
ALTER VIEW public.recipes_allergy_tokens_audit SET (security_invoker = true);
ALTER VIEW public.meal_plans_v2_allergy_violations_audit SET (security_invoker = true);

-- ========== Как использовать ==========
-- Рецепты с потенциальными аллергенами (последние 50):
--   SELECT * FROM public.recipes_allergy_tokens_audit ORDER BY created_at DESC LIMIT 50;
--
-- Планы с потенциальными нарушениями (последние 50):
--   SELECT * FROM public.meal_plans_v2_allergy_violations_audit ORDER BY planned_date DESC LIMIT 50;
