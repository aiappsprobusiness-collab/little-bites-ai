-- Set default 'easy' for members.difficulty (backward compatible).
ALTER TABLE public.members ALTER COLUMN difficulty SET DEFAULT 'easy';
