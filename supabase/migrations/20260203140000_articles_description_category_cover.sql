-- articles: добавить description, category (weaning|safety|nutrition), cover_image_url
-- Таблица уже создана в 20260203130000; только ALTER.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.articles.description IS 'Краткое описание статьи для карточки';
COMMENT ON COLUMN public.articles.category IS 'Категория: weaning, safety, nutrition';
COMMENT ON COLUMN public.articles.cover_image_url IS 'URL обложки статьи';

CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category) WHERE category IS NOT NULL;
