# Analytics System

## Overview

Аналитика в проекте Little Bites строится на **событиях в Supabase**: таблицы `usage_events`, `token_usage_log`, `subscription_plan_audit`, `plan_generation_jobs`, а также вспомогательные таблицы `chat_history`, `plate_logs`, `share_refs`. События пишутся с **фронтенда** (через Edge Function `track-usage-event` и напрямую в часть таблиц) и с **Edge Functions** (deepseek-chat, generate-plan, payment-webhook). Отдельной внешней системы аналитики (Amplitude/Mixpanel и т.п.) в коде нет — всё хранится в БД.

Основные цели текущей реализации:
- **Лимиты Free**: учёт по фичам `chat_recipe`, `plan_fill_day`, `help` (2 использования в день на фичу).
- **Trial/Premium flow**: события auth, paywall, trial_started, purchase_*.
- **Вирусность**: атрибуция по share_ref, entry_point, UTM; короткие ссылки `/r/:shareRef`.
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

**Когда вызывается:** при любом вызове `trackUsageEvent(feature, options)` / `trackLandingEvent(feature, properties)` на клиенте. Fire-and-forget, cooldown 60s при 401/404/network, дедуп 2s по feature+page+entry_point.

---

### 2. Edge Function `deepseek-chat`

| Событие / запись | Таблица | Условие |
|------------------|---------|---------|
| `usage_events` | `usage_events` | После успешного ответа: `feature: "help"` для типа `sos_consultant`; `feature: "chat_recipe"` для типа `chat`/`recipe` при `responseRecipes.length > 0` и не `fromPlanReplace`. |
| `token_usage_log` | `token_usage_log` | При наличии `data.usage` и авторизованном `userId`: `action_type` = `plan_replace` \| `sos_consultant` \| `balance_check` \| `chat_recipe` \| `other`, плюс input/output/total tokens. |
| `plate_logs` | `plate_logs` | Только при `type === "balance_check"`: user_message, assistant_message, user_id, member_id. |

**Файл:** `supabase/functions/deepseek-chat/index.ts` (около строк 989–1027, 996–1001).

---

### 3. Edge Function `generate-plan`

| Событие / запись | Таблица | Условие |
|------------------|---------|---------|
| INSERT job | `plan_generation_jobs` | При `action === "start"`: user_id, member_id, type (day/week), status=running, progress_total/done=0. |
| UPDATE job | `plan_generation_jobs` | Прогресс (progress_done, last_day_key), финальный status (done/error), error_text, completed_at. |
| usage | `usage_events` | После успешного run для free (не premium/trial): `feature: "plan_fill_day"`, user_id, member_id. |

**Файл:** `supabase/functions/generate-plan/index.ts` (insert ~581, update ~662, 684, 759, 767, 817, cancel ~499; usage_events ~809).

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

**Куда пишется:** из Edge `deepseek-chat` при наличии usage и user_id; из Edge `translate-recipe` для action_type `recipe_translation` после успешного вызова LLM (skipped-кейсы не логируются; best-effort, не ломает translation flow).

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

Список значений `feature` и связанных событий (только то, что реально есть в коде).

