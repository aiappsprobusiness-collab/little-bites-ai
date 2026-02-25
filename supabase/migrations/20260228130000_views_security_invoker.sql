-- Fix "Security Definer View" warnings: make views run with invoker's permissions (RLS respected).
-- PostgreSQL 15+: SET (security_invoker = true) so access checks use the querying user, not the view owner.

ALTER VIEW public.recipes_quality_report SET (security_invoker = true);
ALTER VIEW public.recipes_dedupe_candidates_preview SET (security_invoker = true);

-- recipes_cleanup_preview may exist in DB (e.g. created manually or by another tool); alter only if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'recipes_cleanup_preview'
  ) THEN
    EXECUTE 'ALTER VIEW public.recipes_cleanup_preview SET (security_invoker = true)';
  END IF;
END;
$$;
