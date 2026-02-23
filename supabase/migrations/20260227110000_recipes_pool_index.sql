-- Индекс для ускорения подбора рецептов из пула (generate-plan): фильтр по user_id + source + сортировка по created_at.
CREATE INDEX IF NOT EXISTS idx_recipes_pool_user_created
  ON public.recipes(user_id, created_at DESC)
  WHERE source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai');

COMMENT ON INDEX public.idx_recipes_pool_user_created IS 'Pool lookup: user_id + created_at для fetchPoolCandidates/pickFromPool';
