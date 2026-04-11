-- Счётчик переходов по /go/:slug для строк из marketing_links.

ALTER TABLE public.marketing_links
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_marketing_link_clicks(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketing_links
  SET click_count = click_count + 1
  WHERE slug = trim(p_slug);
END;
$$;

COMMENT ON FUNCTION public.increment_marketing_link_clicks(text) IS 'Публичный инкремент счётчика кликов по slug; вызывается с клиента при редиректе /go/:slug.';

GRANT EXECUTE ON FUNCTION public.increment_marketing_link_clicks(text) TO anon, authenticated;
