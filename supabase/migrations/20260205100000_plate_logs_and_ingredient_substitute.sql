-- plate_logs: история «Анализа тарелки» (balance_check)
CREATE TABLE IF NOT EXISTS public.plate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  user_message text NOT NULL,
  assistant_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plate_logs_user_id ON public.plate_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_plate_logs_created_at ON public.plate_logs(created_at DESC);

ALTER TABLE public.plate_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own plate_logs" ON public.plate_logs;
CREATE POLICY "Users can view own plate_logs" ON public.plate_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own plate_logs" ON public.plate_logs;
CREATE POLICY "Users can insert own plate_logs" ON public.plate_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.plate_logs IS 'v2: история запросов «Анализ тарелки» (balance_check).';

-- recipe_ingredients.substitute: замена ингредиента (Premium Smart Swap)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipe_ingredients' AND column_name = 'substitute'
  ) THEN
    ALTER TABLE public.recipe_ingredients ADD COLUMN substitute text;
  END IF;
END $$;

COMMENT ON COLUMN public.recipe_ingredients.substitute IS 'v2: чем заменить ингредиент (Premium Smart Swap).';
