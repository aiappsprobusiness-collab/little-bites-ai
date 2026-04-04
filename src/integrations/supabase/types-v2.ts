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

// v2: profiles schema — user_id FK auth.users, status, daily_limit, last_reset, premium_until, requests_today (легаси), trial_until, trial_used, trial_started_at, email, plan_initialized. Дневные лимиты чата в приложении — usage_events + get_usage_count_today.
export interface ProfilesV2Row {
  id: string;
  user_id: string;
  status: ProfileStatusV2;
  daily_limit: number;
  last_reset: string;
  premium_until: string | null;
  requests_today: number;
  trial_until: string | null;
  trial_used: boolean;
  trial_started_at: string | null;
  email: string | null;
  plan_initialized: boolean;
  /** Согласие с соглашением и политикой при регистрации */
  accepted_terms_at: string | null;
  accepted_terms_version: string | null;
  /** Последний выбранный член семьи в UI; NULL = семейный режим или не задано. */
  last_active_member_id: string | null;
  /** Ротирующиеся подсказки в поле ввода чата рецептов. */
  show_input_hints: boolean;
}
export interface ProfilesV2Insert {
  id?: string;
  user_id: string;
  status?: ProfileStatusV2;
  daily_limit?: number;
  last_reset?: string;
  premium_until?: string | null;
  requests_today?: number;
  trial_until?: string | null;
  trial_used?: boolean;
  trial_started_at?: string | null;
  email?: string | null;
  plan_initialized?: boolean;
  accepted_terms_at?: string | null;
  accepted_terms_version?: string | null;
  last_active_member_id?: string | null;
  show_input_hints?: boolean;
}
export interface ProfilesV2Update {
  id?: string;
  user_id?: string;
  status?: ProfileStatusV2;
  daily_limit?: number;
  last_reset?: string;
  premium_until?: string | null;
  requests_today?: number;
  trial_until?: string | null;
  trial_used?: boolean;
  trial_started_at?: string | null;
  email?: string | null;
  plan_initialized?: boolean;
  accepted_terms_at?: string | null;
  accepted_terms_version?: string | null;
  last_active_member_id?: string | null;
  show_input_hints?: boolean;
}

/** Один элемент аллергии (allergy_items в members). */
export interface AllergyItemRow {
  value: string;
  is_active: boolean;
  sort_order?: number;
}

// v2: members — family/child/adult profiles. Maps to domain Profile (id, role=type, name, age from age_months, allergies, preferences). difficulty: legacy DB column, unused in app.
export interface MembersRow {
  id: string;
  user_id: string;
  name: string;
  type: MemberTypeV2;
  age_months: number | null;
  /** Активные значения аллергий (для генерации/API). Источник: allergy_items с is_active или колонка allergies. */
  allergies: string[];
  /** Полный список с is_active (для UI и safe downgrade). Если пусто — берётся из allergies (все активны). */
  allergy_items?: AllergyItemRow[];
  /** Food/cooking preferences (legacy). UI uses likes/dislikes. */
  preferences: string[];
  /** What member likes (soft). Used for plan scoring. */
  likes: string[];
  /** What member dislikes / does not eat (hard). Excluded in auto-plan and chat. */
  dislikes: string[];
  /** Нормализованные ключи уже введённых продуктов для прикорма (<12 мес). */
  introduced_product_keys: string[];
  /** Текущий период введения одного продукта (2–3 дня), ключ как в `introduced_product_keys`. */
  introducing_product_key: string | null;
  /** Дата начала периода введения (YYYY-MM-DD). */
  introducing_started_at: string | null;
  /** Legacy DB column: easy | medium | any. Unused in app; kept for DB compat. */
  difficulty: string | null;
}
export interface MembersInsert {
  id?: string;
  user_id: string;
  name: string;
  type?: MemberTypeV2;
  age_months?: number | null;
  allergies?: string[];
  allergy_items?: AllergyItemRow[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
  introduced_product_keys?: string[];
  introducing_product_key?: string | null;
  introducing_started_at?: string | null;
  difficulty?: string | null;
}
export interface MembersUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  type?: MemberTypeV2;
  age_months?: number | null;
  allergies?: string[];
  allergy_items?: AllergyItemRow[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
  introduced_product_keys?: string[];
  introducing_product_key?: string | null;
  introducing_started_at?: string | null;
  difficulty?: string | null;
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

// v2: meal_plans_v2 — planned_date (date), meals (jsonb); member_id FK members
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

// v2: plate_logs — история «Анализ тарелки» (balance_check)
export interface PlateLogsRow {
  id: string;
  user_id: string;
  member_id: string | null;
  user_message: string;
  assistant_message: string;
  created_at: string;
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