| event_name | Где вызывается | Таблица | Поля (кроме feature) | Когда |
|------------|----------------|---------|----------------------|--------|
| **Landing / prelogin** |
| landing_view | LandingOnboardingScreen, landingAnalytics | usage_events (через track-usage-event) | anon_id, session_id, page, entry_point, utm, properties | Просмотр лендинга |
| prelogin_view | AppPreloginScreen | usage_events | то же | Просмотр prelogin |
| landing_demo_open | landingEvents | usage_events | то же | Открытие демо |
| landing_demo_save_click | landingEvents | usage_events | то же | Клик «Сохранить» в демо |
| landing_cta_free_click | LandingOnboardingScreen, landingEvents | usage_events | то же | Клик CTA «Бесплатно» |
| **Auth** |
| auth_page_view | AuthPage | usage_events | то же | Просмотр страницы входа |
| auth_start | AuthPage | usage_events | то же | Начало попытки входа/регистрации |
| auth_success | AuthPage | usage_events | то же | Успешный вход/регистрация |
| auth_error | AuthPage | usage_events | properties: { message } | Ошибка входа |
| cta_start_click | AuthPage | usage_events | то же | Клик CTA «Начать» |
| share_recipe_cta_click | PublicRecipeSharePage, landingAnalytics | usage_events | то же | Клик CTA на публичной странице рецепта / лендинге |
| **Member** |
| member_create_start | AddChildForm | usage_events | то же | Начало создания члена семьи |
| member_create_success | AddChildForm | usage_events | properties: { member_id } | Успешное создание |
| **Paywall / trial / purchase** |
| paywall_view | Paywall | usage_events | properties: { source, paywall_reason } | Показ paywall |
| paywall_primary_click | Paywall, WeekPreviewPaywallSheet | usage_events | properties: { source } опционально | Клик по основной кнопке |
| paywall_secondary_click | Paywall | usage_events | — | Клик по вторичной кнопке |
| trial_started | Paywall, WeekPreviewPaywallSheet | usage_events | то же | После успешного start_trial() |
| purchase_start | useSubscription | usage_events | properties: { plan } | Начало оплаты |
| purchase_success | PaymentResult | usage_events | properties: { order_id } | Успешная оплата |
| purchase_error | PaymentResult | usage_events | properties: { order_id } | Ошибка оплаты |
| **Plan** |
| plan_view_day | MealPlanPage | usage_events | то же | Просмотр плана (день) |
| plan_fill_day_click | MealPlanPage | usage_events | — | Клик «Заполнить день/неделю» |
| plan_fill_day_success | MealPlanPage | usage_events | — | Успешное завершение генерации плана (клиент) |
| plan_fill_day_error | MealPlanPage | usage_events | properties: { message } | Ошибка генерации плана |
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
| **Share / viral** |
| share_click | ChatMessage, RecipePage | usage_events | properties: recipe_id, share_ref, channel, source_screen | Клик «Поделиться» (рецепт) |
| share_landing_view | PublicRecipeSharePage | usage_events | properties: recipe_id, share_ref, source (short_link), share_type | Просмотр публичной страницы рецепта по /r/:shareRef |
| share_day_plan_cta_click | SharedPlanPage | usage_events | — | Клик шаринга дня плана |
| share_week_plan_cta_click | SharedPlanPage | usage_events | — | Клик шаринга недели плана |
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

Реальная воронка по событиям и таблицам:

| Шаг | События / данные | Таблица / источник | SQL-идея |
|-----|------------------|--------------------|----------|
| 1. Visit | landing_view, prelogin_view | usage_events (anon_id или user_id) | COUNT по feature, created_at |
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

**Воронка share → visit → register → activation:**

- **Share:** share_click (properties: share_ref, channel, source_screen) + запись в share_refs при шаринге.
- **Visit:** share_landing_view (на /r или /recipe с ep/sr) — в properties могут быть share_ref, recipe_id, source.
- **Register:** auth_success с тем же anon_id (или последний entry_point=share_recipe в usage_events по user_id).
- **Activation:** например первый chat_recipe или member_create_success по этому user_id.

Для конверсии share → register можно связать по anon_id: события с share_landing_view (anon_id) и позже auth_success (тот же anon_id после регистрации передаётся с user_id).

---

## AI Usage

**Где пишется token_usage_log:** только Edge `deepseek-chat/index.ts`, после успешного ответа при наличии `data.usage` и авторизованном user_id.

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
| Conversion to premium | Записи в subscription_plan_audit за период; или purchase_success в usage_events. |
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
  │     └─ anon_id, session_id, page, entry_point, utm, properties (из localStorage/URL)
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
  │     └─ usage_events.insert (все клиентские feature)
  │
  └─ payment-webhook
        └─ subscription_plan_audit.insert
```

**Итог:** единая точка входа для продуктовых событий с фронта — Edge **track-usage-event** и таблица **usage_events**. Лимиты Free считаются по usage_events через RPC **get_usage_count_today**. Токены и планы — в **token_usage_log** и **plan_generation_jobs**. Оплата аудируется в **subscription_plan_audit**. Отдельного ETL или внешнего аналитического хранилища в проекте нет — аналитика строится по SQL поверх Supabase.
