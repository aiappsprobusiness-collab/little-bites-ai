# Analytics System

**Аудит (снимок кода и схемы):** [analytics_system_audit_2026-03-30.md](../audits/analytics_system_audit_2026-03-30.md) — полная карта событий, риски и расхождения docs vs реализация.

**Контракт клиент / Edge (лимитные feature, dedup, attribution):** [USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md](../decisions/USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md).

**Каноническая taxonomy, legacy mapping, CTA/funnel/share/paywall:** [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md) (Stage 2 source of truth по смыслу событий).

**Продуктовый аналитический слой (Stage 3):** [product-metrics-layer.md](./product-metrics-layer.md) — view `analytics.usage_events_enriched`, воронки, KPI, gaps. **Готовые SQL:** [sql/README.md](./sql/README.md).

**Stage 4 (retention, когорты, growth):** [retention-and-cohorts.md](./retention-and-cohorts.md) — определения, ограничения, SQL в [sql/](./sql/) (без новых миграций).

**Stage 5 (telemetry):** [STAGE5_TELEMETRY_ADDITIONS.md](../decisions/STAGE5_TELEMETRY_ADDITIONS.md) — `recipe_view`, `share_link_created`, replace attempt/fail, `platform` в payload; миграция view `analytics.usage_events_enriched`.

**Stage 6 (dashboards):** [dashboard-pack.md](./dashboard-pack.md) — набор дашбордов и SQL `docs/analytics/sql/dashboard_*.sql` без изменений схемы БД.

## Overview

Аналитика в проекте Little Bites строится на **событиях в Supabase**: таблицы `usage_events`, `token_usage_log`, `subscription_plan_audit`, `plan_generation_jobs`, а также вспомогательные таблицы `chat_history`, `plate_logs`, `share_refs`. События пишутся с **фронтенда** (через Edge Function `track-usage-event` и напрямую в часть таблиц) и с **Edge Functions** (deepseek-chat, generate-plan, payment-webhook). Отдельной внешней продуктовой аналитики (Amplitude/Mixpanel и т.п.) в коде нет — всё хранится в БД.

**Рекламный счётчик (VK Ads / Top.Mail.Ru):** в `index.html` основной сниппет Top.Mail.Ru (`_tmr`, id счётчика в константе `src/constants/topMailRuCounter.ts`) стоит в **`<head>`**; fallback `<noscript>` с `<img>` — в **`body`** (в `<head>` внутри `<noscript>` нельзя размещать `img` по правилам HTML5). Первый `pageView` уходит при загрузке документа; при навигации в SPA (`BrowserRouter`) компонент `TopMailRuSpaPageView` в `src/App.tsx` дополнительно пушит `pageView` в `window._tmr` при смене пути (без дубля на первом экране — он уже учтён сниппетом в HTML). Данные счётчика живут у VK/Mail.ru, не в Supabase.

**Цель «успешная регистрация» (URL в кабинете VK Ads):** стабильный путь **`/auth/signup-success`** (константа `AUTH_SIGNUP_SUCCESS_PATH` в `src/constants/authSignupSuccess.ts`; на проде: `https://momrecipes.online/auth/signup-success`). Пользователь попадает сюда после успешной отправки формы регистрации на `/auth` (`AuthPage`). Если Supabase сразу выдал сессию (без ожидания письма), этот экран кратко показывается и редиректит на `/`. Подтверждение email по ссылке из письма по-прежнему обрабатывается на `/auth/callback` → дальше в приложение; отдельная цель «подтвердил почту» этим URL не покрывается.

Основные цели текущей реализации:
- **Лимиты по фичам**: учёт по `usage_events` и RPC `get_usage_count_today` (сутки UTC). **Free:** `chat_recipe` и `help` — 2/день каждая. **Premium/Trial:** те же фичи для **скрытых** продуктовых лимитов **20/день** (чат-рецепт и «Помощь маме»); пороги в `src/utils/subscriptionRules.ts` и зеркале Edge `supabase/functions/_shared/subscriptionLimits.ts`.
- **Trial/Premium flow**: события auth, paywall, trial_started, purchase_*.
- **Вирусность**: атрибуция по share_ref, entry_point, UTM; короткие ссылки `/r/:shareRef`.
- **Telegram onboarding bot (финальная CTA):** после превью меню бот шлёт одну кнопку «Открыть приложение» с URL на **`/auth`** и query **`mode=signup`**, **`entry_point=telegram`**, UTM по умолчанию **`utm_source=telegram`**, **`utm_medium=onboarding_bot`**, **`utm_content=menu_day_final`** (если в deep-link `/start` не заданы свои — см. `buildTelegramOnboardingFinalAuthUrl` в `supabase/functions/telegram-onboarding/cta.ts`). Ответы опроса в URL **не** передаются. На клиенте `captureAttributionFromLocationOnce()` сохраняет параметры в `localStorage` для последующих событий. Документация сценария: `docs/dev/TELEGRAM_ONBOARDING_BOT.md`.
- **AI usage**: токены по типам действий в `token_usage_log`.
- **Генерация плана**: джобы и статусы в `plan_generation_jobs`.

