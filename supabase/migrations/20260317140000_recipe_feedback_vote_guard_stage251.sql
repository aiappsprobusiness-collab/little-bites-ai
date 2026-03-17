-- Stage 2.5.1: one vote per user (like/dislike), softened scoring, conservative trust thresholds.
-- Plan events (added_to_plan, removed_from_plan, replaced_in_plan) unchanged — history only.

-- 1) RPC: текущий голос пользователя по рецепту (для UI)
CREATE OR REPLACE FUNCTION public.get_recipe_my_vote(p_recipe_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT action INTO v_action
  FROM recipe_feedback
  WHERE recipe_id = p_recipe_id
    AND user_id = auth.uid()
    AND action IN ('like', 'dislike')
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN v_action;
END;
$$;

COMMENT ON FUNCTION public.get_recipe_my_vote(uuid) IS 'Текущий голос текущего пользователя по рецепту: like, dislike или NULL.';

-- 2) Триггер при DELETE: пересчитать score/trust (для toggle like↔dislike)
CREATE OR REPLACE FUNCTION public.recipe_feedback_after_delete_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recompute_recipe_score_and_trust(OLD.recipe_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS recipe_feedback_after_delete_trigger ON public.recipe_feedback;
CREATE TRIGGER recipe_feedback_after_delete_trigger
  AFTER DELETE ON public.recipe_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.recipe_feedback_after_delete_trigger_fn();

-- 3) Новая формула score и пороги trust в recompute_recipe_score_and_trust
-- score = +2*likes -2*dislikes +1*added_to_plan -0.5*replaced_in_plan -0.5*removed_from_plan
-- trusted: score >= 8 AND likes >= 2 AND dislikes <= 1
-- blocked: dislikes >= 4 OR score <= -6
CREATE OR REPLACE FUNCTION public.recompute_recipe_score_and_trust(p_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_likes int;
  v_dislikes int;
  v_added int;
  v_replaced int;
  v_removed int;
  v_score float;
  v_trust text;
  v_current_trust text;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE action = 'like'),
    COUNT(*) FILTER (WHERE action = 'dislike'),
    COUNT(*) FILTER (WHERE action = 'added_to_plan'),
    COUNT(*) FILTER (WHERE action = 'replaced_in_plan'),
    COUNT(*) FILTER (WHERE action = 'removed_from_plan')
  INTO v_likes, v_dislikes, v_added, v_replaced, v_removed
  FROM recipe_feedback
  WHERE recipe_id = p_recipe_id;

  v_score := 2.0 * v_likes - 2.0 * v_dislikes
    + 1.0 * v_added - 0.5 * v_replaced - 0.5 * v_removed;

  SELECT trust_level INTO v_current_trust FROM recipes WHERE id = p_recipe_id;

  IF v_current_trust = 'candidate' THEN
    IF v_score >= 8 AND v_likes >= 2 AND v_dislikes <= 1 THEN
      v_trust := 'trusted';
    ELSIF v_dislikes >= 4 OR v_score <= -6 THEN
      v_trust := 'blocked';
    ELSE
      v_trust := 'candidate';
    END IF;
    UPDATE recipes SET score = v_score, trust_level = v_trust, updated_at = now() WHERE id = p_recipe_id;
  ELSE
    UPDATE recipes SET score = v_score, updated_at = now() WHERE id = p_recipe_id;
  END IF;
END;
$$;

-- 4) record_recipe_feedback: для like/dislike — один активный голос на (recipe_id, user_id)
-- Тот же голос повторно → no-op. Противоположный → удалить старый, вставить новый. План-события без изменений.
CREATE OR REPLACE FUNCTION public.record_recipe_feedback(p_recipe_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_current_vote text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('like', 'dislike', 'added_to_plan', 'removed_from_plan', 'replaced_in_plan') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  -- Like/dislike: один голос на пользователя — guard и toggle
  IF p_action IN ('like', 'dislike') THEN
    SELECT action INTO v_current_vote
    FROM recipe_feedback
    WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action IN ('like', 'dislike')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_current_vote = p_action THEN
      RETURN; /* повторный тот же голос — ничего не делаем */
    END IF;

    IF v_current_vote IS NOT NULL THEN
      /* переключение: удалить старый голос, затем вставить новый */
      DELETE FROM recipe_feedback
      WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action IN ('like', 'dislike');
    END IF;

    INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
    VALUES (p_recipe_id, v_user_id, p_action);
    RETURN;
  END IF;

  /* План-события: без изменений (история) */
  IF p_action IN ('removed_from_plan', 'replaced_in_plan') THEN
    SELECT status INTO v_status FROM profiles_v2 WHERE user_id = v_user_id LIMIT 1;
    IF v_status IS NULL OR v_status = 'free' THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
  VALUES (p_recipe_id, v_user_id, p_action);
END;
$$;

COMMENT ON FUNCTION public.record_recipe_feedback(uuid, text) IS 'Like/dislike: один голос на пользователя (toggle). Повторный тот же голос — no-op. План-события — история. Score: +2*likes -2*dislikes +1*added -0.5*replaced -0.5*removed.';
