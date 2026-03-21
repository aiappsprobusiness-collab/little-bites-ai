# Change Safety Checklist

Safe change rules derived from [Domain Map](./domain-map.md). Use this checklist before modifying critical areas to avoid breaking the system.

---

## Changing Chat System

Before modifying chat or deepseek-chat:

**Check:**

- deepseek-chat Edge function (index.ts, domain/policies, domain/family, domain/recipe_io, domain/meal)
- _shared/blockedTokens (allergy/dislike blocking)
- _shared/allergyAliases (token dictionary; must stay in sync with client)
- recipe parsing and validation (recipeSchema, _shared/parsing, domain/recipe_io)
- create_recipe_with_steps RPC (payload, recipes + recipe_steps + recipe_ingredients)
- chat_history persistence (who writes, when)
- token_usage_log (action_type, written from deepseek-chat)
- usage_events limits (chat_recipe, help — 2/day free; written from Edge after success)
- Client: useDeepSeekAPI, useChatHistory, useChatRecipes, chatBlockedCheck / allergenTokens

**Never change:**

- chat_history write location (client only; Edge must not write to chat_history)
- allergy/dislike blocking logic without updating both client and Edge (keep allergyAliases and client allergenTokens in sync)

---

## Changing Meal Planning

Before modifying meal plan logic:

**Check:**

- meal_plans_v2 (source of truth: one row per user, member, date; slots in meals jsonb)
- plan_generation_jobs (status, progress, cancel)
- generate-plan Edge (start, run, cancel; fetchPoolCandidates, pickFromPool)
- recipe pool filtering (meal_type, is_soup, profile filters)
- lunch = soup rule (only soups in lunch slot for autofill and replace_slot)
- assign_recipe_to_plan_slot RPC (updates only meal_plans_v2.meals)
- useMealPlans, useAssignRecipeToPlanSlot, usePlanGenerationJob, invokeGeneratePlan
- usage_events plan_fill_day (2/day free)

**Never change:**

- recipes.meal_type or recipes.is_soup inside assign_recipe_to_plan_slot (RPC must not update recipes table)
- plan source of truth (meal_plans_v2); do not move SoT to another store without a full migration plan

---

## Changing Members / Family Profiles

Before modifying members or family logic:

**Check:**

- members table (allergy_items vs allergies legacy, likes, dislikes, preferences, age_months, difficulty)
- allergy_items (preferred) vs allergies (text[] legacy); normalize_allergies_for_free (Free: one active allergy)
- likes / dislikes (used in chat prompts and pool filtering)
- age rules (age categories, infant/toddler/school/adult; kid-safety 12–35 mo in family mode)
- Chat: buildPrompt, buildFamilyGenerationContextBlock (Edge), derivePayloadFromContext (client)
- Plan: generate-plan member_data, pickFromPool profile filter (passesProfileFilter, checkAllergyWithDetail)
- _shared: familyMode, familyContextBlock, allergens, memberAgeContext
- Client: FamilyContext, buildGenerationContext, recipePool passesProfileFilter

**Never change:**

- allergy/dislike token logic on one side only (Edge _shared/allergyAliases + blockedTokens and client allergenTokens must stay in sync)

---

## Changing Subscription System

Before modifying subscription or trial:

**Check:**

- profiles_v2 (status, premium_until, trial_*, requests_today, last_reset)
- subscriptions table (RLS service_role; updated only via payment-webhook)
- payment-webhook Edge (confirmation flow, updates profiles_v2 and subscriptions)
- subscription_plan_audit (written on real confirmation; for debugging plan detection)
- create-payment Edge (order creation)
- start_trial / trial_on_signup_and_cancel RPC
- get_usage_count_today (limits: chat_recipe, plan_fill_day, help — 2/day)
- Gating in app and Edge (deepseek-chat, generate-plan) that depend on status / premium_until / trial_*

**Never change:**

- Granting premium/trial access without webhook confirmation (or documented RPC for trial). Premium must not be set without payment-webhook (or explicit start_trial for trial).

---

## Changing Recipe System

Before modifying recipes or recipe-related logic:

**Check:**

- recipes (user_id, member_id/child_id legacy, source, meal_type, is_soup, servings_base, steps jsonb)
- recipe_ingredients (category, canonical_amount/unit, display_text)
- recipe_steps (and recipes.steps — RPC writes both; do not update only one)
- servings_base logic (legacy 5 vs 1; new recipes use 1; backfills exist)
- Pool filtering (source in seed/starter/manual/week_ai/chat_ai; meal_type, is_soup for lunch)
- favorites_v2 (recipe_id NOT NULL; recipe_data is legacy/cache — do not rely as sole source)
- create_recipe_with_steps RPC
- Client: useRecipes, useFavorites, recipePool

**Never change:**

- Introduce a second source of truth for recipe ownership (user_id / owner_user_id for user_custom). Do not update recipes.meal_type or recipes.is_soup from assign_recipe_to_plan_slot.

---

## Changing Analytics

Before modifying analytics or usage tracking:

**Check:**

- usage_events (feature, user_id, anon_id, entry_point, utm, properties); get_usage_count_today for limits
- token_usage_log (action_type, written from deepseek-chat)
- plan_generation_jobs (written from generate-plan; status, progress)
- share tracking (share_refs, shared_plans; share_landing_view, share_click, entry_point)
- trial flow analytics (trial_started, purchase_success, auth_success)
- track-usage-event Edge (client events); deepseek-chat and generate-plan writing usage_events
- docs/analytics/analytics-system.md for event list and funnel

**Never change:**

- Free limit counting (chat_recipe, plan_fill_day, help) without ensuring both Edge and get_usage_count_today stay consistent. Day boundary is UTC.

---

## Changing Database Schema

**Rules:**

- Always use migrations in `supabase/migrations/`. Never modify production tables manually.
- Never write schema-changing SQL outside migrations.
- After any schema change, update `docs/database/DATABASE_SCHEMA.md` in the same task.
- Before changing: read DATABASE_SCHEMA.md and existing migrations for the affected tables (RLS, FKs, legacy columns like child_id, allergies, recipe_data).

**Reference:** [Domain Map § Rules for Future Changes](./domain-map.md), [.cursor/rules/database.mdc](../../.cursor/rules/database.mdc).
