# Аналитика: каноническая taxonomy и legacy mapping (Stage 2)

**Статус:** source of truth для интерпретации `usage_events.feature` после Stage 1 + Stage 2 + **Stage 5** (новые события и `platform` — [STAGE5_TELEMETRY_ADDITIONS.md](./STAGE5_TELEMETRY_ADDITIONS.md)).  
**Связь:** [USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md](./USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md), [analytics-system.md](../analytics/analytics-system.md).

---

## 1. Принципы

- **Канон** = как событие **должно** трактоваться в отчётах; имя строки в БД не всегда идеально отражает группу — смотреть эту таблицу.
- **Переименования в Stage 2 не массовые:** исторические имена сохранены, где есть риск для SQL/дашбордов.
- **Дубли по смыслу** описаны в §4 (legacy mapping), а не удаляются из кода.

### Типы событий (логические)

| Тип | Смысл |
|-----|--------|
| **view** | Показ экрана/модалки/секции (часто с суффиксом `_view` / `_open`) |
| **click** | Явный клик по CTA / кнопке |
| **outcome** | Результат операции (success / error / limit) |
| **server_quota** | Учёт лимитов / биллинга на Edge (limit-sensitive) |

---

## 2. Группы (canonical groups)

| Группа | Назначение |
|--------|------------|
| **acquisition** | Лендинг, prelogin, демо, первичные CTA до auth |
| **auth** | Страница входа/регистрации |
| **onboarding** | Создание профиля ребёнка / члена семьи |
| **paywall** | Показ paywall, клики по офферу |
| **subscription_client** | Клиентские сигналы trial/оплаты (не финансовый SoT) |
| **meal_plan** | План приёмов, заполнение, замена слота |
| **chat** | Экран чата, генерация рецепта в чате (продуктовые события) |
| **help** | Раздел «Помощь маме» / SOS |
| **recipe** | Legacy-группа в тексте документа; в view `analytics` группа **`recipes`** для `recipe_view` |
| **share** | Шаринг и публичные shared-страницы |
| **favorites** | Избранное |
| **ads** | Реклама (stub / флаг) |
| **limits_ui** | Достижение скрытых лимитов Premium/Trial в UI |

### Limit-sensitive (только Edge, см. contract)

`chat_recipe`, `help`, `plan_fill_day`, `plan_refresh` (зарезервировано) — **server_quota**, не клиент.

---

## 3. Полный каталог событий по группам

### 3.1 Acquisition

| feature | Тип | Источник | Примечание |
|---------|-----|----------|------------|
| `landing_view` | view | Welcome | |
| `prelogin_view` | view | AppPreloginScreen | PWA prelogin |
| `landing_demo_open` | view | WelcomeRecipeBlock | Демо-рецепт показан |
| `landing_cta_free_click` | click | Welcome | CTA → signup flow |
| `landing_cta_login_click` | click | Welcome | CTA «Войти» → /auth |
| `prelogin_cta_click` | click | AppPreloginScreen | `properties.target`: `login` \| `signup` |
| `landing_demo_save_click` | click | Welcome | Перед `landing_cta_free_click`, если демо было в viewport |

### 3.2 Auth

| feature | Тип | Источник |
|---------|-----|----------|
| `auth_page_view` | view | AuthPage |
| `auth_start` | click | Начало submit login/signup |
| `cta_start_click` | click | Кнопка «Начать» (дублирует старт с welcome-контекста) |
| `auth_success` | outcome | Успешный вход/регистрация |
| `auth_error` | outcome | Ошибка |

### 3.3 Onboarding

| feature | Тип | Источник |
|---------|-----|----------|
| `member_create_start` | click | AddChildForm |
| `member_create_success` | outcome | AddChildForm |

### 3.3.1 Trial onboarding (после `start_trial`)

| feature | Тип | Источник | properties |
|---------|-----|----------|--------------|
| `trial_onboarding_shown` | view | TrialActivatedModal | — |
| `trial_onboarding_closed` | click | TrialActivatedModal: «Продолжить», крестик | — |
| `pricing_info_opened` | view | FreeVsPremiumModal, TrialActivatedModal | опц. `source`: `replace_meal_soft_paywall` \| `trial_onboarding` |

### 3.4 Paywall

