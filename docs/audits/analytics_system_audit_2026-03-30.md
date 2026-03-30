# Аудит системы аналитики и связанных данных (Little Bites / Mom Recipes)

**Дата аудита:** 2026-03-30  
**Область:** фронтенд, Edge Functions, схема БД (миграции + `DATABASE_SCHEMA.md`), документация в `docs/`.  
**Ограничение:** только наблюдения и рекомендации; продуктовый код и схема на этапе аудита **не менялись**.

**Follow-up Stage 1 (2026-03-30):** закрыта подмена лимитных `feature` через `track-usage-event`; ослаблен глобальный cooldown клиента; подмешан `onboarding_attribution`; добавлены `shared_plan_view`, `plan_slot_replace_success`, живые `landing_demo_*`; детали — [USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md](../decisions/USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md) и обновлённый [analytics-system.md](../analytics/analytics-system.md).

**Follow-up Stage 2 (2026-03-30):** каноническая taxonomy + legacy mapping в [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md); усилены CTA (`landing_cta_login_click`, `prelogin_cta_click`, `paywall_view` для week preview sheet, `shared_plan_not_found_view`); удалён неиспользуемый объект `landingEvents`; обновлены analytics docs.

---

## A. Executive summary

**Текущее состояние:** аналитика сосредоточена в **Supabase**: основная витрина событий — таблица `usage_events` (лимиты Free/Premium-Trial + продуктовые события). Дополнительно: `token_usage_log` (токены AI), `plan_generation_jobs` (фон генерации плана), `subscription_plan_audit` (подтверждение оплаты), `chat_history` и `plate_logs` (контент/история с побочным значением для метрик), `share_refs` (маппинг коротких ссылок). Внешних систем (Amplitude, GA4 и т.д.) в коде нет.

**Что уже хорошо:**

- Единый клиентский путь для большинства событий: `trackUsageEvent` → Edge `track-usage-event` → `usage_events` с `anon_id`, `session_id`, `page`, `entry_point`, UTM и `properties`.
- Лимиты по фичам завязаны на **серверные** вставки `chat_recipe` / `help` / `plan_fill_day` (Edge), а не только на клиент.
- Документ `docs/analytics/analytics-system.md` в целом совпадает с архитектурой и даёт SQL-примеры и воронку.
- Есть учёт токенов по `action_type`, включая `plan_replace` и `recipe_translation` (translate-recipe).

**Главные проблемы:**

1. **Смешение ролей таблицы `usage_events`:** и «жёсткие» фичи для лимитов (`chat_recipe`, `help`, `plan_fill_day`), и произвольные строки `feature` с клиента. Через `track-usage-event` (service role) клиент теоретически может отправить событие с тем же `feature`, что и лимиты — **засорение или искажение счётчиков** `get_usage_count_today` (см. раздел F).
2. **Потеря событий на клиенте:** глобальный **cooldown 60 с** после любой неуспешной отправки (`track-usage-event`) блокирует **все** последующие события до истечения окна; плюс **дедуп 2 с** по ключу `feature|page|entry_point` — риск пропуска валидных событий при быстрых действиях.
3. **Два параллельных механизма атрибуции:** `usageEvents` (`last_touch_*` в localStorage) и `onboarding_attribution` (`saveOnboardingAttribution` / `getOnboardingAttribution`). Второй **почти нигде не читается** при отправке событий — данные копятся «в стороне».
4. **Пробелы по сценариям:** нет `share_landing_view` для публичной страницы плана `/p/:ref`, нет явной аналитики профиля/семьи/сканера/дневника/списка покупок/лайков рецепта; **замена блюда в плане** не даёт отдельного `usage_events` (есть только `token_usage_log.plan_replace`).
5. **Документация:** в `analytics-system.md` устарели номера строк для `deepseek-chat`; раздел про `token_usage_log` не упоминает **translate-recipe**; часть событий из кода отсутствует в таблице Product Events (`partial_week_toast_*`).

