-- ML-7: recipe_step_translations — переводы шагов по локали.
-- Чтение только через RPC get_recipe_full (SECURITY DEFINER). Прямой SELECT для anon/authenticated не даём.

CREATE TABLE IF NOT EXISTS public.recipe_step_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_step_id uuid NOT NULL REFERENCES public.recipe_steps(id) ON DELETE CASCADE,
  locale text NOT NULL,
  instruction text,
  translation_status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_step_translations_step_locale_unique UNIQUE (recipe_step_id, locale),
  CONSTRAINT recipe_step_translations_translation_status_check CHECK (
    translation_status IN ('draft', 'auto_generated', 'reviewed')
  ),
  CONSTRAINT recipe_step_translations_source_check CHECK (
    source IN ('manual', 'ai', 'imported')
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_step_translations_step_id_locale
  ON public.recipe_step_translations (recipe_step_id, locale);

COMMENT ON TABLE public.recipe_step_translations IS 'ML-7: Translations of recipe_steps.instruction per locale. Read via get_recipe_full with p_locale; fallback to recipe_steps.instruction when missing.';

DROP TRIGGER IF EXISTS update_recipe_step_translations_updated_at ON public.recipe_step_translations;
CREATE TRIGGER update_recipe_step_translations_updated_at
  BEFORE UPDATE ON public.recipe_step_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.recipe_step_translations ENABLE ROW LEVEL SECURITY;

-- Никаких SELECT-политик для anon/authenticated — доступ только через SECURITY DEFINER RPC.
