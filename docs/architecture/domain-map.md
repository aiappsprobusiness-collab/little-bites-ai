# Domain Map

Единая карта доменов приложения Mom Recipes / Little Bites AI. Основана на реальном коде, схеме БД, Edge Functions и миграциях. Для быстрого понимания архитектуры при возвращении к проекту.

---

## Project Overview

**Продукт:** приложение для семей с детьми: генерация рецептов под возраст и ограничения (аллергии, «не любят»), планирование питания на день/неделю, AI-чат для рецептов, контент и помощь («Мы рядом»).

**Для кого:** родители (free / trial / premium). Ограничения Free: 1 член семьи, 1 аллергия, лимиты по фичам (2/день chat_recipe, plan_fill_day, help). Premium/Trial: несколько членов, семейный режим в чате и плане, без лимитов по этим фичам.

**Ключевые сценарии:** регистрация → создание профиля ребёнка → генерация рецепта в чате → добавление в избранное/план → автозаполнение плана на день/неделю; trial/premium; шаринг рецепта или плана; аналитика и лимиты по usage_events.

---

## Core Domains

### Auth & User Profile

- **Назначение:** идентификация пользователя, профиль с тарифом и лимитами.
- **Таблицы:** `auth.users` (Supabase Auth), `public.profiles_v2` (status, daily_limit, premium_until, trial_*, plan_initialized, email). Триггер при регистрации создаёт строку в `profiles_v2`.
- **UI:** AuthPage (регистрация: обязательное согласие с `/terms` и `/privacy`), AuthCallbackPage, RootRedirect (/, /welcome, /prelogin), ProfilePage, SubscriptionCard.
- **Правовые тексты (единый контент):** `src/components/legal/TermsContent.tsx`, `PrivacyContent.tsx`, `SubscriptionContent.tsx` — см. `docs/dev/legal-copy-and-auth-consent.md`.
- **Edge/Services:** нет отдельной Edge для профиля; чтение/обновление через Supabase client. Trial: RPC start_trial, trial_on_signup_and_cancel.
- **Зависимости:** от профиля зависят subscription gating, лимиты, семейный режим (Premium/Trial).

### Subscription & Trial

- **Назначение:** тариф (free / trial / premium), срок премиума, лимиты запросов.
- **Таблицы:** `profiles_v2` (status, premium_until, trial_*, requests_today, last_reset), `subscriptions` (платежи Т-Банк; RLS service_role). Аудит плана: `subscription_plan_audit`.
- **UI:** Paywall (`Paywall.tsx` → по умолчанию `UnifiedPaywall`, legacy — `LegacyPaywall` при `VITE_FF_UNIFIED_PAYWALL=false`), SubscriptionCard, TrialSoftBanner, PaymentResult, create-payment flow. Единый копирайт и пункты ценности — `src/utils/unifiedPaywallCopy.ts`; контекстный legacy-текст — `src/utils/paywallReasonCopy.ts` (`paywall_reason` остаётся для аналитики). Социальное усиление / trial — в разметке paywall.
- **Edge:** `create-payment` (Init, сумма и `plan` из `_shared/subscriptionPricing.json`), `payment-webhook` (подпись Т-Банка, затем **сверка Amount с тарифом строки `subscriptions`** — без совпадения RPC не вызывается; идемпотентность по `status=confirmed` / `was_updated`). См. `docs/dev/PAYMENT_WEBHOOK_PREMIUM_VALIDATION.md`.
- **Зависимости:** все фичи с лимитами и gating смотрят на profiles_v2.status / premium_until / trial_*.

### Family Profiles / Members

- **Назначение:** члены семьи (ребёнок/взрослый/семья): имя, возраст, аллергии, likes, dislikes, preferences, difficulty.
- **Таблицы:** `public.members` (user_id, name, type, age_months, allergy_items, allergies (legacy), likes, dislikes, preferences, difficulty). Лимиты в приложении: Free — 1 член, 1 активная аллергия (normalize_allergies_for_free).
- **UI:** ProfilePage, ChildProfileEditPage, FamilyDashboard, MemberSelectorButton, AddChildForm, FamilyContext.
- **Edge/Services:** нет отдельной Edge; данные передаются в deepseek-chat и generate-plan в body (member_id, member_data). Контекст семьи на Edge пересобирается в deepseek-chat (buildFamilyGenerationContextBlock).
- **Зависимости:** чат и план используют members для промптов, фильтров пула, блокировки по аллергиям/dislikes.

