-- Create favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS favorites_created_at_idx ON public.favorites(created_at DESC);

-- RLS Policies for favorites
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites" ON public.favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites" ON public.favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites" ON public.favorites
    FOR DELETE USING (auth.uid() = user_id);
