-- Document recipe_translation action_type in token_usage_log (ML-5 translation observability).
-- No schema change: action_type is text NOT NULL without CHECK.

COMMENT ON COLUMN public.token_usage_log.action_type IS
  'Тип действия: chat_recipe (рецепт в чате), weekly_plan (план на неделю), sos_consultant (Мы рядом), diet_plan, balance_check, chat (обычный чат), plan_replace, recipe_translation (ML-5 перевод рецепта через translate-recipe), other';