---

## Data Sources

Все места, где происходит запись аналитики.

### 1. Edge Function `track-usage-event`

| Параметр | Описание |
|----------|----------|
| **Файл** | `supabase/functions/track-usage-event/index.ts` |
| **Таблица** | `usage_events` |
| **Вызов** | POST с фронта через `trackUsageEvent()` / `trackLandingEvent()` из `src/utils/usageEvents.ts`, `src/utils/landingAnalytics.ts` |

**Поля при insert:**
- `user_id` — из JWT (или `null` для анонимов)
- `member_id` — из body
- `feature` — строка события (см. Product Events)
- `anon_id`, `session_id` — с клиента
- `page` — pathname
- `entry_point` — из body (например `share_recipe`)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `properties` — jsonb из body (recipe_id, share_ref, channel и т.д.)

**Защита от подмены лимитов:** значения `chat_recipe`, `help`, `plan_fill_day`, `plan_refresh` **отклоняются** (не пишутся в БД). Список в `supabase/functions/_shared/trackUsageClientPolicy.ts` (зеркало: `src/utils/trackUsageClientPolicy.ts`). См. [USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md](../decisions/USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md).

**Когда вызывается:** при любом вызове `trackUsageEvent(feature, options)` / `trackLandingEvent(feature, properties)` на клиенте. Fire-and-forget.

**Клиент (после Stage 1):** нет глобального cooldown на все события; при ошибке запроса — короткий backoff **только для этого `feature`** (~12 s). Dedup: ~550 ms для действий, ~4 s для «view»-событий (см. `VIEW_STYLE_FEATURES` в `usageEvents.ts`); ключ dedup включает fingerprint переданных `properties`. В payload добавляется `properties.onboarding` из `onboarding_attribution`; при пустом `last_touch_utm` UTM подставляются из onboarding в колонки `utm_*`. **Stage 5:** в каждое событие добавляется `properties.platform` (`web` \| `pwa` \| `ios` \| `android` \| `unknown`) через `getAnalyticsPlatform()` в `analyticsPlatform.ts`.

**Копирайт paywall / trial (отдельно от `paywall_view`):** `feature: paywall_text`, в `properties.paywall_reason` — стабильный ключ показанного текста (в `analytics.usage_events_enriched` → `prop_paywall_reason`). Вызов через `trackPaywallTextShown()` в `src/utils/paywallTextAnalytics.ts` при показе соответствующего UI (не дублирует серверные лимитные `feature`).

---

### 2. Edge Function `deepseek-chat`

| Событие / запись | Таблица | Условие |
|------------------|---------|---------|
| `usage_events` | `usage_events` | После успешного ответа: `feature: "help"` для типа `sos_consultant`; `feature: "chat_recipe"` для типа `chat`/`recipe` при `responseRecipes.length > 0` и не `fromPlanReplace`. |
| `token_usage_log` | `token_usage_log` | При наличии `data.usage` и авторизованном `userId`: `action_type` = `plan_replace` \| `sos_consultant` \| `balance_check` \| `chat_recipe` \| `other`, плюс input/output/total tokens. |
| `plate_logs` | `plate_logs` | Только при `type === "balance_check"`: user_message, assistant_message, user_id, member_id. |

**Файл:** `supabase/functions/deepseek-chat/index.ts` (вставки `usage_events` / `token_usage_log` / `plate_logs` — блок после успешного ответа модели, см. ~1136–1178 на момент аудита 2026-03).

---

### 3. Edge Function `generate-plan`

| Событие / запись | Таблица | Условие |
|------------------|---------|---------|
| INSERT job | `plan_generation_jobs` | При `action === "start"`: user_id, member_id, type (day/week), status=running, progress_total/done=0. |
| UPDATE job | `plan_generation_jobs` | Прогресс (progress_done, last_day_key), финальный status (done/error), error_text, completed_at. |
| usage | `usage_events` | После успешного run для free (не premium/trial): `feature: "plan_fill_day"`, user_id, member_id. |

**Файл:** `supabase/functions/generate-plan/index.ts` (jobs: insert/update/cancel в начале файла; `usage_events` insert для free — см. ~1858 на момент аудита 2026-03).

---

### 4. Edge Function `payment-webhook`