**Что мешает качественному продуктовому анализу:** нет строгого контракта имён и обязательных полей по событиям; дубли «успех на клиенте» vs «успех на сервере» для чата и плана; слабая связка воронки share-плана; риск потери телеметрии из-за cooldown/dedup; возможное загрязнение лимитных `feature` с клиента.

---

## B. Карта событий (`usage_events.feature`)

Условные обозначения: **FE** — клиент → `track-usage-event`; **Edge** — прямая вставка из Edge (service / user JWT по функции).

| event_name (feature) | Где вызывается | Источник | Запись | Основные поля (доп. к общим) | Назначение | Чтение / использование |
|----------------------|----------------|----------|--------|------------------------------|------------|-------------------------|
| `landing_view` | `LandingOnboardingScreen` | FE | `usage_events` | properties пусто | Просмотр welcome | Воронка, DAU анонимов |
| `prelogin_view` | `AppPreloginScreen` | FE | то же | — | Просмотр prelogin | Воронка |
| `landing_cta_free_click` | `LandingOnboardingScreen` | FE | то же | — | CTA «Бесплатно» | Конверсия в auth |
| `landing_demo_open` | только `landingEvents` helper | — | — | — | **Не найдено вызовов в UI** | Мёртвый helper |
| `landing_demo_save_click` | только `landingEvents` helper | — | — | — | **Не найдено вызовов в UI** | Мёртвый helper |
| `auth_page_view` | `AuthPage` | FE | `usage_events` | — | Просмотр auth | Воронка |
| `auth_start` | `AuthPage` (login/signup handlers) | FE | то же | — | Начало попытки | Воронка; **дубль с `cta_start_click`** при CTA |
| `cta_start_click` | `AuthPage` (отдельная кнопка) | FE | то же | — | Клик «Начать» | Уточнение входа с welcome |
| `auth_success` | `AuthPage` | FE | то же | — | Успешный вход/регистрация | Ключевая конверсия |
| `auth_error` | `AuthPage` | FE | то же | `properties.message` | Ошибка auth | Диагностика |
| `share_recipe_cta_click` | `PublicRecipeSharePage` | FE | то же | `properties`: share_ref, share_type, entry_point | CTA с публичной страницы рецепта | Вирусная воронка |
| `member_create_start` | `AddChildForm` | FE | то же | — | Онбординг профиля | Активация |
| `member_create_success` | `AddChildForm` | FE | то же | `properties.member_id` | Создан член семьи | Активация |
| `paywall_view` | `UnifiedPaywall`, `LegacyPaywall` | FE | то же | Unified: `paywall_reason`; Legacy: см. код | Показ paywall | Конверсия / причины |
| `paywall_primary_click` | Unified, Legacy, `WeekPreviewPaywallSheet` | FE | то же | Unified: paywall_reason; WeekPreview: `source: week_preview` | Клик основной CTA | Воронка оплаты/триала |
| `paywall_secondary_click` | Unified, Legacy | FE | то же | Unified: paywall_reason | «Продолжить бесплатно» и т.д. | Отказы |
| `trial_started` | Unified, Legacy, `WeekPreviewPaywallSheet` | FE | то же | — | Успешный старт триала | Конверсия |
| `purchase_start` | `useSubscription` (динамический import) | FE | то же | `properties.plan` | Старт оплаты | Воронка |
| `purchase_success` | `PaymentResult` (success route) | FE | то же | `order_id` опционально | Успешная оплата (клиент) | Конверсия; **дополняет** `subscription_plan_audit` |
| `purchase_error` | `PaymentResult` (fail) | FE | то же | `order_id` опционально | Ошибка оплаты | Диагностика |
| `plan_view_day` | `MealPlanPage` | FE | то же | — | Открытие плана (один раз за маунт сценария) | Engagement |
| `plan_fill_day_click` | `MealPlanPage` (2 места) | FE | то же | — | Клик заполнить день/неделю | Воронка плана |
| `plan_fill_day_success` | `MealPlanPage` | FE | то же | — | Клиент: успех вызова генерации | **Дубль семантики с Edge `plan_fill_day`** |
| `plan_fill_day_error` | `MealPlanPage` | FE | то же | `message` | Ошибка на клиенте | Диагностика |
| `plan_fill_day` | `generate-plan` | Edge | `usage_events` | user_id, member_id | **Лимит Free:** +1 за успешный run | `get_usage_count_today` |
| `chat_recipe` | `deepseek-chat` | Edge | `usage_events` | user_id, member_id | **Лимит:** успешная генерация рецепта; не `fromPlanReplace` | `get_usage_count_today`, метрики AI |
| `help` | `deepseek-chat` | Edge | `usage_events` | user_id, member_id null | **Лимит:** ответ SOS | То же |
| `chat_open` | `ChatPage` | FE | `usage_events` | — | Вход в чат (1 раз на монтирование `/chat`) | Engagement |
| `chat_generate_click` | `ChatPage` | FE | то же | — | Отправка в режиме рецептов | Воронка чата |
| `chat_generate_success` | `ChatPage` | FE | то же | — | Успех на клиенте | **Параллельно Edge `chat_recipe`** |
| `chat_generate_error` | `ChatPage` | FE | то же | `message` | Ошибка | Диагностика |
| `help_answer_received` | `ChatPage` | FE | то же | — | Получен ответ help | UX метрики |
| `help_open` | `SosTiles` | FE | то же | — | Раздел помощи | Engagement |
| `help_topic_open` | `SosTiles` | FE | то же | `topic_id` | Тема SOS | Контент |
| `premium_chat_limit_reached` | `ChatPage` | FE | то же | subscription_status, daily_*, entry_point, member_id | Скрытый дневной лимит Premium/Trial | Продуктовые лимиты |
| `premium_help_limit_reached` | `ChatPage`, `SosTiles` | FE | то же | аналогично | То же для help | То же |
| `share_click` | `ChatMessage`, `RecipePage` | FE | то же | recipe_id, share_ref, channel, source_screen | Шаринг рецепта | Вирусность |
| `share_landing_view` | `PublicRecipeSharePage`, `RecipePage` (ep/sr) | FE | то же | recipe_id, share_ref, source, share_type | Заход по шаре | Вирусность |
| `share_day_plan_cta_click` | `SharedPlanPage` | FE | то же | через landing → properties | CTA с shared plan (день) | Воронка плана |
| `share_week_plan_cta_click` | `SharedPlanPage` | FE | то же | — | CTA (неделя) | То же |
| `favorite_add` / `favorite_remove` | `useFavorites` | FE | то же | `recipe_id`; member_id в колонке | Избранное | Engagement |
| `partial_week_toast_favorites_click` | `MealPlanPage` | FE | то же | — | Toast частичной недели | **Не в analytics-system.md** |
| `partial_week_toast_assistant_click` | `MealPlanPage` | FE | то же | — | То же | **Не в analytics-system.md** |
| `ad_rewarded_shown` / `dismissed` / `completed` | `StubRewardedAdProvider` | FE | то же | — | Реклама (stub) | Только если `VITE_ENABLE_ADS=true` |

