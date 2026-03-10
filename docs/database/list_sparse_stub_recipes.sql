-- List recipes with sparse/crooked content or stub description/chef advice blocks.
-- Run in Supabase SQL Editor. Review the result; delete recipes manually later (e.g. via purge_recipes_by_ids or DELETE).

-- Stub description phrases (from recipeCopy.ts STUB_DESCRIPTION_PHRASES) — exact match → replace candidate
WITH stub_descriptions (phrase) AS (
  VALUES
    ('Лёгкое блюдо, которое хорошо подходит для любого приёма пищи.'),
    ('Сбалансированное сочетание ингредиентов и простой способ приготовления.'),
    ('Простой и быстрый вариант с минимумом усилий.'),
    ('Ароматное блюдо с насыщенным вкусом.'),
    ('Домашний вариант, который легко повторить.'),
    ('Идеально подходит для сытного приёма пищи.'),
    ('Сытное, но при этом не тяжёлое блюдо.'),
    ('Отличный выбор для разнообразия меню.'),
    ('Богато полезными веществами и при этом вкусно.'),
    ('Готовится из доступных ингредиентов.'),
    ('Нежная текстура и приятный вкус.'),
    ('Универсальное блюдо на каждый день.'),
    ('Вкусное и питательное сочетание.'),
    ('Минимум времени — максимум пользы.'),
    ('Подойдёт и для будней, и для особого случая.'),
    ('Аппетитный вид и насыщенный вкус.'),
    ('Классическое сочетание, проверенное временем.'),
    ('Легко адаптировать под свой вкус.'),
    ('Хорошо хранится и подходит для запаса.'),
    ('Простые шаги и предсказуемый результат.')
),
step_counts AS (
  SELECT recipe_id, count(*) AS steps_count
  FROM public.recipe_steps
  GROUP BY recipe_id
),
steps_from_jsonb AS (
  SELECT
    r.id AS recipe_id,
    CASE
      WHEN r.steps IS NULL OR jsonb_typeof(r.steps) <> 'array' THEN 0
      ELSE jsonb_array_length(r.steps)
    END AS jsonb_steps_count
  FROM public.recipes r
),
recipe_reasons AS (
  SELECT
    r.id,
    r.title,
    r.source,
    r.created_at,
    r.description,
    r.chef_advice,
    r.advice,
    length(btrim(COALESCE(r.description, ''))) AS desc_len,
    length(btrim(COALESCE(r.chef_advice, ''))) AS chef_advice_len,
    length(btrim(COALESCE(r.advice, ''))) AS advice_len,
    COALESCE(sc.steps_count, 0) AS steps_count,
    COALESCE(sj.jsonb_steps_count, 0) AS jsonb_steps_count,
    array_remove(ARRAY[
      CASE WHEN r.description IS NULL OR btrim(COALESCE(r.description, '')) = '' THEN 'description_empty' END,
      CASE WHEN length(btrim(COALESCE(r.description, ''))) > 0 AND length(btrim(r.description)) < 50 THEN 'description_very_short' END,
      CASE WHEN length(btrim(COALESCE(r.description, ''))) > 0 AND length(btrim(r.description)) < 110 THEN 'description_short' END,
      CASE WHEN EXISTS (SELECT 1 FROM stub_descriptions sd WHERE btrim(lower(regexp_replace(r.description, '\s+', ' ', 'g'))) = btrim(lower(regexp_replace(sd.phrase, '\s+', ' ', 'g')))) THEN 'description_stub_phrase' END,
      CASE WHEN r.description ~* '^\s*описание\s*[:\s]' OR r.description ~* '\s*описание\s*[:\s]' THEN 'description_block_header' END,
      CASE WHEN r.chef_advice IS NULL AND (r.advice IS NULL OR btrim(COALESCE(r.advice, '')) = '') THEN 'chef_advice_empty' END,
      CASE WHEN length(btrim(COALESCE(r.chef_advice, r.advice, ''))) > 0 AND length(btrim(COALESCE(r.chef_advice, r.advice, ''))) < 40 THEN 'chef_advice_short' END,
      CASE WHEN (r.chef_advice ~* 'совет\s+шефа\s*[:\s]' OR r.advice ~* 'совет\s+шефа\s*[:\s]') THEN 'chef_advice_block_header' END,
      CASE WHEN COALESCE(sc.steps_count, 0) = 0 AND (r.steps IS NULL OR jsonb_typeof(r.steps) <> 'array' OR jsonb_array_length(r.steps) = 0) THEN 'steps_empty' END,
      CASE WHEN COALESCE(sc.steps_count, 0) < 2 AND (r.steps IS NULL OR jsonb_typeof(r.steps) <> 'array' OR jsonb_array_length(r.steps) < 2) THEN 'steps_few' END
    ], NULL) AS reasons
  FROM public.recipes r
  LEFT JOIN step_counts sc ON sc.recipe_id = r.id
  LEFT JOIN steps_from_jsonb sj ON sj.recipe_id = r.id
  WHERE
    -- At least one bad criterion
    (r.description IS NULL OR btrim(COALESCE(r.description, '')) = ''
      OR length(btrim(r.description)) < 110
      OR EXISTS (SELECT 1 FROM stub_descriptions sd WHERE btrim(lower(regexp_replace(r.description, '\s+', ' ', 'g'))) = btrim(lower(regexp_replace(sd.phrase, '\s+', ' ', 'g'))))
      OR r.description ~* '^\s*описание\s*[:\s]' OR r.description ~* '\s*описание\s*[:\s]')
    OR ( (r.chef_advice IS NULL OR btrim(COALESCE(r.chef_advice, '')) = '') AND (r.advice IS NULL OR btrim(COALESCE(r.advice, '')) = '') )
    OR ( length(btrim(COALESCE(r.chef_advice, r.advice, ''))) > 0 AND length(btrim(COALESCE(r.chef_advice, r.advice, ''))) < 40 )
    OR ( r.chef_advice ~* 'совет\s+шефа\s*[:\s]' OR r.advice ~* 'совет\s+шефа\s*[:\s]' )
    OR COALESCE(sc.steps_count, 0) < 2
    OR (r.steps IS NOT NULL AND jsonb_typeof(r.steps) = 'array' AND jsonb_array_length(r.steps) < 2)
)
SELECT
  id,
  title,
  source,
  created_at,
  desc_len,
  chef_advice_len,
  advice_len,
  steps_count,
  jsonb_steps_count,
  reasons,
  left(btrim(COALESCE(description, '')), 120) AS description_preview,
  left(btrim(COALESCE(chef_advice, '')), 120) AS chef_advice_preview
FROM recipe_reasons
ORDER BY created_at DESC;

-- Optional: get only IDs for later bulk delete (e.g. purge_recipes_by_ids).
-- SELECT array_agg(id) AS recipe_ids FROM recipe_reasons;
-- Or: SELECT id FROM recipe_reasons;
