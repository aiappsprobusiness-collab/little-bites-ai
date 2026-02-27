-- Отзыв доступа anon к диагностическим/аудит view. Они нужны только для ручной проверки
-- и отладки (SQL в дашборде или под service_role). Приложению и Edge они не нужны.
-- recipes_og_preview НЕ трогаем — он нужен для Netlify Edge (OG превью по anon key).

REVOKE SELECT ON public.ingredients_category_audit FROM anon;
REVOKE SELECT ON public.ingredients_category_audit_top_other FROM anon;
REVOKE SELECT ON public.ingredients_category_audit_meat_like_other FROM anon;
REVOKE SELECT ON public.ingredients_category_audit_veg_like_other FROM anon;
REVOKE SELECT ON public.recipes_outlier_ingredients_diagnostic FROM anon;