### Chat Recipe Generation

- **Назначение:** генерация рецепта по запросу в чате с учётом профиля (возраст, аллергии, likes, dislikes), блокировка запроса при аллергене/dislike, сохранение рецепта в БД.
- **Таблицы:** запись в `recipes` (через RPC create_recipe_with_steps), `recipe_steps`, `recipe_ingredients`; чтение `chat_history` для anti-duplicate (последние recipe_id за 14 дней). Запись в `chat_history` — только с клиента (useDeepSeekAPI.saveChatMutation).
- **UI:** ChatPage, useDeepSeekAPI, useChatHistory, useChatRecipes.
- **Edge:** `deepseek-chat` (оркестратор index.ts, domain/policies, domain/family, domain/recipe_io, domain/meal; _shared: blockedTokens, allergyAliases, recipeCanonical, parsing, familyMode, familyContextBlock). Пишет usage_events (chat_recipe, help), token_usage_log, plate_logs (balance_check).
- **Зависимости:** members, profiles_v2 (лимиты, тариф), chat_history (чтение для anti-duplicate).

### Recipe Pool

- **Назначение:** пул рецептов пользователя для автозаполнения плана (source: seed, starter, manual, week_ai, chat_ai). Фильтрация по meal_type, is_soup (lunch = только супы), аллергиям, возрасту, предпочтениям.
- **Таблицы:** `recipes`, `recipe_ingredients`, `recipe_steps`. Выборка через RPC/запросы по user_id и source. Индексы для пула (миграции recipes_pool_*).
- **UI:** план использует пул через Edge generate-plan; клиент «Подобрать рецепт» использует recipePool.ts (pickRecipeFromPool, passesProfileFilter).
- **Edge:** `generate-plan`: fetchPoolCandidates, pickFromPool (mealType, soup-only для lunch, profile filter по аллергиям/возрасту/предпочтениям). _shared: allergens, familyPlan, planValidation, plan/familyDinnerFilter.
- **Зависимости:** members (фильтры), recipes.meal_type / recipes.is_soup (MEAL_TYPE_AND_LUNCH_SOUP).

### Favorites

- **Назначение:** избранные рецепты пользователя; в БД строки `favorites_v2` могут быть привязаны к `member_id`, на экране **Избранное** показывается объединённый список всех избранных пользователя. Лимиты: 5 (free) / 50 (premium) в приложении.
- **Таблицы:** `favorites_v2` (user_id, recipe_id, member_id, recipe_data — legacy/кэш). RPC toggle_favorite_v2, лимиты в приложении.
- **UI:** FavoritesPage, useFavorites, FavoriteCard, MyRecipeCard. Визуальная иерархия экрана коллекции и шапки: **docs/dev/favorites-tab-ui-quiet-2026-03.md**.
- **Edge/Services:** нет Edge; Supabase client и RPC.
- **Зависимости:** recipes, profiles_v2 (лимит по тарифу).

### Meal Planning

- **Назначение:** план питания на день/неделю по слотам (breakfast, lunch, snack, dinner). Одна запись на (user, member, date) в meal_plans_v2; слоты в JSONB meals. Автозаполнение через Edge generate-plan (пул + AI fallback).
- **Таблицы:** `meal_plans_v2` (user_id, member_id, planned_date, meals jsonb) — единственный SoT плана в production. RPC assign_recipe_to_plan_slot обновляет только `meal_plans_v2.meals`.
- **UI:** MealPlanPage, useMealPlans, useAssignRecipeToPlanSlot, usePlanGenerationJob, invokeGeneratePlan.
- **Edge:** `generate-plan` (start, run, cancel): plan_generation_jobs (insert/update), usage_events (plan_fill_day для free), запись в meal_plans_v2, создание рецептов через create_recipe_with_steps при AI fallback.
- **Зависимости:** members, recipe pool, profiles_v2 (лимит plan_fill_day), MEAL_TYPE_AND_LUNCH_SOUP (lunch = супы, assign не меняет recipes).

### Shopping / Ingredients