| feature | Тип | Источник | properties |
|---------|-----|----------|--------------|
| `paywall_view` | view | UnifiedPaywall, WeekPreviewPaywallSheet | `paywall_reason` и/или `source`, `paywall_surface` |
| `paywall_primary_click` | click | Paywalls, WeekPreview | Unified: `paywall_reason`; week_preview: `source: week_preview` |
| `paywall_secondary_click` | click | Unified/Legacy | |
| `paywall_replace_meal_shown` | view | ReplaceMealSoftPaywallModal (клик «Заменить блюдо» на Free) | опц. `member_id` |
| `trial_started_from_replace_meal` | outcome | После успешного `startTrial()` из soft paywall замены | — |
| `paywall_closed_replace_meal` | click | ReplaceMealSoftPaywallModal: «Назад» | — |
| `trial_started` | outcome | После успешного `startTrial()` | |

### 3.5 Subscription / оплата (клиент)

| feature | Тип | Источник | SoT |
|---------|-----|----------|-----|
| `purchase_start` | click | useSubscription | Продукт: намерение оплатить |
| `purchase_success` | outcome | PaymentResult | Продукт; **финансы** → webhook + `subscription_plan_audit` |
| `purchase_error` | outcome | PaymentResult | Продукт |

### 3.6 Meal plan

| feature | Тип | Источник |
|---------|-----|----------|
| `plan_view_day` | view | MealPlanPage |
| `plan_fill_day_click` | click | Заполнить день/неделю |
| `plan_fill_day_success` | outcome | Клиент: вызов генерации завершён успешно |
| `plan_fill_day_error` | outcome | Клиент: ошибка |
| `plan_fill_day` | server_quota | generate-plan (free) | **Не путать** с клиентскими `plan_fill_*` |
| `plan_slot_replace_attempt` | click | useReplaceMealSlot | `day_key`, `meal_type`, `source` |
| `plan_slot_replace_fail` | outcome | useReplaceMealSlot | `reason`, опц. `error_type` / `fail_code` |
| `plan_slot_replace_success` | outcome | useReplaceMealSlot | `source`: assign, pool_pick, ai_chat, auto_pool, auto_ai |
| `partial_week_toast_favorites_click` | click | Toast частичной недели |
| `partial_week_toast_assistant_click` | click | Toast → ассистент |

### 3.7 Chat

| feature | Тип | Источник |
|---------|-----|----------|
| `chat_open` | view | ChatPage |
| `chat_generate_click` | click | Режим рецептов |
| `chat_generate_success` | outcome | Клиент после успеха |
| `chat_generate_error` | outcome | Клиент |
| `chat_recipe` | server_quota | deepseek-chat | Лимиты + метрика успешной генерации |

### 3.8 Help

| feature | Тип | Источник |
|---------|-----|----------|
| `help_open` | view | SosTiles |
| `help_topic_open` | view | SosTiles |
| `help_answer_received` | outcome | ChatPage help mode |
| `help` | server_quota | deepseek-chat | Лимиты help |
| `premium_help_limit_reached` | limits_ui | ChatPage, SosTiles |

### 3.9 Recipe (экран рецепта)

| feature | Тип | Источник | properties |
|---------|-----|----------|------------|
| `recipe_view` | view | RecipePage, PublicRecipeSharePage, WelcomeRecipeBlock (демо welcome) | `recipe_id`, `source` (plan/favorites/shared/welcome_demo/chat/other), `is_public`, опц. `share_ref` |
| `share_landing_view` | view | PublicRecipeSharePage, RecipePage (ep/sr) | |
| `share_click` | click | RecipePage, ChatMessage | |

**SoT «открыл карточку рецепта» в продуктовой аналитике:** `recipe_view` (не путать с `share_landing_view` — вход по ссылке до просмотра контента).

### 3.10 Share / virality

| feature | Тип | Источник | properties |
|---------|-----|----------|------------|
| `shared_plan_view` | view | SharedPlanPage | `plan_ref`, `plan_scope`, `cta_variant` |
| `shared_plan_not_found_view` | view | SharedPlanPage | Невалидный/устаревший ref |
| `share_link_created` | outcome | После успешного insert `share_refs` / `shared_plans` | `share_type`, `share_ref`, `surface`, опц. `recipe_id`, `has_native_share` |
| `share_recipe_cta_click` | click | PublicRecipeSharePage | |
| `share_day_plan_cta_click` | click | SharedPlanPage | `plan_ref`, `share_type`, `entry_point` (Stage 5) |
| `share_week_plan_cta_click` | click | SharedPlanPage | то же |

**Цепочка recipe share:** `share_link_created` (после persist ref) → `share_click` → … → получатель: `share_landing_view` → `recipe_view` → `share_recipe_cta_click` → `/auth` / welcome с query → `auth_success` (с тем же `anon_id` / attribution).