**Общие поля клиентских событий** (формируются в `usageEvents.ts`): `anon_id`, `session_id`, `page`, `entry_point` (из localStorage), колонки `utm_*`, в `properties` при необходимости добавляются `share_ref`, `share_channel`, `share_type`.

---

## C. Карта хранилища

### `public.usage_events`

| Элемент | Состояние |
|---------|-----------|
| **Назначение** | Лимиты по `get_usage_count_today(user_id, feature)` для `chat_recipe`, `help`, `plan_fill_day` (сутки UTC) + продуктовая аналитика |
| **Обязательные** | `id` (default), `created_at` (default), `feature`, `properties` (default `{}`); `user_id` **nullable** (после миграции 20260228140000) |
| **Nullable** | `user_id`, `member_id`, `anon_id`, `session_id`, `page`, `entry_point`, все `utm_*` |
| **Индексы** | `(user_id, feature, created_at DESC)`, `(user_id, member_id, feature, created_at DESC)`, `(created_at DESC)`, `(user_id, created_at DESC) WHERE user_id NOT NULL`, `(feature, created_at DESC)`, `(anon_id, created_at DESC) WHERE anon_id NOT NULL` |
| **Источник правды по схеме** | Миграции `20260227100000_usage_events_feature_limits.sql`, `20260228140000_usage_events_analytics_columns.sql` + `docs/database/DATABASE_SCHEMA.md` |
| **Особенность** | CHECK на `feature` **снят** — любая строка с клиента допустима |

