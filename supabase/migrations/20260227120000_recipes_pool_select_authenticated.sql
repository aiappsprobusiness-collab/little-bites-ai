-- RLS: любой аутентифицированный пользователь может читать рецепты из пула (public.recipes)
-- для подбора меню по особенностям профиля (аллергии, возраст, предпочтения).
-- Пул = source IN ('seed','starter','manual','week_ai','chat_ai').
-- Существующие политики «только свои рецепты» остаются; для SELECT добавляется OR по пулу.

-- 1) recipes: SELECT — свои рецепты ИЛИ любой пуловой рецепт для авторизованных
DROP POLICY IF EXISTS "Authenticated users can read pool recipes" ON public.recipes;
CREATE POLICY "Authenticated users can read pool recipes" ON public.recipes
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai')
  );

-- 2) recipe_ingredients: SELECT — ингредиенты своих рецептов ИЛИ рецептов из пула
DROP POLICY IF EXISTS "Authenticated users can read ingredients of pool recipes" ON public.recipe_ingredients;
CREATE POLICY "Authenticated users can read ingredients of pool recipes" ON public.recipe_ingredients
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id
        AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai')
    )
  );

-- 3) recipe_steps: SELECT — шаги своих рецептов ИЛИ рецептов из пула
DROP POLICY IF EXISTS "Authenticated users can read steps of pool recipes" ON public.recipe_steps;
CREATE POLICY "Authenticated users can read steps of pool recipes" ON public.recipe_steps
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id
        AND r.source IN ('seed', 'starter', 'manual', 'week_ai', 'chat_ai')
    )
  );

COMMENT ON POLICY "Authenticated users can read pool recipes" ON public.recipes IS
  'Weekly plan: any authenticated user can read any pool recipe (filtered by profile on app side).';