**Цепочка plan share:** `share_link_created` (после insert `shared_plans`) → `shared_plan_view` → CTA → `share_*_plan_cta_click` (с `plan_ref` в properties) → welcome с `entry_point`, `share_ref`.

### 3.11 Favorites

| feature | Тип | Источник |
|---------|-----|----------|
| `favorite_add` | outcome | useFavorites |
| `favorite_remove` | outcome | useFavorites |

### 3.12 Ads

| feature | Тип | Источник |
|---------|-----|----------|
| `ad_rewarded_shown` | view | StubRewardedAdProvider |
| `ad_rewarded_dismissed` | outcome | |
| `ad_rewarded_completed` | outcome | |

### 3.13 Limits UI (Premium/Trial)

| feature | Тип | Источник |
|---------|-----|----------|
| `premium_chat_limit_reached` | limits_ui | ChatPage |

---

## 4. Legacy mapping и неоднозначности

| Имя в БД | Статус | Канонический смысл / дубли |
|----------|--------|----------------------------|
| `cta_start_click` | active, специфично | См. `auth_start` — часто пара на одном действии с welcome; в отчётах считать «вход в воронку auth с welcome» |
| `auth_start` | active canonical | Начало попытки login/signup |
| `plan_fill_day` (сервер) | server canonical | Один successful free run; **не** эквивалент `plan_fill_day_success` |
| `plan_fill_day_success` | active client | Успех на клиенте; для строгого «записано в план» смотреть Edge + jobs |
| `chat_generate_success` | active client | UX-успех; **лимит** и «факт генерации» для Free — `chat_recipe` на Edge |
| `paywall_primary_click` (LegacyPaywall) | active, без `paywall_reason` | Исторически; Unified заполняет reason — в SQL группировать с фильтром `properties` |
| `landingEvents` (объект TS) | **удалён Stage 2** | Был неиспользуемым; вызывать `trackLandingEvent` / `trackUsageEvent` напрямую |

---

## 5. CTA matrix (ключевые поверхности)

| Поверхность | view | click → next step |
|-------------|------|-------------------|
| Welcome `/welcome` | `landing_view` | `landing_cta_free_click` / `landing_cta_login_click` → `/auth` |
| Welcome демо | `landing_demo_open` | `landing_demo_save_click` (условно) + `landing_cta_free_click` |
| Prelogin `/prelogin` | `prelogin_view` | `prelogin_cta_click` → `/auth` |
| Auth | `auth_page_view` | `auth_start` → `auth_success` |
| Public recipe `/r/...` | `share_landing_view` | `share_recipe_cta_click` → `/auth` |
| Shared plan `/p/...` | `shared_plan_view` / `shared_plan_not_found_view` | `share_day_plan_cta_click` / `share_week_plan_cta_click` → `/welcome?...` |
| Paywall modal | `paywall_view` | `paywall_primary_click` / `paywall_secondary_click` → trial / оплата / закрытие |
| Week preview sheet | `paywall_view` (source=week_preview) | `paywall_primary_click` → trial или открытие Unified paywall |

Атрибуция: колонки `entry_point`, `utm_*`, `properties.onboarding`, `properties.share_*` — см. `usageEvents.ts`.

---

## 6. Funnel: acquisition → activation → conversion (как читать данные)

1. **До auth:** acquisition events + `shared_*` / `share_landing_view` → `auth_page_view` → `auth_success`.
2. **Активация:** `member_create_success` → первый `chat_recipe` (Edge) или `plan_fill_day` (Edge) или `favorite_add` / `plan_slot_replace_success` / **`recipe_view`** (по продукту).
3. **Monetization:** `paywall_view` → `trial_started` / `purchase_start` → `purchase_success` (клиент) **и** `subscription_plan_audit` (подтверждение оплаты).

---

## 7. Billing / продуктовая аналитика (разделение)

| Слой | Где | Назначение |
|------|-----|------------|
| **Поведение пользователя** | `usage_events` с клиента | Воронки, CTA, UX |
| **Лимиты** | `usage_events` + `get_usage_count_today` | Edge-only features |
| **Финансовый факт подписки** | `subscription_plan_audit`, профиль после webhook | SoT после оплаты |
| **Токены AI** | `token_usage_log` | Стоимость / нагрузка модели |

`purchase_success` / `purchase_error` — удобны для продуктовых воронок; **не заменяют** audit-таблицу для финансовой сверки.

---

## 8. SQL-заметки

- Группировка по «канону»: используйте `CASE WHEN feature IN (...)` по группам из §3 или JOIN к справочнику (можно материализовать из этого файла).
- События с `properties.source`, `properties.paywall_reason` — фильтровать в JSONB при узких отчётах.
