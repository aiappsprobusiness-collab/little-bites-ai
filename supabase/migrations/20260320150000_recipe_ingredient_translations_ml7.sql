-- ML-7: recipe_ingredient_translations — per-recipe overlay переводов ингредиентов по локали.
-- Чтение только через RPC get_recipe_full (SECURITY DEFINER). Прямой SELECT для anon/authenticated не даём.

CREATE TABLE IF NOT EXISTS public.recipe_ingredient_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_ingredient_id uuid NOT NULL REFERENCES public.recipe_ingredients(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text,
  display_text text,
  translation_status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_ingredient_translations_ingredient_locale_unique UNIQUE (recipe_ingredient_id, locale),
  CONSTRAINT recipe_ingredient_translations_translation_status_check CHECK (
    translation_status IN ('draft', 'auto_generated', 'reviewed')
  ),
  CONSTRAINT recipe_ingredient_translations_source_check CHECK (
    source IN ('manual', 'ai', 'imported')
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_translations_ingredient_id_locale
  ON public.recipe_ingredient_translations (recipe_ingredient_id, locale);

COMMENT ON TABLE public.recipe_ingredient_translations IS 'ML-7: Per-recipe overlay translations for recipe_ingredients name/display_text per locale. Read via get_recipe_full with p_locale; fallback to recipe_ingredients when missing.';

DROP TRIGGER IF EXISTS update_recipe_ingredient_translations_updated_at ON public.recipe_ingredient_translations;
CREATE TRIGGER update_recipe_ingredient_translations_updated_at
  BEFORE UPDATE ON public.recipe_ingredient_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.recipe_ingredient_translations ENABLE ROW LEVEL SECURITY;

-- Никаких SELECT-политик для anon/authenticated — доступ только через SECURITY DEFINER RPC.
