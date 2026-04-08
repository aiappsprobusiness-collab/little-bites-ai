# Продуктовый аналитический слой (Stage 3)

Поверх `usage_events` и связанных таблиц: **view в БД** + **готовые SQL** в [sql/](./sql/).  
Taxonomy событий: [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md).

---

## 1. View: `analytics.usage_events_enriched`

**Миграции:** `20260331180000_analytics_usage_events_enriched_view.sql` (база), затем **`20260401120000_analytics_usage_events_enriched_stage5.sql`** (Stage 5), затем **`20260408120000_analytics_usage_events_enriched_replace_meal_paywall.sql`** (soft paywall замены блюда + trial onboarding + pricing_info).

**Назначение:** единая точка для отчётов без ручного `CASE` по `feature` в каждом запросе.

| Колонка | Описание |
|---------|----------|
| `event_timestamp`, `event_date_utc` | Из `created_at` (UTC date) |
| `feature_raw`, `canonical_feature` | Имя события в БД (сейчас совпадают) |
| `event_group` | acquisition, auth, paywall, meal_plan, chat, share, … |
| `event_type` | view, click, outcome, server_quota, limit_ui, other |
| `user_id`, `anon_id`, `session_id`, `member_id`, `page`, `entry_point` | Как в `usage_events` |
| `utm_*` | Как в базовой таблице |
| `properties`, `onboarding_json` | Полный jsonb и вложенный onboarding |
| `prop_*` | Частые ключи из `properties` (recipe_id, share_ref, plan_ref, paywall_reason, source, target, plan_scope, plan_source) |
| `onboarding_first_landing_path`, `onboarding_entry_point` | Из `properties.onboarding` |
| `is_authenticated` | `user_id IS NOT NULL` |
| `platform` | Из `properties.platform` (Stage 5: web / pwa / ios / android / unknown) |
| `prop_share_type`, `prop_entry_point` | Плоские копии из `properties` (удобство SQL; Stage 5) |

**RLS:** при выборке от имени `authenticated` действуют политики базовой `public.usage_events` (видны свои строки). Полные витрины — `service_role` / SQL Editor.

**Обновление:** при добавлении нового `feature` в приложении расширьте `CASE` в миграции (новая миграция `CREATE OR REPLACE VIEW`).

---

## 2. Воронки (SQL-файлы)

| Воронка | Файл | Метрики |
|---------|------|---------|
| **Activation** | [sql/funnel_activation.sql](./sql/funnel_activation.sql) | Пользователи с `auth_success` в окне → с последующей активацией; rate; median time to activation |
| **Paywall** | [sql/funnel_paywall.sql](./sql/funnel_paywall.sql) | paywall_view → primary_click → purchase_start → `subscription_plan_audit` |
| **Acquisition** | [sql/funnel_acquisition.sql](./sql/funnel_acquisition.sql) | Entry → CTA → auth_page → auth_success; когорта anon → auth |
| **Share** | [sql/funnel_share.sql](./sql/funnel_share.sql) | Shared plan view/CTA; recipe land + CTA пересечение |
| **Replace / favorites** | [sql/replace_engagement.sql](./sql/replace_engagement.sql) | Replace по users/source; favorite_add |
| **KPI за день** | [sql/product_kpi_daily.sql](./sql/product_kpi_daily.sql) | DAU, сигналы активации за день, paywall, billing, счётчики server quota |

Во всех файлах замените `params` / `day_bounds` на нужный диапазон дат.

---

## 3. Source of truth по слоям

| Вопрос | Где ответ |
|--------|-----------|
| Поведение пользователя (клики, просмотры) | `usage_events` / `analytics.usage_events_enriched` |
| Лимиты Free/Premium | Edge + `feature` server_quota (`chat_recipe`, `help`, `plan_fill_day`) |
| Подтверждённая оплата | `subscription_plan_audit` (webhook) |
| Создана короткая ссылка рецепта | `share_refs.created_at` (не дублируется событием) |
| Создан shared plan | `shared_plans.created_at` |
| Токены AI | `token_usage_log` |

---

## 4. Gaps (после Stage 5)

1. ~~Нет `share_link_created`~~ — **закрыто** (после persist ref).
2. ~~Нет `recipe_view`~~ — **закрыто** для экрана `/recipe/:id`, публичной `/r/`, демо welcome; **остаётся** gap для просмотра только в sheet без маршрута рецепта.
3. ~~`platform`~~ — **закрыто** (грубая классификация; PWA vs вкладка — только standalone).
4. Replace: **attempt/fail добавлены**; success rate считать по `replace_engagement.sql` (новый блок).
5. **Acquisition по `session_id`** хрупкая (новая вкладка = новый session) — для строгих когорт лучше опираться на `anon_id` + `auth_success` с тем же `anon_id`.
6. **`product_kpi_daily`** даёт «сигналы за день», не когортную activation rate — rate считать по `funnel_activation` с выбранным окном.
7. **Materialized view** не введены: при росте объёма можно добавить MV + refresh по cron (отдельная задача).

---

## 5. Что можно отвечать после Stage 3

- Сколько пользователей после регистрации дошло до активации (по выбранному набору событий) и за какое время.
- Конверсия paywall → клик → старт оплаты → запись в audit.
- Воронка входа на лендинг/shared → CTA → auth (в пределах anon/session).
- Просмотры shared-плана и клики CTA; пересечение landing → CTA для рецепта.
- Использование replace и избранного; разбивка replace по `properties.source`.
- DAU (по событиям с `user_id`) и дневные счётчики ключевых server/client событий.

---

## 6. Stage 4: retention, когорты, growth-диагностика

Документ с определениями, ограничениями и списком SQL: **[retention-and-cohorts.md](./retention-and-cohorts.md)**.

Кратко: D1/D7/D30 retention, когорты по неделе signup / entry point / onboarding source, paywall по `paywall_surface`×`reason`, share quality, разбивка пути активации, DAU/WAU/MAU, сводка `product_health_summary`. **Новых миграций и view в Stage 4 нет** — только SQL в `docs/analytics/sql/`.

Stage 5 зафиксирован в [STAGE5_TELEMETRY_ADDITIONS.md](../decisions/STAGE5_TELEMETRY_ADDITIONS.md) и [retention-and-cohorts.md §5](./retention-and-cohorts.md).

---

## 7. Идеи после Stage 4–5 (инфра)

- MV по `event_date_utc` для тяжёлых дашбордов.
- Единая функция `analytics.funnel_counts(p_from, p_to, p_name)` — по желанию.

---

## 8. Stage 6: dashboard pack

Готовые запросы для Metabase / SQL Editor: каталог **[dashboard-pack.md](./dashboard-pack.md)** и файлы `docs/analytics/sql/dashboard_*.sql`. Новых таблиц и view в БД Stage 6 не добавляет; определения DAU / activated / retention выровнены с существующими воронками и `retention_d1_d7_d30.sql`.
