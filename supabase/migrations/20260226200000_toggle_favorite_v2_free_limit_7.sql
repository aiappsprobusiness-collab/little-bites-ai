-- toggle_favorite_v2: Free limit 15 → 7. Replace function body only (limit check and return).
CREATE OR REPLACE FUNCTION public.toggle_favorite_v2(
  p_recipe_id uuid,
  p_member_id uuid DEFAULT NULL,
  p_recipe_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_exists boolean;
  v_count int;
  v_is_premium boolean;
  v_premium_until timestamptz;
  v_trial_until timestamptz;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  IF p_recipe_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'recipe_id_required');
  END IF;

  -- Already in favorites? (toggle off)
  SELECT EXISTS (
    SELECT 1 FROM favorites_v2
    WHERE user_id = v_user_id AND recipe_id = p_recipe_id
      AND ((p_member_id IS NULL AND member_id IS NULL) OR (member_id = p_member_id))
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM favorites_v2
    WHERE user_id = v_user_id AND recipe_id = p_recipe_id
      AND ((p_member_id IS NULL AND member_id IS NULL) OR (member_id = p_member_id));
    RETURN jsonb_build_object('ok', true, 'is_favorite', false);
  END IF;

  -- Adding: check Free limit (7)
  SELECT premium_until, trial_until, status
  INTO v_premium_until, v_trial_until, v_status
  FROM profiles_v2
  WHERE user_id = v_user_id
  LIMIT 1;

  v_is_premium := (
    (v_premium_until IS NOT NULL AND v_premium_until > now())
    OR (v_trial_until IS NOT NULL AND v_trial_until > now())
    OR v_status IN ('premium', 'trial')
  );

  IF NOT v_is_premium THEN
    SELECT count(*)::int INTO v_count FROM favorites_v2 WHERE user_id = v_user_id;
    IF v_count >= 7 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'favorites_limit_reached', 'limit', 7);
    END IF;
  END IF;

  INSERT INTO favorites_v2 (user_id, recipe_id, member_id, recipe_data)
  VALUES (v_user_id, p_recipe_id, p_member_id, COALESCE(p_recipe_data, jsonb_build_object('id', p_recipe_id)));

  RETURN jsonb_build_object('ok', true, 'is_favorite', true);
END;
$$;

COMMENT ON FUNCTION public.toggle_favorite_v2(uuid, uuid, jsonb) IS 'Toggle favorite; Free limit 7. Returns { ok, is_favorite } or { ok: false, code: favorites_limit_reached, limit: 7 }.';
