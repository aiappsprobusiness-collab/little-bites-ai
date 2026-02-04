-- Удаление полей «любит»/«не любит» из таблицы members.
ALTER TABLE public.members DROP COLUMN IF EXISTS likes;
ALTER TABLE public.members DROP COLUMN IF EXISTS dislikes;
COMMENT ON TABLE public.members IS 'v2: family members (name, type, age_months, allergies).';
