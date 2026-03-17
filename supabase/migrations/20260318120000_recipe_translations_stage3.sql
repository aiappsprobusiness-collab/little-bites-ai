-- Stage 3: recipe_translations — таблица переводов title/description/chef_advice по локали.
-- Чтение только через RPC get_recipe_previews / get_recipe_full (SECURITY DEFINER).
-- Без backfill: переводы заполняются отдельным процессом (импорт, админка, автоперевод).

CREATE TABLE IF NOT EXISTS public.recipe_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text,
  description text,
  chef_advice text,
  translation_status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_translations_recipe_locale_unique UNIQUE (recipe_id, locale),
  CONSTRAINT recipe_translations_translation_status_check CHECK (
    translation_status IN ('draft', 'auto_generated', 'reviewed')
  ),
  CONSTRAINT recipe_translations_source_check CHECK (
    source IN ('manual', 'ai', 'imported')
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_translations_recipe_id_locale
  ON public.recipe_translations (recipe_id, locale);

COMMENT ON TABLE public.recipe_translations IS 'Translations of recipe title, description, chef_advice per locale. Read via get_recipe_previews/get_recipe_full with p_locale; fallback to recipes.* when missing.';

-- updated_at trigger (reuse existing helper)
DROP TRIGGER IF EXISTS update_recipe_translations_updated_at ON public.recipe_translations;
CREATE TRIGGER update_recipe_translations_updated_at
  BEFORE UPDATE ON public.recipe_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: чтение только через RPC (definer). Прямой SELECT от authenticated/anon не разрешаем.
ALTER TABLE public.recipe_translations ENABLE ROW LEVEL SECURITY;

-- Никаких SELECT-политик для anon/authenticated — доступ к строкам только у владельца функции (SECURITY DEFINER).
-- При необходимости позже можно добавить INSERT/UPDATE/DELETE для владельца рецепта.
