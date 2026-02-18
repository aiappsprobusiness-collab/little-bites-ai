-- plan_initialized: один раз при первом заходе во вкладку Plan автозаполняем 1 день (Free). Больше автогенерации нет.
ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS plan_initialized boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles_v2.plan_initialized IS 'true после первого автозаполнения дня при заходе в Plan (только для нового пользователя, один раз).';
