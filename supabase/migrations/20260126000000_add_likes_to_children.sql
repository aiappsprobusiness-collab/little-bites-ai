-- Add likes field to children table
ALTER TABLE public.children 
ADD COLUMN IF NOT EXISTS likes TEXT[] DEFAULT '{}';

-- Update existing rows to have empty array if null
UPDATE public.children 
SET likes = '{}' 
WHERE likes IS NULL;
