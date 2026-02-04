/**
 * v2: types for new Supabase tables (profiles_v2, members, favorites_v2, meal_plans_v2).
 * Use these when migrating UI to v2 schema. No automatic data migration — tables only.
 *
 * Limits (enforce in app / Edge Function):
 * - profiles_v2: daily_limit 5 (free) or 30 (premium/trial); last_reset for daily cap.
 * - favorites_v2: 5 (free) / 50 (premium) — no hard block in frontend yet, types/comments only.
 */

export type ProfileStatusV2 = "free" | "premium" | "trial";
export type MemberTypeV2 = "child" | "adult" | "family";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// v2: profiles schema — user_id FK auth.users, status, daily_limit, last_reset, premium_until, requests_today
export interface ProfilesV2Row {
  id: string;
  user_id: string;
  status: ProfileStatusV2;
  daily_limit: number;
  last_reset: string;
  premium_until: string | null;
  requests_today: number;
}
export interface ProfilesV2Insert {
  id?: string;
  user_id: string;
  status?: ProfileStatusV2;
  daily_limit?: number;
  last_reset?: string;
  premium_until?: string | null;
  requests_today?: number;
}
export interface ProfilesV2Update {
  id?: string;
  user_id?: string;
  status?: ProfileStatusV2;
  daily_limit?: number;
  last_reset?: string;
  premium_until?: string | null;
  requests_today?: number;
}

// v2: members — name, type, age_months, allergies
export interface MembersRow {
  id: string;
  user_id: string;
  name: string;
  type: MemberTypeV2;
  age_months: number | null;
  allergies: string[];
}
export interface MembersInsert {
  id?: string;
  user_id: string;
  name: string;
  type?: MemberTypeV2;
  age_months?: number | null;
  allergies?: string[];
}
export interface MembersUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  type?: MemberTypeV2;
  age_months?: number | null;
  allergies?: string[];
}

// v2: favorites — recipe_data jsonb; limit 5 (free) / 50 (premium). created_at добавлен миграцией 20260203160000.
export interface FavoritesV2Row {
  id: string;
  user_id: string;
  recipe_data: Json;
  created_at?: string;
}
export interface FavoritesV2Insert {
  id?: string;
  user_id: string;
  recipe_data?: Json;
}
export interface FavoritesV2Update {
  id?: string;
  user_id?: string;
  recipe_data?: Json;
}

// v2: meal_plans — planned_date (date), meals (jsonb); member_id FK members
export interface MealPlansV2Row {
  id: string;
  user_id: string;
  member_id: string | null;
  planned_date: string;
  meals: Json;
}
export interface MealPlansV2Insert {
  id?: string;
  user_id: string;
  member_id?: string | null;
  planned_date: string;
  meals?: Json;
}
export interface MealPlansV2Update {
  id?: string;
  user_id?: string;
  member_id?: string | null;
  planned_date?: string;
  meals?: Json;
}

// v2: articles — контент в стиле Flo (id, title, description, content, category, is_premium, cover_image_url)
export type AgeCategoryV2 = "infant" | "toddler" | "school" | "adult";
export type ArticleCategoryV2 = "weaning" | "safety" | "nutrition";

export interface ArticlesRow {
  id: string;
  title: string;
  description: string;
  content: string;
  category: ArticleCategoryV2 | null;
  is_premium: boolean;
  cover_image_url: string | null;
  age_category: string | null;
}
export interface ArticlesInsert {
  id?: string;
  title: string;
  description?: string;
  content?: string;
  category?: ArticleCategoryV2 | null;
  is_premium?: boolean;
  cover_image_url?: string | null;
  age_category?: string | null;
}
export interface ArticlesUpdate {
  id?: string;
  title?: string;
  description?: string;
  content?: string;
  category?: ArticleCategoryV2 | null;
  is_premium?: boolean;
  cover_image_url?: string | null;
  age_category?: string | null;
}
