-- RPC: ensure_starter_recipes_seeded(p_recipes jsonb)
-- Performs seeding server-side so the client makes no direct recipe_ingredients/recipe_steps requests.
-- Payload: array of {id, user_id, title, description, cooking_time_minutes, ingredients[], steps[]}

CREATE OR REPLACE FUNCTION public.ensure_starter_recipes_seeded(p_recipes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  recipe_uuid uuid;
  user_uuid uuid;
  ing jsonb;
  s jsonb;
  has_ingredients boolean;
BEGIN
  IF p_recipes IS NULL OR jsonb_array_length(p_recipes) = 0 THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_recipes)
  LOOP
    recipe_uuid := (r->>'id')::uuid;
    user_uuid := (r->>'user_id')::uuid;
    IF user_uuid IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'user_id must match auth.uid()';
    END IF;

    INSERT INTO public.recipes (id, user_id, child_id, title, description, cooking_time_minutes)
    VALUES (
      recipe_uuid,
      user_uuid,
      NULL,
      r->>'title',
      NULLIF(r->>'description', ''),
      (r->>'cooking_time_minutes')::integer
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT EXISTS(SELECT 1 FROM public.recipe_ingredients WHERE recipe_id = recipe_uuid LIMIT 1)
    INTO has_ingredients;

    IF NOT has_ingredients THEN
      FOR ing IN SELECT * FROM jsonb_array_elements(r->'ingredients')
      LOOP
        INSERT INTO public.recipe_ingredients (recipe_id, name, order_index, category)
        VALUES (
          recipe_uuid,
          ing->>'name',
          COALESCE((ing->>'order_index')::integer, 0),
          'other'
        );
      END LOOP;
      FOR s IN SELECT * FROM jsonb_array_elements(r->'steps')
      LOOP
        INSERT INTO public.recipe_steps (recipe_id, step_number, instruction)
        VALUES (
          recipe_uuid,
          COALESCE((s->>'step_number')::integer, 1),
          s->>'instruction'
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