| Событие | Таблица | Условие |
|---------|---------|---------|
| Audit | `subscription_plan_audit` | После реального подтверждения подписки (не idempotent replay): user_id, subscription_id, order_id, payment_id, tbank_status, amount, plan_detected (month/year), source_of_plan (Data/OrderId/DB/Amount), data_keys, note. |

**Файл:** `supabase/functions/payment-webhook/index.ts` (~189).

---

### 5. Frontend → Supabase (напрямую)

| Действие | Таблица | Где в коде |
|----------|---------|------------|
| Сохранение сообщения чата | `chat_history` | `useDeepSeekAPI.tsx` — insert после ответа Edge (user_id, child_id, message, response, message_type, recipe_id, meta). |
| Шаринг рецепта (short link) | `share_refs` | `usageEvents.ts` → `saveShareRef(recipeId, shareRef)` — insert share_ref, recipe_id. |

Остальные события продукта идут через **track-usage-event** (см. раздел Product Events).

---

## Analytics Tables

### Stage 3: view `analytics.usage_events_enriched`

Read-only слой поверх `public.usage_events`: `event_group`, `event_type` (view / click / outcome / server_quota / limit_ui / other), плоские поля из `properties` (`prop_*`, `onboarding_*`), `is_authenticated`, `event_date_utc`. Миграция: `supabase/migrations/20260331180000_analytics_usage_events_enriched_view.sql`. Детали и воронки: [product-metrics-layer.md](./product-metrics-layer.md), запросы в [sql/](./sql/).

Отчёты и воронки лучше строить от **этого view**, а не от сырых `usage_events`, чтобы не дублировать `CASE` по taxonomy.

---

### `public.usage_events`

**Назначение:** события по фичам для лимитов Free и аналитики (trial flow, вирусность, лендинг).