- **Назначение:** списки покупок по рецептам (ингредиенты с количеством, категорией). Items связаны с recipe_id, recipe_title. Список — **снимок** после явной сборки из плана; автоматической синхронизации с меню нет. В `shopping_lists.meta` хранится состояние последней сборки (last_synced_*, plan_signature) для спокойного статуса «в меню есть изменения» и пересборки по клику. Продуктовая модель: **docs/architecture/shopping_list_product_model.md**.
- **Агрегация и нормализация:** при сборе списка из плана ингредиенты нормализуются по имени и единицам, чтобы одинаковые продукты не дублировались (подробно: **docs/architecture/shopping_list_aggregation.md**). Модуль `src/utils/shopping/normalizeIngredientForShopping.ts`, хук usePlanShoppingIngredients, `loadPlanShoppingIngredients`.
- **Таблицы:** `shopping_lists` (в т.ч. meta для sync state), `shopping_list_items` (recipe_id, category product_category, meta: source_recipes, merge_key).
- **UI:** MealPlanPage («Собрать список продуктов» после блюд дня), BuildShoppingListFromPlanSheet, FavoritesPage (вторичная ссылка «Покупки» в строке фильтра по ингредиентам), ShoppingListView, RecipePage («Добавить в покупки»), useShoppingList, usePlanSignature.
- **Edge/Services:** нет Edge; Supabase client.
- **Зависимости:** recipes, recipe_ingredients, meal_plans_v2.

### Sharing / Viral Flow

- **Назначение:** короткие ссылки на рецепт (/r/:shareRef) и на план дня (/p/:ref); OG-превью для ботов; атрибуция (share_ref, entry_point, UTM).
- **Таблицы:** `share_refs` (share_ref, recipe_id), `shared_plans` (ref, user_id, member_id, payload jsonb). Запись share_refs с клиента (saveShareRef в usageEvents).
- **UI:** PublicRecipeSharePage (/r/:shareRef), SharedPlanPage (/p/:ref), шаринг рецепта в чате; план дня/недели — превью «Ваше меню» → системный share или копирование (`src/utils/shareMenuText.ts`, динамическое вступление дня — `getShareIntroText` в `src/utils/shareDayMenuText.ts`, MealPlanPage). Формат текстов шаринга: `docs/architecture/share_flows.md`.
- **Edge:** `share-og` (GET ?ref=shareRef → HTML с OG, редирект на /r/:shareRef), `share-og-plan` (GET ?ref=ref → OG для плана). track-usage-event для share_landing_view, share_click и др.
- **Зависимости:** recipes, meal_plans_v2; usage_events для вирусной аналитики.

### Analytics / Usage Tracking

- **Назначение:** лимиты Free (2/день на chat_recipe, plan_fill_day, help), воронка (auth, trial, purchase), токены AI, джобы генерации плана.
- **Таблицы:** `usage_events` (feature, user_id, anon_id, entry_point, utm, properties), `token_usage_log` (action_type, tokens), `plan_generation_jobs` (status, progress), `subscription_plan_audit`, `chat_history`, `plate_logs`.
- **UI:** события через trackUsageEvent / trackLandingEvent (usageEvents, landingAnalytics).
- **Edge:** `track-usage-event` (запись в usage_events от клиента); deepseek-chat пишет usage_events, token_usage_log, plate_logs; generate-plan пишет plan_generation_jobs и usage_events; payment-webhook пишет subscription_plan_audit.
- **Зависимости:** все домены, где есть события или лимиты.

### Payments

- **Назначение:** создание заказа (Т-Банк), вебхук подтверждения, обновление profiles_v2 и subscriptions. Premium не ставится без вебхука (см. decisions).
- **Таблицы:** `subscriptions`, `profiles_v2`, `subscription_plan_audit`.
- **UI:** create-payment flow, PaymentResult (success/fail).
- **Edge:** `create-payment`, `payment-webhook`.
- **Зависимости:** Subscription & Trial.

### Content / Articles

- **Назначение:** статьи по возрасту и премиуму (weaning, safety, nutrition). RLS: SELECT для authenticated.
- **Таблицы:** `articles` (title, content, category, is_premium, age_category).
- **UI:** ArticlesPage, ArticleReaderModal.
- **Edge/Services:** нет Edge; Supabase client.
- **Зависимости:** profiles_v2 (is_premium для доступа).

---

## Source of Truth by Domain

