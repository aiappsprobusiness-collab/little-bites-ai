-- RLS для allergy audit views: запросы выполняются с правами вызывающего.
ALTER VIEW public.recipes_allergy_tokens_audit SET (security_invoker = true);
ALTER VIEW public.meal_plans_v2_allergy_violations_audit SET (security_invoker = true);