**Схема (после миграций):**
- `id` uuid PK, `created_at` timestamptz
- `user_id` uuid (nullable для анонимов)
- `member_id` uuid (nullable)
- `feature` text (без ограничения enum после 20260228140000)
- `anon_id`, `session_id`, `page`, `entry_point` text
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` text
- `properties` jsonb default '{}'

**Какие события пишутся:** см. раздел Product Events. Для лимитов считаются только фичи: `chat_recipe`, `plan_fill_day`, `help` (плюс в миграции упомянут `plan_refresh`, но в коде он нигде не пишется — зарезервировано).

**Конверсии:** регистрация (auth_success), первый член семьи (member_create_success), первый рецепт (chat_recipe с бэка), генерация плана (plan_fill_day с бэка), trial (trial_started), оплата (purchase_success), шаринг (share_click, share_landing_view).

---

### `public.token_usage_log`

**Назначение:** учёт токенов AI по типу действия (биллинг/метрики).

**Схема:** id, user_id, action_type text, input_tokens, output_tokens, total_tokens, created_at.

**Типы действий (action_type):** `chat_recipe`, `plan_replace`, `sos_consultant`, `balance_check`, `recipe_translation` (ML-5: перевод рецепта через Edge translate-recipe), `other`. (В миграции упомянуты weekly_plan, diet_plan — в коде Edge сейчас не пишутся.)

**Куда пишется:** из Edge `deepseek-chat` при наличии usage и user_id; из Edge **`translate-recipe`** для `action_type = recipe_translation` после успешного вызова LLM (skipped-кейсы не логируются; best-effort, не ломает translation flow).

---

### `public.subscription_plan_audit`

**Назначение:** аудит «почему выбран план month/year» при подтверждении оплаты.

**Поля:** user_id, subscription_id, order_id, payment_id, tbank_status, amount, plan_detected ('month'|'year'), source_of_plan ('Data'|'OrderId'|'DB'|'Amount'), data_keys, raw_order_id_hint, note, created_at.

**Пишется:** только из `payment-webhook` при реальном confirm (не при replay).

---

### `public.plan_generation_jobs`

**Назначение:** фоновая генерация плана (день/неделя), прогресс для UI.

**Поля:** id, user_id, member_id, type ('day'|'week'), status ('running'|'done'|'error'), started_at, completed_at, progress_total, progress_done, last_day_key, error_text, created_at, updated_at.

**Пишется:** из Edge `generate-plan` (insert при start, update при прогрессе и завершении/cancel).

---

### `public.chat_history`

**Назначение:** история сообщений чата с AI; привязка к рецепту (recipe_id) и контексту (child_id/member).

**Используется для:** отображение чата, антидубликаты рецептов (recent title keys в Edge), аналитика «сколько рецептов сгенерировано» — по записям с message_type='recipe' или по recipe_id.

**Пишется:** с фронта в `useDeepSeekAPI.tsx` (saveChatMutation) после ответа Edge. Edge в chat_history не пишет.

---

### `public.plate_logs`

**Назначение:** история запросов «Анализ тарелки» (balance_check).

**Поля:** user_id, member_id, user_message, assistant_message, created_at.

**Пишется:** только из Edge `deepseek-chat` при type === "balance_check".

---

### `public.share_refs`

**Назначение:** короткие ссылки для шаринга: share_ref → recipe_id (маршрут /r/:shareRef).

**Поля:** share_ref (unique), recipe_id.

**Пишется:** с фронта при шаринге рецепта (`saveShareRef` в usageEvents.ts). Читается в PublicRecipeSharePage и Edge share-og; RPC get_recipe_by_share_ref для публичной страницы рецепта.

---

## Product Events

Список значений `feature` и связанных событий (только то, что реально есть в коде). **Интерпретация для отчётов и группы (acquisition / paywall / share …):** см. [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md).

| event_name | Где вызывается | Таблица | Поля (кроме feature) | Когда |
|------------|----------------|---------|----------------------|--------|
| **Landing / prelogin** |
| landing_view | LandingOnboardingScreen (`trackLandingEvent`) | usage_events (через track-usage-event) | anon_id, session_id, page, entry_point, utm, properties | Просмотр лендинга |
| prelogin_view | AppPreloginScreen | usage_events | то же | Просмотр prelogin |
| landing_demo_open | `WelcomeRecipeBlock` на welcome (`trackLandingEvent`) | usage_events | — | Демо-блок рецепта показан (один раз за монтирование блока) |
| landing_demo_save_click | `LandingOnboardingScreen` → `goToFreeCta`, если секция демо была в viewport | usage_events | — | Перед `landing_cta_free_click`; только если пользователь доскроллил до демо |
| landing_cta_free_click | LandingOnboardingScreen | usage_events | то же | CTA «Получить свой план» / «Создать меню…» → signup |
| landing_cta_login_click | LandingOnboardingScreen (`goToAuth`) | usage_events | — | CTA «Войти» → /auth |
| prelogin_cta_click | AppPreloginScreen | usage_events | properties: { target: `login` \| `signup` } | Кнопки prelogin → /auth |
| vk_landing_view | VkFunnelPage (`/vk`) | usage_events | `entry_point`, `vk_session_id`, `platform`, `step` в properties | Просмотр VK-воронки |
| vk_start_onboarding | VkFunnelPage | usage_events | то же | CTA «Составить меню» |
| vk_complete_onboarding | VkFunnelPage | usage_events | то же | Перед запросом превью |
| vk_plan_generated | VkFunnelPage | usage_events | `fallback_source`, `duration_ms`, `has_preview` | Успешный ответ `vk-preview-plan` |
| vk_click_get_full_plan | VkFunnelPage | usage_events | `has_preview` | Перед `/auth?mode=signup&entry_point=vk` |
| vk_auth_success | AuthPage, AuthCallbackPage | usage_events | `draft_age_ms`, `has_preview`, `vk_session_id` | После успешной сессии при активном VK-черновике |
| **Auth** |
| auth_page_view | AuthPage | usage_events | то же | Просмотр страницы входа |
| auth_start | AuthPage | usage_events | то же | Начало попытки входа/регистрации |
| auth_success | AuthPage | usage_events | то же | Успешный вход/регистрация (в т.ч. для `entry_point=telegram` из CTA бота) |
| auth_error | AuthPage | usage_events | properties: { message } | Ошибка входа |
| cta_start_click | AuthPage | usage_events | то же | Отправка формы регистрации (signup submit; дубль с `auth_start` на том же действии) |
| share_recipe_cta_click | PublicRecipeSharePage (`trackLandingEvent`) | usage_events | properties: share_ref, share_type, entry_point | Клик CTA на публичной странице рецепта `/r/:shareRef` |
| **Member** |
| member_create_start | AddChildForm | usage_events | то же | Начало создания члена семьи |
| member_create_success | AddChildForm | usage_events | properties: { member_id } | Успешное создание |
| **Paywall / trial / purchase** |
| paywall_view | Paywall (Unified / Legacy), WeekPreviewPaywallSheet | usage_events | Unified/Legacy: `paywall_reason` (в т.ч. `trial_ending_soon`, `trial_expired` при открытии из `TrialLifecycleModalsHost`); week preview sheet: `paywall_reason`, `source`, `paywall_surface` | Показ paywall или нижнего sheet превью недели |
| paywall_text | `trackPaywallTextShown`: Unified/Legacy paywall, ReplaceMealSoft, trial onboarding, trial lifecycle, Free vs Premium, week preview sheet, FavoritesLimitSheet, FriendlyLimitDialog, TopicConsultationSheet, экраны оплаты, управление подпиской, сборка списка покупок, лендинг примера рецепта `/welcome` (`paywall_reason` / `surface`: `landing_example_recipe`, в `properties` может быть `entry_point: landing`) и др. | usage_events | `properties.paywall_reason` — ключ текста; опционально `surface` | Показ конкретного пользовательского текста (A/B и отчёты по копирайту) |
| paywall_primary_click | Paywall, WeekPreviewPaywallSheet | usage_events | properties: { source } и/или { paywall_reason } опционально | Клик по основной кнопке |
| paywall_secondary_click | Paywall | usage_events | properties: { paywall_reason } опционально (UnifiedPaywall) | Клик по вторичной кнопке |
| trial_started | Paywall, WeekPreviewPaywallSheet | usage_events | то же | После успешного start_trial() |
| purchase_start | useSubscription | usage_events | properties: { plan } | Начало оплаты |
| purchase_success | PaymentResult | usage_events | properties: { order_id } | Успешная оплата |
| purchase_error | PaymentResult | usage_events | properties: { order_id } | Ошибка оплаты |
| **Plan** |
| plan_view_day | MealPlanPage | usage_events | то же | Просмотр плана (день) |
| plan_fill_day_click | MealPlanPage | usage_events | — | Клик «Заполнить день/неделю» |
| plan_fill_day_success | MealPlanPage | usage_events | — | Успешное завершение генерации плана (клиент) |
| plan_fill_day_error | MealPlanPage | usage_events | properties: { message } | Ошибка генерации плана |
| partial_week_toast_favorites_click | MealPlanPage | usage_events | — | Клик по toast частично заполненной недели → избранное |
| partial_week_toast_assistant_click | MealPlanPage | usage_events | — | Клик по toast → ассистент |
| **Backend-only (usage_events, не track-usage-event)** |
| plan_fill_day | generate-plan Edge | usage_events | user_id, member_id, feature | После успешного run для free |
| chat_recipe | deepseek-chat Edge | usage_events | user_id, member_id, feature | После успешной генерации рецепта в чате |
| help | deepseek-chat Edge | usage_events | user_id, member_id: null, feature | После ответа SOS-консультанта |
| **Chat** |
| chat_open | ChatPage | usage_events | то же | Открытие экрана чата |
| chat_generate_click | ChatPage | usage_events | — | Клик «Сгенерировать» (режим рецептов) |
| chat_generate_success | ChatPage | usage_events | — | Успешная генерация рецепта в чате |
| chat_generate_error | ChatPage | usage_events | properties: { message } | Ошибка генерации |
| help_answer_received | ChatPage | usage_events | — | Получен ответ «Мы рядом» |
| help_open | SosTiles | usage_events | — | Открытие раздела помощи |
| help_topic_open | SosTiles | usage_events | properties: { topic_id } | Открытие темы помощи |
| premium_chat_limit_reached | ChatPage | usage_events | properties: { user_id?, subscription_status, feature: `chat`, daily_count, daily_limit, entry_point }; member_id опционально | Достигнут скрытый дневной лимит генераций чата (Premium/Trial) |
| premium_help_limit_reached | ChatPage (режим help), SosTiles / TopicConsultationSheet | usage_events | properties: { subscription_status, feature: `help_mama`, daily_count, daily_limit, entry_point }; member_id опционально | Достигнут скрытый дневной лимит «Помощь маме» |
| **Share / viral** |
| share_click | ChatMessage, RecipePage | usage_events | properties: recipe_id, share_ref, channel, source_screen | Клик «Поделиться» (рецепт) |
| share_landing_view | PublicRecipeSharePage, RecipePage (query ep/sr) | usage_events | properties: recipe_id, share_ref, source (short_link), share_type | Просмотр по шаре: короткая ссылка или длинная `/recipe/:id?ep=...` |
| shared_plan_view | SharedPlanPage | usage_events | properties: plan_ref, plan_scope (`day`\|`week`), cta_variant | Просмотр публичного плана `/p/:ref` (один раз на ref за сессию компонента) |
| shared_plan_not_found_view | SharedPlanPage | usage_events | properties: plan_ref | Ссылка `/p/:ref` с непустым ref, план не найден (один раз на ref за сессию) |
| share_day_plan_cta_click | SharedPlanPage | usage_events | `plan_ref`, `share_type`, `entry_point` в properties (Stage 5) | Клик шаринга дня плана |
| share_week_plan_cta_click | SharedPlanPage | usage_events | то же | Клик шаринга недели плана |
| recipe_view | RecipePage, PublicRecipeSharePage, WelcomeRecipeBlock | usage_events | `recipe_id`, `source`, `is_public`, опц. `share_ref` | SoT просмотра карточки рецепта (Stage 5) |
| share_link_created | после insert `share_refs` / `shared_plans` | usage_events | `share_type`, `share_ref`, `surface`, опц. `recipe_id` | Начало измеримого viral funnel (Stage 5) |
| plan_slot_replace_attempt | useReplaceMealSlot | usage_events | day_key, meal_type, source | Старт попытки замены (Stage 5) |
| plan_slot_replace_fail | useReplaceMealSlot | usage_events | reason, опц. error_type / fail_code | Неуспех замены (Stage 5) |
| plan_slot_replace_success | `useReplaceMealSlot` | usage_events | properties: day_key, meal_type, source (`assign`\|`pool_pick`\|`ai_chat`\|`auto_pool`\|`auto_ai`), plan_source (для auto) | Успешная замена слота плана (продуктовая метрика; дополняет `token_usage_log.plan_replace` на Edge) |
| **Favorites** |
| favorite_add | useFavorites | usage_events | properties: recipe_id, member_id | Добавление в избранное |
| favorite_remove | useFavorites | usage_events | то же | Удаление из избранного |
| **Ads (free users, chat)** |
| ad_rewarded_shown | StubRewardedAdProvider | usage_events | — | Показ рекламной модалки |
| ad_rewarded_dismissed | StubRewardedAdProvider | usage_events | — | Закрытие без просмотра |
| ad_rewarded_completed | StubRewardedAdProvider | usage_events | — | Успешный просмотр (stub) |

**Примечание:** `plan_refresh` указан в миграции как допустимое значение feature для лимитов, но в коде нигде не записывается — зарезервировано.

---

## User Funnel

**Готовые воронки (конверсии, окна дат):** см. [sql/funnel_acquisition.sql](./sql/funnel_acquisition.sql), [sql/funnel_activation.sql](./sql/funnel_activation.sql), [sql/funnel_paywall.sql](./sql/funnel_paywall.sql), [sql/funnel_share.sql](./sql/funnel_share.sql); дневной срез — [sql/product_kpi_daily.sql](./sql/product_kpi_daily.sql).

**Retention / когорты / WAU·MAU / paywall surfaces / share quality:** [retention-and-cohorts.md](./retention-and-cohorts.md) и файлы Stage 4 в [sql/README.md](./sql/README.md).

Реальная воронка по событиям и таблицам (концептуально):

| Шаг | События / данные | Таблица / источник | SQL-идея |
|-----|------------------|--------------------|----------|
| 1. Visit | landing_view, prelogin_view, shared_plan_view, share_landing_view | usage_events (anon_id или user_id) | COUNT по feature, created_at; неуспешный план: shared_plan_not_found_view |
| 2. Register | auth_success (с anon_id → потом user_id) | usage_events | Первый auth_success по anon_id или user_id |
| 3. Create family member | member_create_success | usage_events | feature = 'member_create_success' |
| 4. First recipe (chat) | chat_recipe (backend) + chat_generate_success (front) | usage_events, chat_history (recipe_id) | usage_events.feature = 'chat_recipe' или chat_history с message_type/recipe_id |
| 5. Add recipe to plan | — | meal_plans_v2 (assign_recipe_to_plan_slot и т.д.) | По meal_plans_v2.meals |
| 6. Generate day plan | plan_fill_day_click → plan_fill_day (backend) | usage_events, plan_generation_jobs | usage_events.feature = 'plan_fill_day', plan_generation_jobs.status = 'done' |
| 7. Generate week plan | то же (type=week) | plan_generation_jobs (type='week') | Аналогично по type |
| 8. Start trial | trial_started | usage_events | feature = 'trial_started' |
| 9. Purchase premium | purchase_success, subscription_plan_audit | usage_events, subscription_plan_audit | subscription_plan_audit по user_id; usage_events feature = 'purchase_success' |

Регистрация как таковая не пишется отдельным событием в usage_events; факт появления пользователя — auth.users + триггер в profiles_v2. Событие **auth_success** фиксирует успешный вход/регистрацию.

---

## Viral Analytics

**Как отслеживается:**

1. **Короткая ссылка:** `/r/:shareRef` → PublicRecipeSharePage загружает рецепт через RPC get_recipe_by_share_ref, вызывает `setShareAttributionFromShortLink(shareRef)` (localStorage: entry_point=share_recipe, share_ref), затем `trackUsageEvent("share_landing_view", { properties: { share_ref, source: "short_link", recipe_id, share_type: "recipe" } })` и отображает публичную страницу рецепта; CTA ведёт на `/auth?mode=signup&entry_point=shared_recipe&share_ref=...&share_type=recipe`.
2. **Длинная ссылка:** `/recipe/:id?ep=share_recipe&ch=...&sr=...` — на RecipePage при ep/sr вызывается `trackUsageEvent("share_landing_view", { properties: { recipe_id: id } })`.
3. **Атрибуция:** в `usageEvents.ts` из URL парсятся `entry_point`/`ep`, `share_ref`/`sr`, `share_type`, `ch` и сохраняются в localStorage (captureAttributionFromLocationOnce). При отправке в track-usage-event в usage_events попадают entry_point, utm_*, properties.share_ref, properties.share_channel, properties.share_type.
4. **План дня/недели:** `/p/:ref` → `shared_plan_view` или `shared_plan_not_found_view` → CTA `share_day_plan_cta_click` / `share_week_plan_cta_click` → `/welcome?entry_point=...&share_ref=...` (см. [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md) §3.10).

**Воронка share → visit → register → activation:**

- **Share:** share_click (properties: share_ref, channel, source_screen) + запись в share_refs при шаринге.
- **Visit:** share_landing_view (на /r или /recipe с ep/sr) — в properties могут быть share_ref, recipe_id, source.
- **Register:** auth_success с тем же anon_id (или последний entry_point=share_recipe в usage_events по user_id).
- **Activation:** например первый chat_recipe или member_create_success по этому user_id.

Для конверсии share → register можно связать по anon_id: события с share_landing_view (anon_id) и позже auth_success (тот же anon_id после регистрации передаётся с user_id).

---

## AI Usage

**Где пишется token_usage_log:** Edge `deepseek-chat/index.ts` (после успешного ответа при наличии `data.usage` и авторизованном user_id) и Edge **`translate-recipe`** для переводов рецепта (`recipe_translation`).

**action_type в коде:**

| action_type | Когда |
|-------------|--------|
| plan_replace | Вызов из плана (замена слота) — fromPlanReplace === true |
| sos_consultant | type === 'sos_consultant' |
| balance_check | type === 'balance_check' |
| chat_recipe | type === 'chat' или 'recipe', не plan_replace |
| other | остальные случаи |

**Метрики, которые можно строить:**

- Количество запросов по типам: `SELECT action_type, COUNT(*), SUM(input_tokens), SUM(output_tokens) FROM token_usage_log WHERE created_at >= ... GROUP BY action_type`.
- Токены на пользователя за период.
- Доля chat_recipe vs sos_consultant vs balance_check.

RPC `get_token_usage_by_action(_from_date, _to_date, _user_id)` возвращает сводку по action_type (request_count, sum_input_tokens, sum_output_tokens, sum_total_tokens).

---

## Plan Generation Analytics

**Таблица:** plan_generation_jobs.

**Что логируется:**

- **start:** insert с status=running, type=day|week, progress_total=dayKeys.length, progress_done=0.
- **run:** update progress_done по мере обработки дней, last_day_key; в конце status=done (или error), error_text (null, "No pool candidates", "No pool candidates after filters", "partial:pool_exhausted", "cancelled_by_user"), completed_at.
- **cancel:** status=error, error_text='cancelled_by_user', completed_at.

**Метрики:**

- Успешность: доля строк с status='done' без error_text или с partial.
- Ошибки: GROUP BY error_text.
- Время генерации: completed_at - started_at (или created_at).

---

## Free Limits Tracking

**Где используется usage_events для лимитов:**

- **deepseek-chat:** RPC `get_usage_count_today(p_user_id, p_feature)` для фич `help` и `chat_recipe`. Лимит 2/день (FREE_FEATURE_LIMIT = 2). При used >= 2 возвращается 429 LIMIT_REACHED. После успешного ответа — insert в usage_events (help или chat_recipe).
- **generate-plan:** `get_usage_count_today(userId, 'plan_fill_day')`, лимит 2/день (FREE_PLAN_FILL_LIMIT = 2). При used >= 2 — 429. После успешного run для free — insert usage_events feature 'plan_fill_day'.

**Фича plan_refresh:** в миграции и в limitReachedMessages упоминается для сообщений пользователю, но **счётчик plan_refresh в коде нигде не инкрементируется** — только chat_recipe, plan_fill_day, help.

**Сутки:** по UTC (`date_trunc('day', now() AT TIME ZONE 'UTC')` в get_usage_count_today).

---

## Example SQL Queries

**Конверсия регистраций (auth_success за период):**
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
       COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS registered,
       COUNT(*) FILTER (WHERE anon_id IS NOT NULL AND user_id IS NULL) AS anon
FROM usage_events
WHERE feature = 'auth_success'
  AND created_at >= :from_date
GROUP BY 1
ORDER BY 1;
```