| Domain | Source of truth | Derived / cache / legacy |
|--------|-----------------|---------------------------|
| Subscription state | `profiles_v2.status`, `profiles_v2.premium_until`, `subscriptions` (подтверждённые платежи) | requests_today, last_reset — сброс по суткам |
| Family constraints | `members` (allergy_items, allergies, likes, dislikes, preferences, age_months) | allergy_items предпочтительнее allergies (legacy text[]) |
| Plan (день/неделя) | `meal_plans_v2` (одна строка на user, member, date; слоты в meals) | UI экспандит `meals` в плоские «ряды» по слотам для отображения |
| Recipe data | `recipes` + `recipe_steps` + `recipe_ingredients` | recipes.child_id — legacy, дублирует member_id; recipe_data в favorites_v2 — кэш/legacy; steps также в recipes.steps (jsonb) |
| Chat «что показать» | `chat_history` (пишет только клиент после ответа Edge) | Edge deepseek-chat только читает chat_history для anti-duplicate |
| Free limits | `usage_events` + RPC get_usage_count_today | Сутки по UTC |
| Share recipe | `share_refs` (share_ref → recipe_id) | Запись с клиента при шаринге |
| Share plan | `shared_plans` (ref, payload) | Запись с клиента |

Не обновлять subscription state из нескольких мест без вебхука; не писать chat_history с Edge; не менять recipes.meal_type / is_soup при assign_recipe_to_plan_slot.

---

## Domain Relationships

- **Members** влияют на промпты и фильтры в **Chat Recipe Generation** и **Meal Planning** (аллергии, возраст, dislikes, preferences). Контекст семьи в чате пересобирается на Edge (server-truth).
- **Recipes**, сгенерированные в чате (source chat_ai), попадают в **Recipe Pool** и используются при **Meal Planning** (fill day/week, replace_slot).
- **Recipe Pool** питает генерацию плана (generate-plan: fetchPoolCandidates → pickFromPool или AI fallback). Правила слота (lunch = супы) и meal_type/is_soup заданы в MEAL_TYPE_AND_LUNCH_SOUP.
- **Subscription state** (profiles_v2) ограничивает доступ к семейному режиму, лимитам (chat_recipe, plan_fill_day, help) и числу членов/аллергий в приложении.
- **Usage events** учитывают лимиты по фичам и используются аналитикой по воронке и вирусности (entry_point, share_ref, UTM).
- **Sharing** создаёт точки входа (share_landing_view, share_recipe_cta_click) и запись в share_refs / shared_plans.
- **Analytics** пересекает все основные домены (события с фронта и Edge).

---

## Main User Flows

### Flow: First user activation

1. Посещение / или /welcome (RootRedirect, LandingOnboardingScreen); атрибуция в onboarding_attribution.
2. Регистрация/вход (AuthPage → AuthCallbackPage); триггер создаёт profiles_v2; событие auth_success.
3. Создание первого члена семьи (AddChildForm → members); событие member_create_success.
4. Домены: Auth & User Profile, Family Profiles, Analytics.

### Flow: Generate recipe in chat

1. Выбор профиля или «Семья» (FamilyContext); сбор контекста (buildGenerationContext, derivePayloadFromContext).
2. Проверка блокировки на клиенте (`checkChatRequestAgainstProfile`); при блоке — сообщение без вызова API. На Edge — pre-check + **post-recipe allergy safety** (`chatRecipeAllergySafety`, тот же матч, что план). См. `docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md` §5, `docs/dev/CHAT_ALLERGY_GUARD.md`.
3. POST deepseek-chat (memberData, messages, generationContextBlock и др.); проверка лимита get_usage_count_today(chat_recipe); при лимите — 429.
4. Edge: policy block, сборка промпта, вызов модели, парсинг/валидация, create_recipe_with_steps, запись usage_events (chat_recipe).
5. Клиент: сохранение обмена в chat_history (saveChatMutation); отображение рецепта.
6. Домены: Chat Recipe Generation, Members, Subscription (лимиты), Recipe Pool (рецепт добавляется), Analytics. Ограничения Free: 2/день chat_recipe; семейный режим только Premium/Trial.

### Flow: Add recipe to favorites

1. Рецепт открыт (RecipePage, из Плана или Избранного) или выбран из чата. На экране рецепта — компактная панель действий (иконки): избранное, поделиться, в план. Порции меняются +/-; ингредиенты отображаются списком с пересчётом по порциям; заголовок «Ингредиенты (на X порцию/порции/порций)». Кнопки «В список» на экране рецепта нет: список продуктов формируется из плана (см. Shopping List).
2. useFavorites → toggle_favorite_v2 или Supabase insert/delete в favorites_v2; лимиты 5 (free) / 50 (premium) в приложении.
3. Домены: Favorites, Recipes, Subscription (лимит). Таблицы: favorites_v2.

