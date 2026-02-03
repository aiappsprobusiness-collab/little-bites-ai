-- Enums (идемпотентно: не падаем, если тип уже есть)
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.product_category AS ENUM ('vegetables', 'fruits', 'dairy', 'meat', 'grains', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User roles table (security best practice)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- User profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    telegram_chat_id TEXT,
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Children profiles table
CREATE TABLE IF NOT EXISTS public.children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    avatar_url TEXT,
    allergies TEXT[] DEFAULT '{}',
    preferences TEXT[] DEFAULT '{}',
    dislikes TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    cooking_time_minutes INTEGER,
    min_age_months INTEGER DEFAULT 6,
    max_age_months INTEGER DEFAULT 36,
    calories INTEGER,
    proteins DECIMAL(5,2),
    fats DECIMAL(5,2),
    carbs DECIMAL(5,2),
    is_favorite BOOLEAN DEFAULT false,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    times_cooked INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    source_products TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Recipe ingredients table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    amount DECIMAL(10,2),
    unit TEXT,
    category product_category DEFAULT 'other',
    order_index INTEGER DEFAULT 0
);

-- Recipe steps table
CREATE TABLE IF NOT EXISTS public.recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    duration_minutes INTEGER,
    image_url TEXT
);

-- Shopping lists table
CREATE TABLE IF NOT EXISTS public.shopping_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Список покупок',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shopping list items table
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopping_list_id UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE NOT NULL,
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    amount DECIMAL(10,2),
    unit TEXT,
    category product_category DEFAULT 'other',
    is_purchased BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Meal plans table
CREATE TABLE IF NOT EXISTS public.meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
    planned_date DATE NOT NULL,
    meal_type meal_type NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies (идемпотентно: DROP IF EXISTS перед CREATE)
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own children" ON public.children;
DROP POLICY IF EXISTS "Users can insert their own children" ON public.children;
DROP POLICY IF EXISTS "Users can update their own children" ON public.children;
DROP POLICY IF EXISTS "Users can delete their own children" ON public.children;
CREATE POLICY "Users can view their own children" ON public.children
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own children" ON public.children
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own children" ON public.children
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own children" ON public.children
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can insert their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;
CREATE POLICY "Users can view their own recipes" ON public.recipes
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recipes" ON public.recipes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own recipes" ON public.recipes
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recipes" ON public.recipes
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view ingredients of their recipes" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Users can insert ingredients to their recipes" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Users can update ingredients of their recipes" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Users can delete ingredients of their recipes" ON public.recipe_ingredients;
CREATE POLICY "Users can view ingredients of their recipes" ON public.recipe_ingredients
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can insert ingredients to their recipes" ON public.recipe_ingredients
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can update ingredients of their recipes" ON public.recipe_ingredients
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can delete ingredients of their recipes" ON public.recipe_ingredients
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view steps of their recipes" ON public.recipe_steps;
DROP POLICY IF EXISTS "Users can insert steps to their recipes" ON public.recipe_steps;
DROP POLICY IF EXISTS "Users can update steps of their recipes" ON public.recipe_steps;
DROP POLICY IF EXISTS "Users can delete steps of their recipes" ON public.recipe_steps;
CREATE POLICY "Users can view steps of their recipes" ON public.recipe_steps
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can insert steps to their recipes" ON public.recipe_steps
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can update steps of their recipes" ON public.recipe_steps
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));
CREATE POLICY "Users can delete steps of their recipes" ON public.recipe_steps
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view their own shopping lists" ON public.shopping_lists;
DROP POLICY IF EXISTS "Users can insert their own shopping lists" ON public.shopping_lists;
DROP POLICY IF EXISTS "Users can update their own shopping lists" ON public.shopping_lists;
DROP POLICY IF EXISTS "Users can delete their own shopping lists" ON public.shopping_lists;
CREATE POLICY "Users can view their own shopping lists" ON public.shopping_lists
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own shopping lists" ON public.shopping_lists
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own shopping lists" ON public.shopping_lists
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own shopping lists" ON public.shopping_lists
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view items of their lists" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users can insert items to their lists" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users can update items of their lists" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users can delete items of their lists" ON public.shopping_list_items;
CREATE POLICY "Users can view items of their lists" ON public.shopping_list_items
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.shopping_lists WHERE shopping_lists.id = shopping_list_id AND shopping_lists.user_id = auth.uid()
    ));
CREATE POLICY "Users can insert items to their lists" ON public.shopping_list_items
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.shopping_lists WHERE shopping_lists.id = shopping_list_id AND shopping_lists.user_id = auth.uid()
    ));
CREATE POLICY "Users can update items of their lists" ON public.shopping_list_items
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.shopping_lists WHERE shopping_lists.id = shopping_list_id AND shopping_lists.user_id = auth.uid()
    ));
CREATE POLICY "Users can delete items of their lists" ON public.shopping_list_items
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.shopping_lists WHERE shopping_lists.id = shopping_list_id AND shopping_lists.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view their own meal plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Users can insert their own meal plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Users can update their own meal plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Users can delete their own meal plans" ON public.meal_plans;
CREATE POLICY "Users can view their own meal plans" ON public.meal_plans
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own meal plans" ON public.meal_plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own meal plans" ON public.meal_plans
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own meal plans" ON public.meal_plans
    FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers (идемпотентно)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_children_updated_at ON public.children;
CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_recipes_updated_at ON public.recipes;
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_shopping_lists_updated_at ON public.shopping_lists;
CREATE TRIGGER update_shopping_lists_updated_at BEFORE UPDATE ON public.shopping_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile and role on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance (идемпотентно)
CREATE INDEX IF NOT EXISTS idx_children_user_id ON public.children(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON public.recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_child_id ON public.recipes(child_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON public.recipe_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON public.shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON public.shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON public.meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON public.meal_plans(planned_date);