**Конверсия trial (первый trial_started по user_id):**
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
       COUNT(DISTINCT user_id) AS trial_started
FROM usage_events
WHERE feature = 'trial_started'
  AND user_id IS NOT NULL
  AND created_at >= :from_date
GROUP BY 1;
```

**Конверсия premium (записи в audit):**
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
       plan_detected,
       COUNT(*)
FROM subscription_plan_audit
WHERE created_at >= :from_date
GROUP BY 1, plan_detected
ORDER BY 1, plan_detected;
```

**Количество генераций рецептов в чате (по usage_events):**
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
       COUNT(*) AS chat_recipe_count
FROM usage_events
WHERE feature = 'chat_recipe'
  AND created_at >= :from_date
GROUP BY 1
ORDER BY 1;
```

**Дневная активность (уникальные пользователи по событиям):**
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
       COUNT(DISTINCT user_id) AS dau
FROM usage_events
WHERE user_id IS NOT NULL
  AND created_at >= :from_date
GROUP BY 1
ORDER BY 1;
```

**Share → register (пример по anon_id):**
```sql
-- Пользователи, у которых был share_landing_view по anon_id, затем auth_success с тем же anon_id
WITH share_visitors AS (
  SELECT DISTINCT anon_id
  FROM usage_events
  WHERE feature = 'share_landing_view'
    AND anon_id IS NOT NULL
    AND created_at >= :from_date
),
registered AS (
  SELECT ue.anon_id, ue.user_id, MIN(ue.created_at) AS first_auth
  FROM usage_events ue
  JOIN share_visitors sv ON sv.anon_id = ue.anon_id
  WHERE ue.feature = 'auth_success'
  GROUP BY ue.anon_id, ue.user_id
)
SELECT COUNT(*) AS share_to_register_count FROM registered;
```