### Flow: Fill meal plan for day/week

1. MealPlanPage: выбор члена семьи, даты; кнопка «Заполнить день» или «Заполнить неделю».
2. invokeGeneratePlan (action start → run): body member_id, member_data (аллергии, возраст и т.д.), type day|week. Edge создаёт job в plan_generation_jobs, fetchPoolCandidates, pickFromPool по слотам (lunch = только супы) или AI fallback, запись в meal_plans_v2, usage_events (plan_fill_day для free).
3. UI подписан на plan_generation_jobs и meal_plans_v2; обновление после завершения.
4. Домены: Meal Planning, Recipe Pool, Members, Subscription (лимит plan_fill_day), Analytics. Ограничения Free: 2/день plan_fill_day.

### Flow: Start trial / premium

1. Paywall (кнопка «Попробовать» или «Оформить»); trial: start_trial RPC → profiles_v2.trial_*; purchase: create-payment Edge → редирект на оплату.
2. После оплаты: Т-Банк вызывает payment-webhook; обновление subscriptions и profiles_v2 (status, premium_until); запись subscription_plan_audit.
3. Домены: Subscription & Trial, Payments, Analytics (trial_started, purchase_success).

### Flow: Share recipe or plan

1. Рецепт: генерация share_ref (или существующий), insert share_refs (saveShareRef); ссылка /r/:shareRef. План: создание shared_plans, ссылка /p/:ref.
2. Переход по ссылке: PublicRecipeSharePage (/r) → публичная страница рецепта, CTA → auth (signup); SharedPlanPage (/p) → отображение плана, CTA → welcome → auth. OG для ботов: share-og, share-og-plan Edge.
3. Атрибуция и события: share_landing_view, share_recipe_cta_click и др. через track-usage-event.
4. Домены: Sharing, Recipes / Meal Planning, Analytics.

---

## Cross-Cutting Concerns

- **Subscription gating:** проверки по profiles_v2.status и premium_until/trial_* в приложении и на Edge (deepseek-chat, generate-plan — лимиты, семейный режим). Не менять без учёта payment-webhook и profiles_v2.
- **Free limits:** фичи chat_recipe, plan_fill_day, help — 2/день; учёт через get_usage_count_today и запись в usage_events **только с Edge** (лимитные feature с клиента блокируются). Сутки UTC.
- **Analytics:** с фронта — track-usage-event (продуктовые события); Edge — лимиты + token/plate/jobs/audit. Таксономия и legacy mapping: `docs/decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md`. Нет внешней аналитической системы.
- **RLS:** доступ к данным по auth.uid(); subscriptions и subscription_plan_audit — service_role. share_refs/shared_plans — SELECT для anon по ref.
- **Legacy compatibility:** см. Known Legacy; при изменениях не ломать обратную совместимость с child_id, recipe_data.
- **Async generation jobs:** plan_generation_jobs для прогресса «Заполнить день/неделю»; отмена через action cancel.
- **AI token usage:** token_usage_log пишется из deepseek-chat (action_type: chat_recipe, plan_replace, sos_consultant, balance_check, other).

---

## Known Legacy / Dual Systems

### План питания: только meal_plans_v2

- **Production:** одна строка на (user_id, member_id, planned_date), слоты в JSONB `meals`. SoT для UI, generate-plan и `assign_recipe_to_plan_slot`.
- **Исторически:** таблица `meal_plans` (одна строка на слот) **удалена из production** и не используется; см. `docs/database/DATABASE_SCHEMA.md` → Legacy / Removed tables.
- **UI:** useMealPlans разворачивает `meals` в плоские ряды по слотам для отображения.

### child_id vs member_id

- **Старое:** child_id в recipes, chat_history (и др.).
- **Новое:** member_id в members, favorites_v2, meal_plans_v2, plan_generation_jobs и т.д. В recipes есть и child_id (legacy), и member_id.
- **Предпочтительно:** везде использовать member_id для привязки к члену семьи. child_id не удалён из схемы для обратной совместимости.
- **Риск:** рассинхронизация, если код пишет в один идентификатор, а читает из другого; в chat_history клиент передаёт child_id (семантика та же — контекст чата).