### `public.token_usage_log`

- Пишется из **`deepseek-chat`** (action_type: `chat_recipe`, `plan_replace`, `sos_consultant`, `balance_check`, `other`) и **`translate-recipe`** (`recipe_translation`).
- **Source of truth:** миграция `20260214120000_token_usage_log.sql`, комментарии в `20260320120000_token_usage_log_recipe_translation_comment.sql`, `DATABASE_SCHEMA.md`.

### `public.plan_generation_jobs`

- Статусы/прогресс генерации дня/недели в **`generate-plan`**. Для метрик: success rate, `error_text`, длительность.

### `public.subscription_plan_audit`

- Только **`payment-webhook`** после реального confirm (не replay). Связка с бизнес-фактом подписки.

### `public.chat_history`

- Вставка с клиента **`useDeepSeekAPI`** после ответа чата. Поля: `message_type`, `recipe_id`, `meta` и т.д. Для аналитики: объём генераций, связь с рецептом (не дублирует `usage_events` 1:1).

### `public.plate_logs`

- Только Edge **`deepseek-chat`**, тип `balance_check`.

### `public.share_refs`

- Клиент **`saveShareRef`** при шаринге. Связь share_ref → recipe_id для `/r/:shareRef`.

### `public.shared_plans`

- Данные плана для `/p/:ref`; **отдельного usage-события просмотра** в коде не найдено.

### Прочее

- **`profiles_v2`**: `requests_today` помечен как легаси в типах/схеме; лимиты чата — через `usage_events`.
- **RPC `get_usage_count_today`**: определение в `20260227100000_usage_events_feature_limits.sql` — считает все строки с данным `feature` за UTC-день.

---

## D. Карта чтения аналитики

| Назначение | Где описано / как |
|------------|-------------------|
| SQL-примеры воронки, trial, premium, share | `docs/analytics/analytics-system.md` (Example SQL, User Funnel, Growth Metrics) |
| Поведение лимитов чата / blocked | `docs/dev/CHAT_BLOCKED_BEHAVIOR.md`, `docs/architecture/chat_recipe_generation.md` |
| Paywall / unified progress | `docs/dev/unified-paywall-2026-03-progress.md` |
| Доменная карта | `docs/architecture/domain-map.md` |
| Реклама и события | `docs/analytics/ad-views-chat-free-users.md` |
| Продакшн-дашборды в репозитории | **не обнаружены** (нет готовых Metabase/Looker файлов); ожидается ad-hoc SQL в Supabase |

**Что можно строить сейчас (условно):** DAU/WAU по `user_id`, воронка landing → auth → member → chat/plan, доля trial/purchase, токены по `action_type`, успешность `plan_generation_jobs`, грубая вирусность по `share_click` / `share_landing_view` / `share_recipe_cta_click`, связка anon → user по `anon_id`.

**Что сейчас получить трудно или нельзя без доработок:** полноценный funnel по **shared plan** (нет view); точная **замена блюда** в продуктовых событиях; единая **сессия** при SPA-навигации без перезагрузки (session_id есть, но `captureAttributionFromLocationOnce` в `App` только на mount — частично компенсируется `AuthPage` по `location.search`); использование **`onboarding_attribution`** в событиях; метрики **профиля / сканера / дневника / шоппинга / лайков** из единой телеметрии.