**Токены по типу действия:**
```sql
SELECT action_type,
       COUNT(*) AS requests,
       SUM(input_tokens) AS sum_input,
       SUM(output_tokens) AS sum_output,
       SUM(total_tokens) AS sum_total
FROM token_usage_log
WHERE created_at >= :from_date
GROUP BY action_type;
```

**Успешность plan generation jobs:**
```sql
SELECT status,
       error_text,
       COUNT(*)
FROM plan_generation_jobs
WHERE created_at >= :from_date
GROUP BY status, error_text
ORDER BY status, error_text;
```

---

## Growth Metrics

На основе найденных событий и таблиц можно считать:

| Метрика | Источник |
|---------|----------|
| DAU | COUNT(DISTINCT user_id) по usage_events за день (или по любому событию с user_id). |
| WAU | То же за 7 дней. |
| Conversion to trial | Количество user_id с хотя бы одним trial_started за период; или доля от зарегистрированных (auth_success). |
| Conversion to premium | Записи в subscription_plan_audit за период; или purchase_success в usage_events. **Финансовый SoT:** audit/webhook; **продуктовая воронка:** также paywall_* / trial_started / purchase_* в usage_events (см. taxonomy §7). |
| Recipe generation per user | COUNT по usage_events feature='chat_recipe' на user_id за период. |
| Share rate | share_click / (chat_generate_success или просмотры рецептов) — по usage_events. |
| Viral coefficient | Требует определения «приглашённого» (например по share_ref → share_landing_view → auth_success); затем (новые регистрации с share_attribution) / (число шаривших). |

