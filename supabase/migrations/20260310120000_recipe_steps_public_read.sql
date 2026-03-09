-- Allow anonymous (and any) users to read recipe_steps for public recipes.
-- recipe_ingredients already allow this via recipe_ingredients_select_via_recipe (visibility = 'public').
-- Without this, /welcome recipe block returns no steps for unauthenticated users (RLS filtered them out).

DROP POLICY IF EXISTS "Allow read steps of public recipes" ON public.recipe_steps;
CREATE POLICY "Allow read steps of public recipes" ON public.recipe_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_steps.recipe_id
        AND r.visibility = 'public'
    )
  );

COMMENT ON POLICY "Allow read steps of public recipes" ON public.recipe_steps IS
  'Welcome/landing: anon can read steps of public recipes (e.g. welcome recipe).';