---

## E. Аудит по пользовательским сценариям

| Сценарий | Что трекается | Пробелы / замечания |
|----------|---------------|---------------------|
| First visit | `landing_view` / `prelogin_view`, частично UTM через `captureAttributionFromLocationOnce` | Прямой заход в приложение без `/welcome` может не давать landing-событий |
| Onboarding (профиль) | `member_create_start`, `member_create_success` | Нет событий переключения family/member, редактирования профиля |
| Auth | `auth_page_view`, `auth_start`, `auth_success`, `auth_error`, `cta_start_click` | Дубли `auth_start`+`cta_start_click`; импорт `trackLandingEvent` в `AuthPage` не используется (мусор) |
| Trial | `trial_started`, `paywall_*` | Нет отдельного «trial_eligible_shown» и т.п. |
| Premium conversion | `purchase_*`, `subscription_plan_audit` | Клиентские purchase_* зависят от захода на страницы результата оплаты |
| Chat usage | `chat_open`, `chat_generate_*`, `help_*`, Edge `chat_recipe`/`help` | Двойная семантика success; blocked — без `usage_events` (по дизайну) |
| Plan generation | `plan_fill_*` (клиент), Edge `plan_fill_day`, `plan_generation_jobs` | Нет отдельных feature для week vs day на клиенте (можно фильтровать по jobs.type) |
| Replace flow | `token_usage_log.plan_replace` | Нет `usage_events`; сложно считать конверсии replace в продуктовой воронке |
| Favorites | `favorite_add`/`favorite_remove` | Лимит избранного открывает paywall — есть `paywall_reason`, но нет отдельного события «favorites_limit_hit» |
| Sharing recipe | `share_click`, `share_landing_view`, `share_refs`, CTA | Ок для рецепта |
| Shared plan visit | CTA → `share_*_plan_cta_click`, `saveOnboardingAttribution` | **Нет** `share_plan_landing_view` или аналога |
| CTA на shared | `share_recipe_cta_click`, CTA плана | Ок |
| Возврат пользователя | Косвенно по любым событиям с `user_id` | Нет явного «session_return» / cohort без SQL |
| Usage limits / paywall | Edge лимиты + `premium_*_limit_reached`, paywall events | Реклама: `VITE_ENABLE_ADS` |

---

## F. Проблемы и риски

1. **Загрязнение лимитов через `track-usage-event`:** service role вставляет любой `feature` от клиента; строки с `feature IN ('chat_recipe','help','plan_fill_day')` участвуют в `get_usage_count_today` — риск намеренного или ошибочного искажения лимитов.
2. **Cooldown 60 с:** при сетевой ошибке или 401 теряется вся аналитика на минуту (не только повтор одного события).
3. **Дедуп 2 с:** события с одинаковым `feature` на той же `page` и `entry_point` подавляются (например, повторные клики).
4. **Дубли и рассинхрон:** `chat_generate_success` vs Edge `chat_recipe`; `plan_fill_day_success` vs Edge `plan_fill_day` — для отчётов нужно чётко выбирать source of truth.
5. **Именование:** `entry_point` в properties у premium лимита дублирует семантику колонки `entry_point`; `share_recipe` vs `shared_recipe` в разных местах URL/кода.
6. **onboarding_attribution не используется** в трекинге — расхождение с целью «сохранить для аналитики после регистрации».
7. **Документация:** неточные line references в `analytics-system.md` для `deepseek-chat`; неполный список событий; AI Usage не включает translate-recipe.

---

## G. Legacy / dead / suspicious

| Объект | Вердикт |
|--------|---------|
| `landing_demo_open`, `landing_demo_save_click` | Объявлены в `landingEvents`, **вызовов в UI нет** |
| `trackLandingEvent` import в `AuthPage` | **Неиспользуемый импорт** |
| `getOnboardingAttribution` | **Не используется** вне своего модуля и `storageDebug` |
| `plan_refresh` в старом CHECK миграции | В коде не пишется (уже отмечено в docs) |
| `requests_today` в profiles | Легаси (см. схему) |