---

## Current Analytics Architecture

```
Frontend (React)
  │
  ├─ trackUsageEvent(feature, options) ──► POST /functions/v1/track-usage-event
  │     │                                    │
  │     │                                    ▼
  │     │                              usage_events (insert, service_role)
  │     │
  │     └─ anon_id, session_id, page, entry_point, utm, properties (+ onboarding merge; limit-feature отфильтрованы на Edge)
  │
  ├─ saveShareRef(recipeId, shareRef) ──► supabase.from('share_refs').insert()
  │
  ├─ saveChatMutation (chat_history) ──► supabase.from('chat_history').insert()
  │
  └─ Вызовы Edge: deepseek-chat, generate-plan
           │
           ▼
Edge Functions
  │
  ├─ deepseek-chat
  │     ├─ usage_events.insert (help | chat_recipe)
  │     ├─ token_usage_log.insert (action_type, tokens)
  │     └─ plate_logs.insert (balance_check)
  │
  ├─ generate-plan
  │     ├─ plan_generation_jobs (insert/update)
  │     └─ usage_events.insert (plan_fill_day для free)
  │
  ├─ track-usage-event
  │     └─ usage_events.insert (клиентские feature, кроме limit-sensitive — см. trackUsageClientPolicy)
  │
  └─ payment-webhook
        └─ subscription_plan_audit.insert
```

**Итог:** единая точка входа для продуктовых событий с фронта — Edge **track-usage-event** и таблица **usage_events**. Лимиты Free считаются по usage_events через RPC **get_usage_count_today**. Токены и планы — в **token_usage_log** и **plan_generation_jobs**. Оплата аудируется в **subscription_plan_audit**. Отдельного ETL или внешнего аналитического хранилища в проекте нет — аналитика строится по SQL поверх Supabase.
