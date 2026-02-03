-- v2: new tables (do not drop or alter existing tables).
-- profiles_v2: user subscription and daily limits; FK to auth.users.
-- members: family/child/adult profiles; FK to auth.users.
-- favorites_v2: recipe_data jsonb; limit 5 (free) / 50 (premium) enforced in app.
-- meal_plans_v2: planned_date + meals jsonb; FK to auth.users and members.

-- Enums for v2
CREATE TYPE public.profile_status_v2 AS ENUM ('free', 'premium', 'trial');
CREATE TYPE public.member_type_v2 AS ENUM ('child', 'adult', 'family');

-- profiles_v2: id, user_id (FK auth.users), status, daily_limit, last_reset. Trial = 7 days, Premium features.
CREATE TABLE public.profiles_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.profile_status_v2 NOT NULL DEFAULT 'free'::public.profile_status_v2,
  daily_limit integer NOT NULL DEFAULT 5 CHECK (daily_limit > 0 AND daily_limit <= 100),
  last_reset timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_v2_user_id ON public.profiles_v2(user_id);
CREATE INDEX idx_profiles_v2_status ON public.profiles_v2(status);

COMMENT ON TABLE public.profiles_v2 IS 'v2: subscription and daily usage; daily_limit 5 (free) or 30 (premium/trial). last_reset for daily cap.';

-- members: id, user_id (FK), name, type (child/adult/family), age_months, allergies. Premium/trial: likes, dislikes.
CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.member_type_v2 NOT NULL DEFAULT 'child'::public.member_type_v2,
  age_months integer,
  allergies text[] DEFAULT '{}',
  likes text[] DEFAULT '{}',
  dislikes text[] DEFAULT '{}'
);

CREATE INDEX idx_members_user_id ON public.members(user_id);
CREATE INDEX idx_members_type ON public.members(type);

COMMENT ON TABLE public.members IS 'v2: family members; for premium/trial likes/dislikes are used. Free: 1 member, 1 allergy max (enforced in app).';

-- favorites_v2: id, user_id (FK), recipe_data (jsonb). Limit 5 (free) / 50 (premium) enforced in app.
CREATE TABLE public.favorites_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_data jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_favorites_v2_user_id ON public.favorites_v2(user_id);

COMMENT ON TABLE public.favorites_v2 IS 'v2: saved recipes; limit 5 (free) / 50 (premium) — enforce in app.';

-- meal_plans_v2: id, user_id (FK), member_id (FK members), planned_date, meals (jsonb). Cascade on user/member delete.
CREATE TABLE public.meal_plans_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  meals jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_meal_plans_v2_user_id ON public.meal_plans_v2(user_id);
CREATE INDEX idx_meal_plans_v2_member_id ON public.meal_plans_v2(member_id);
CREATE INDEX idx_meal_plans_v2_planned_date ON public.meal_plans_v2(planned_date);

COMMENT ON TABLE public.meal_plans_v2 IS 'v2: daily meal plan; meals jsonb holds structure per day (e.g. breakfast, lunch, snack, dinner).';

-- RLS: enable and policy placeholder (optional; can be tightened per app)
ALTER TABLE public.profiles_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_v2_user" ON public.profiles_v2 FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_user" ON public.members FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_v2_user" ON public.favorites_v2 FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_plans_v2_user" ON public.meal_plans_v2 FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