---

## H. Рекомендации по следующему этапу

### P0 — критично

1. **Развести лимитные события и аналитику:** запретить с клиента `feature` из белого списка лимитов **или** считать лимиты только по строкам с пометкой источника (например `properties.source = 'edge'` / отдельная таблица) — потребует проектирования.
2. **Пересмотреть глобальный cooldown:** не отключать все события при одной ошибке (очередь, backoff по endpoint, счётчик неудач).

### P1 — важно

1. Добавить **`share_plan_landing_view`** (или общий `shared_content_view` с `content_type`) на `SharedPlanPage`.
2. События **replace flow** (клик / успех / ошибка) в `usage_events` или единый контракт с `plan_replace` в `token_usage_log`.
3. Подключить **`onboarding_attribution`** к отправке первых post-auth событий **или** слить с `usageEvents` storage.
4. Обновить **`docs/analytics/analytics-system.md`**: полный список feature, translate-recipe, актуальные ссылки на файлы, убрать/исправить устаревшие строки.
5. Удалить мёртвые импорты/demo events или реализовать вызовы (после продуктового решения).

### P2 — улучшения

1. Единый **registry событий** (TS const + типы) для фронта и проверки в Edge.
2. Расширить покрытие: профиль, shopping list, scan, food diary, like/dislike (если нужны продуктовые метрики).
3. Явные **screen_view** для ключевых экранов с параметром `route` (сейчас частично закрыто `page` из pathname).
4. Метрики **WeekPreviewPaywallSheet:** при необходимости добавить `paywall_view` с `source: week_preview` для симметрии с кликом.

---

## Приложение: ключевые файлы ревью

**Frontend:** `src/utils/usageEvents.ts`, `src/utils/landingAnalytics.ts`, `src/utils/onboardingAttribution.ts`, `src/App.tsx`, `src/pages/MealPlanPage.tsx`, `ChatPage.tsx`, `AuthPage.tsx`, `RecipePage.tsx`, `PublicRecipeSharePage.tsx`, `SharedPlanPage.tsx`, `LandingOnboardingScreen.tsx`, `AppPreloginScreen.tsx`, `SosTiles.tsx`, `PaymentResult.tsx`, `src/hooks/useFavorites.tsx`, `useSubscription.tsx`, `src/components/subscription/UnifiedPaywall.tsx`, `LegacyPaywall.tsx`, `WeekPreviewPaywallSheet.tsx`, `ChatMessage.tsx`, `AddChildForm.tsx`, `src/hooks/useDeepSeekAPI.tsx`, `src/services/ads/StubRewardedAdProvider.ts`.

**Edge:** `supabase/functions/track-usage-event/index.ts`, `deepseek-chat/index.ts`, `generate-plan/index.ts`, `payment-webhook/index.ts`, `translate-recipe/index.ts`.

**Миграции (аналитика):** `20260227100000_usage_events_feature_limits.sql`, `20260228140000_usage_events_analytics_columns.sql`, `20260214120000_token_usage_log.sql`, `20260203160000_token_usage_log_rls.sql`, `20260320120000_token_usage_log_recipe_translation_comment.sql`, `20260209100001_subscription_plan_audit.sql`, `20260205100000_plate_logs_and_ingredient_substitute.sql` (+ таблицы `share_refs` / `shared_plans` в `DATABASE_SCHEMA.md`).

**Документы:** `docs/analytics/analytics-system.md`, `docs/database/DATABASE_SCHEMA.md`, `docs/architecture/domain-map.md`, `docs/dev/CHAT_BLOCKED_BEHAVIOR.md`, `docs/analytics/ad-views-chat-free-users.md`.

---

*Этот документ — снимок состояния на дату аудита; при изменении кода ссылки и выводы нужно перепроверять.*
