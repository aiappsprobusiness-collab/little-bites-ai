-- Stage 2.5.3: cold start protection — do not auto-block candidate with fewer than 3 votes (like+dislike).
-- Score still computed; only blocked logic is skipped when total_votes < 3.

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
    COUNT(*) FILTER (WHERE action = 'removed_from_plan')
  INTO v_likes, v_dislikes, v_added, v_replaced, v_removed
  FROM recipe_feedback
  WHERE recipe_id = p_recipe_id;

  v_total_votes := v_likes + v_dislikes;

  v_score := 2.0 * v_likes - 2.0 * v_dislikes
    + 1.0 * v_added - 0.5 * v_replaced - 0.5 * v_removed;

  v_score := GREATEST(-10.0, LEAST(50.0, v_score));

  SELECT trust_level INTO v_current_trust FROM recipes WHERE id = p_recipe_id;

  -- Trusted recipes MUST NOT auto-fall to blocked. Only score is updated; manual block still possible via UPDATE.
  IF v_current_trust = 'trusted' THEN
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

COMMENT ON FUNCTION public.recompute_recipe_score_and_trust(uuid) IS 'Score clamp [-10,50]. Trusted: only score updated, never auto-blocked. Candidate: promoted to trusted or blocked by rules; cold start: do not block if total_votes (like+dislike) < 3. Manual UPDATE trust_level still valid.';
