-- RPC: вернуть рецепт по share_ref для публичной страницы шаринга (anon).
-- Выполняется с SECURITY DEFINER, чтобы обойти RLS и отдать рецепт по валидной короткой ссылке.

CREATE OR REPLACE FUNCTION public.get_recipe_by_share_ref(p_share_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
  v_result jsonb;
BEGIN
  IF p_share_ref IS NULL OR trim(p_share_ref) = '' THEN
    RETURN NULL;
  END IF;

  SELECT recipe_id INTO v_recipe_id
  FROM public.share_refs
  WHERE share_ref = trim(p_share_ref)
  LIMIT 1;

  IF v_recipe_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'recipe', to_jsonb(r),
    'ingredients', COALESCE(
      (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.order_index NULLS LAST, ri.name)
       FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id),
      '[]'::jsonb
    ),
    'steps', COALESCE(
      (SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.step_number)
       FROM public.recipe_steps rs WHERE rs.recipe_id = r.id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM public.recipes r
  WHERE r.id = v_recipe_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_recipe_by_share_ref(text) IS
  'Публичное чтение рецепта по короткой ссылке шаринга /r/:shareRef. Для anon без авторизации.';

GRANT EXECUTE ON FUNCTION public.get_recipe_by_share_ref(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_recipe_by_share_ref(text) TO authenticated;
