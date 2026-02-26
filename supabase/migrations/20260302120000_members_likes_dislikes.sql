-- Members: split preferences into likes (soft) and dislikes (hard).
-- preferences column is kept for compatibility; app should read likes/dislikes.
-- allergies / allergy_items unchanged.

-- 1) Add columns
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS likes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS dislikes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.members.likes IS 'Что любит (мягкие предпочтения). Заполняется из preferences при бэкфилле и из приложения.';
COMMENT ON COLUMN public.members.dislikes IS 'Что не любит / не ест (жёсткие предпочтения). Заполняется из preferences при бэкфилле и из приложения.';

-- 2) Backfill from preferences -> likes / dislikes
-- Rules: normalize lower(trim); "не любит"/"не ест"/"без "/etc -> dislikes (strip prefix);
--        "любит "/"нравится "/etc -> likes (strip prefix); else -> likes.
-- Empty after strip ignored. Dedupe. Merge with existing likes/dislikes (do not overwrite).

WITH prefs_unnorm AS (
  SELECT m.id, lower(trim(p.pref)) AS pref_norm
  FROM public.members m,
  LATERAL unnest(COALESCE(m.preferences, '{}')) AS p(pref)
  WHERE m.preferences IS NOT NULL AND array_length(m.preferences, 1) > 0
),
prefs_classified AS (
  SELECT
    id,
    pref_norm,
    -- Dislike: strip marker (не любит, не ест, не хочу, ненавижу, без:, без)
    CASE
      WHEN pref_norm ~ '(не любит|не ест|не хочу|ненавижу|без:|без)\s' THEN trim(regexp_replace(pref_norm, '^.*?(не любит|не ест|не хочу|ненавижу|без:|без)\s*', ''))
      ELSE NULL
    END AS dislike_val,
    -- Like: strip "любит "/"нравится "/etc or use whole string
    CASE
      WHEN pref_norm ~ '(не любит|не ест|не хочу|ненавижу|без:|без)\s' THEN NULL
      WHEN pref_norm ~ '(любит|нравится|обожает|хочу чаще)\s' THEN trim(regexp_replace(pref_norm, '^.*?(любит|нравится|обожает|хочу чаще)\s*', ''))
      ELSE pref_norm
    END AS like_val
  FROM prefs_unnorm
),
backfill_agg AS (
  SELECT
    id,
    array_agg(DISTINCT dislike_val) FILTER (WHERE dislike_val IS NOT NULL AND dislike_val <> '') AS new_dislikes,
    array_agg(DISTINCT like_val) FILTER (WHERE like_val IS NOT NULL AND like_val <> '') AS new_likes
  FROM prefs_classified
  GROUP BY id
)
UPDATE public.members m
SET
  likes = COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM unnest(array_cat(COALESCE(m.likes, '{}'), COALESCE(b.new_likes, '{}'))) AS x),
    '{}'
  ),
  dislikes = COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
     FROM unnest(array_cat(COALESCE(m.dislikes, '{}'), COALESCE(b.new_dislikes, '{}'))) AS x),
    '{}'
  )
FROM backfill_agg b
WHERE m.id = b.id;

-- 3) Verification queries (run manually after migration if needed)
/*
-- How many members have non-empty preferences and empty likes AND empty dislikes (before: candidates for backfill; after: only if all prefs parsed to empty):
SELECT count(*) AS with_prefs_empty_likes_dislikes
FROM public.members
WHERE preferences IS NOT NULL AND array_length(preferences, 1) > 0
  AND (likes = '{}' OR likes IS NULL) AND (dislikes = '{}' OR dislikes IS NULL);

-- Sample first 20: id, name, preferences, likes, dislikes
SELECT id, name, preferences, likes, dislikes
FROM public.members
WHERE preferences IS NOT NULL AND array_length(preferences, 1) > 0
ORDER BY id
LIMIT 20;
*/
