-- Stage 2.6: сигналы shared и signup_from_share в recipe_feedback и формуле recipes.score.
-- Пороги trust, clamp [-10,50], веса like/dislike/plan — без изменений; только расширение суммы.

-- 1) CHECK: новые action
ALTER TABLE public.recipe_feedback DROP CONSTRAINT IF EXISTS recipe_feedback_action_check;
ALTER TABLE public.recipe_feedback
  ADD CONSTRAINT recipe_feedback_action_check CHECK (
    action IN (
      'like',
      'dislike',
      'added_to_plan',
      'removed_from_plan',
      'replaced_in_plan',
      'shared',
      'signup_from_share'
    )
  );

COMMENT ON TABLE public.recipe_feedback IS
  'История событий качества рецепта: лайки, план, шаринг, регистрация по ссылке. Не upsert для план-событий; shared/signup — не более одной строки на (recipe_id, user_id) для данного action.';

-- 2) Анти-абьюз: один shared и один signup_from_share на пользователя на рецепт
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recipe_shared
  ON public.recipe_feedback (recipe_id, user_id)
  WHERE (action = 'shared');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_recipe_signup_from_share
  ON public.recipe_feedback (recipe_id, user_id)
  WHERE (action = 'signup_from_share');

-- 3) Пересчёт score: +1.5*shared +4*signup_from_share, затем clamp; trust — как в core/trusted/candidate
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
  v_shared int;
  v_signup int;
  v_total_votes int;
  v_score float;
  v_trust text;
  v_current_trust text;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE action = 'like'),
    COUNT(*) FILTER (WHERE action = 'dislike'),
    COUNT(*) FILTER (WHERE action = 'added_to_plan'),
    COUNT(*) FILTER (WHERE action = 'replaced_in_plan'),
    COUNT(*) FILTER (WHERE action = 'removed_from_plan'),
    COUNT(*) FILTER (WHERE action = 'shared'),
    COUNT(*) FILTER (WHERE action = 'signup_from_share')
  INTO v_likes, v_dislikes, v_added, v_replaced, v_removed, v_shared, v_signup
  FROM recipe_feedback
  WHERE recipe_id = p_recipe_id;

  v_total_votes := v_likes + v_dislikes;

  v_score := 2.0 * v_likes - 2.0 * v_dislikes
    + 1.0 * v_added - 0.5 * v_replaced - 0.5 * v_removed
    + 1.5 * v_shared + 4.0 * v_signup;

  v_score := GREATEST(-10.0, LEAST(50.0, v_score));

  SELECT trust_level INTO v_current_trust FROM recipes WHERE id = p_recipe_id;

  IF v_current_trust IN ('trusted', 'core') THEN
    UPDATE recipes SET score = v_score, updated_at = now() WHERE id = p_recipe_id;
    RETURN;
  END IF;

  IF v_current_trust = 'candidate' THEN
    IF v_score >= 8 AND v_likes >= 2 AND v_dislikes <= 1 THEN
      v_trust := 'trusted';
    ELSIF (v_dislikes >= 4 OR v_score <= -6) AND v_total_votes >= 3 THEN
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

COMMENT ON FUNCTION public.recompute_recipe_score_and_trust(uuid) IS
  'Score: +2*likes -2*dislikes +added -0.5*replaced -0.5*removed +1.5*shared +4*signup_from_share; clamp [-10,50]. trusted/core: только score. candidate: promoted/blocked по прежним правилам + cold start.';

-- 4) RPC: shared / signup_from_share (идемпотентно); остальное — прежняя логика
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

  IF p_action IS NULL OR p_action NOT IN (
    'like', 'dislike', 'added_to_plan', 'removed_from_plan', 'replaced_in_plan',
    'shared', 'signup_from_share'
  ) THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  IF p_action = 'shared' THEN
    IF EXISTS (
      SELECT 1 FROM public.recipe_feedback
      WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action = 'shared'
    ) THEN
      RETURN;
    END IF;
    INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
    VALUES (p_recipe_id, v_user_id, 'shared');
    RETURN;
  END IF;

  IF p_action = 'signup_from_share' THEN
    IF EXISTS (
      SELECT 1 FROM public.recipe_feedback
      WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action = 'signup_from_share'
    ) THEN
      RETURN;
    END IF;
    INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
    VALUES (p_recipe_id, v_user_id, 'signup_from_share');
    RETURN;
  END IF;

  IF p_action IN ('like', 'dislike') THEN
    SELECT action INTO v_current_vote
    FROM recipe_feedback
    WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action IN ('like', 'dislike')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_current_vote = p_action THEN
      RETURN;
    END IF;

    IF v_current_vote IS NOT NULL THEN
      DELETE FROM recipe_feedback
      WHERE recipe_id = p_recipe_id AND user_id = v_user_id AND action IN ('like', 'dislike');
    END IF;

    INSERT INTO public.recipe_feedback (recipe_id, user_id, action)
    VALUES (p_recipe_id, v_user_id, p_action);
    RETURN;
  END IF;

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

COMMENT ON FUNCTION public.record_recipe_feedback(uuid, text) IS
  'Like/dislike: один голос на пользователя (toggle). shared/signup_from_share: не более одной записи на (recipe_id,user_id). План-события — история (premium для replaced/removed). Score см. recompute_recipe_score_and_trust.';

-- 5) Пересчитать score для всех рецептов под новую формулу (без изменения порогов trust)
DO $$
DECLARE
  r_id uuid;
BEGIN
  FOR r_id IN SELECT id FROM public.recipes LOOP
    PERFORM public.recompute_recipe_score_and_trust(r_id);
  END LOOP;
END $$;