### allergies (text[]) vs allergy_items (jsonb)

- **Старое:** members.allergies (text[]).
- **Новое:** members.allergy_items (jsonb: value, is_active, sort_order). Free: активна только первая (normalize_allergies_for_free).
- **Предпочтительно:** allergy_items; фильтры и промпты строятся из активных allergy_items (и при необходимости из allergies для совместимости).
- **Риск:** два источника аллергий при непоследовательном чтении.

### recipes: cooking_time vs cooking_time_minutes, steps vs recipe_steps

- **Дубликаты:** cooking_time и cooking_time_minutes в минутах; steps (jsonb) и таблица recipe_steps. RPC create_recipe_with_steps пишет в обе структуры шагов.
- **Предпочтительно:** для новых полей не дублировать; шаги — единый источник в RPC, таблица recipe_steps и при необходимости recipes.steps синхронны через RPC.
- **Риск:** расхождение при ручном UPDATE только одной из колонок/таблиц.

### favorites_v2.recipe_data

- **Legacy/кэш:** recipe_data (jsonb) — кэш данных рецепта. После миграций recipe_id NOT NULL, основной источник — связь с recipes.
- **Предпочтительно:** использовать recipe_id и при необходимости подгружать рецепт из recipes. Не полагаться на recipe_data как единственный источник.
- **Риск:** устаревший кэш при изменении рецепта.

### servings_base legacy 5 vs 1

- **Старое:** в части рецептов servings_base = 5 (легаси), количества в БД приведены к этому.
- **Новое:** servings_base = 1, servings_recommended для UX. Миграции backfill и исправления outliers.
- **Предпочтительно:** новые рецепты с servings_base = 1. Не менять логику нормализации порций без учёта существующих данных.

---

## Architectural Risks

- **Дублирование source of truth:** subscription state должен обновляться только через payment-webhook и согласованные RPC (start_trial и т.д.). Chat history пишет только клиент.
- **Legacy-поля:** child_id, allergies, recipe_data, cooking_time — при изменениях не предполагать их отсутствие; не плодить новые дубликаты.
- **Высокая связность:** Members → Chat + Plan + Pool; изменение формата аллергий или возраста затрагивает deepseek-chat, generate-plan, клиент (buildPrompt, recipePool, useDeepSeekAPI). Единый словарь аллергенов/токенов (_shared/allergyAliases, blockedTokens; клиент allergenTokens).
- **Критичность Edge:** deepseek-chat и generate-plan — ядро продукта; падение или несовместимость контракта ломает чат и план. Лимиты и тариф проверяются и на Edge.
- **Free/premium:** ошибка в проверке status/trial/premium_until может открыть премиум-фичи или сломать лимиты. Проверки на клиенте и на Edge должны совпадать по смыслу.
- **Cursor:** при правках схемы — миграции и обновление DATABASE_SCHEMA.md; при правках чата/плана/аллергий — соответствующие canonical docs (CHAT_HISTORY_SOURCE_OF_TRUTH, chat_recipe_generation, MEAL_TYPE_AND_LUNCH_SOUP, ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH). Не менять assign_recipe_to_plan_slot так, чтобы он обновлял recipes.meal_type/is_soup.

---

## Rules for Future Changes

- Не менять subscription gating без проверки profiles_v2, subscriptions и payment-webhook (и subscription_plan_audit при отладке).
- Не менять поток плана питания без проверки meal_plans_v2, plan_generation_jobs, generate-plan Edge и UI (useMealPlans, assign_recipe_to_plan_slot). Учитывать правило «обед = только супы» и то, что assign не меняет рецепт.
- Не менять ограничения по членам семьи и аллергиям без проверки chat (buildPrompt, blockedTokens, useDeepSeekAPI) и generate-plan (pickFromPool, member_data). Держать в синхронизации _shared/allergyAliases и клиент allergenTokens.
- Не вводить новые source of truth для одних и тех же сущностей (например второй источник «кто владелец рецепта» кроме user_id/owner_user_id).
- Не добавлять новые документы в корень docs без категории (architecture, analytics, database, decisions, dev).
- При изменении схемы БД: только миграции в supabase/migrations/; обновлять docs/database/DATABASE_SCHEMA.md в той же задаче.
- При изменении области, описанной в каноническом документе (chat history, chat recipe generation, meal_type/lunch/soup, allergies/plan): обновлять соответствующий canonical doc в той же задаче.
