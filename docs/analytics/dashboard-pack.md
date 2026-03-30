# Dashboard pack (Stage 6)

Reporting layer поверх Stage 3–5: **один SQL-файл ≈ одна карточка/график** в Metabase, Supabase SQL Editor или другом BI. Источник данных: прежде всего `analytics.usage_events_enriched`, биллинг — `public.subscription_plan_audit`.

Подробнее о view и воронках: [product-metrics-layer.md](./product-metrics-layer.md), [retention-and-cohorts.md](./retention-and-cohorts.md). Taxonomy: [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](../decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md), Stage 5: [STAGE5_TELEMETRY_ADDITIONS.md](../decisions/STAGE5_TELEMETRY_ADDITIONS.md).

**Миграции / materialized views в Stage 6 не добавлялись** — запросы читают `usage_events_enriched` напрямую.

---

## 1. Канонические определения (чтобы цифры не расходились)

| Термин | Где используется | Определение |
|--------|------------------|-------------|
| **Active users / DAU (продуктовый)** | Executive trends, health flags, `wau_mau_stickiness.sql` | `user_id` с событием из набора meaningful activity (как в `retention_d1_d7_d30.sql`, без paywall/landing/auth-only). |
| **Activated users (сигнал активации)** | Executive KPI/trends, funnels | События: `chat_recipe`, `plan_fill_day`, `favorite_add`, `plan_slot_replace_success`, `plan_fill_day_success`, `help`, `recipe_view` — как в `funnel_activation.sql`. |
| **Auth users** | Trends, funnel | `auth_success` с непустым `user_id`. |
| **Purchase / billing** | Paywall, Executive | Подтверждение оплаты: строки `subscription_plan_audit` (время `created_at`, день UTC). |
| **Paywall conversion (proxy за день)** | Executive KPI, paywall trend | `billing_users_today / paywall_view_users_today` в **один календарный UTC-день** — не когортная воронка; для когорты см. `funnel_paywall.sql` и `dashboard_paywall_surfaces.sql`. |
| **Retention D1/D7/D30** | Retention dashboards | Когорта по первому `auth_success`; «вернулся» = meaningful activity в `cohort_date + N` (календарный UTC). См. шапку `retention_d1_d7_d30.sql`. |

Если в карточке явно не сказано иное, **не смешивайте** «active» и «activated».

---

## 2. Дашборды и SQL

### 2.1 Executive Overview (ежедневно)

| Карточка | SQL | SoT |
|----------|-----|-----|
| KPI за день (DAU/WAU/MAU, stickiness, активации, proxy paywall, покупки, share_link_created) | [sql/dashboard_exec_kpi_daily.sql](./sql/dashboard_exec_kpi_daily.sql) | meaningful / activation / audit |
| Тренды по дням | [sql/dashboard_exec_trends_daily.sql](./sql/dashboard_exec_trends_daily.sql) | те же определения + счётчики событий |
| Health flags (текущий день vs trailing avg) | [sql/dashboard_exec_health_flags.sql](./sql/dashboard_exec_health_flags.sql) | согласовано с trends |

### 2.2 Acquisition & Activation

| Карточка | SQL | SoT |
|----------|-----|-----|
| Entry points (`entry_point` на первом touch) | [sql/dashboard_acquisition_entry_points.sql](./sql/dashboard_acquisition_entry_points.sql) | pre-auth события + `anon_id`; см. gaps |
| Воронка entry → CTA → auth_page → auth | [sql/dashboard_activation_funnel.sql](./sql/dashboard_activation_funnel.sql) | как `funnel_acquisition.sql` |
| Пути активации + D7 proxy | [sql/dashboard_activation_paths.sql](./sql/dashboard_activation_paths.sql) | как `activation_path_breakdown.sql` |
| Когорты по неделе signup | [sql/dashboard_signup_cohorts.sql](./sql/dashboard_signup_cohorts.sql) | как `cohort_activation_by_signup_week.sql` |

### 2.3 Share / Virality

| Карточка | SQL | SoT |
|----------|-----|-----|
| Обзор (создания ссылок, views, CTA, auth stitch) | [sql/dashboard_share_overview.sql](./sql/dashboard_share_overview.sql) | события + anon→auth |
| По типу / scope | [sql/dashboard_share_by_type.sql](./sql/dashboard_share_by_type.sql) | `prop_share_type`, `prop_plan_scope` |
| Качество ref | [sql/dashboard_share_ref_quality.sql](./sql/dashboard_share_ref_quality.sql) | как `share_quality_diagnostics.sql` |
| Тренд по дням | [sql/dashboard_share_conversion_trend.sql](./sql/dashboard_share_conversion_trend.sql) | счётчики событий |

### 2.4 Paywall & Monetization

| Карточка | SQL | SoT |
|----------|-----|-----|
| Surface × reason | [sql/dashboard_paywall_surfaces.sql](./sql/dashboard_paywall_surfaces.sql) | `paywall_surface_performance.sql` |
| Тренд по дням | [sql/dashboard_paywall_trend.sql](./sql/dashboard_paywall_trend.sql) | usage_events + audit |
| Диагностика purchase (клиент vs billing) | [sql/dashboard_purchase_diagnostics.sql](./sql/dashboard_purchase_diagnostics.sql) | taxonomy + audit |
| Trial vs paid (объёмы, с оговорками) | [sql/dashboard_trial_vs_paid.sql](./sql/dashboard_trial_vs_paid.sql) | события + audit |

### 2.5 Retention & Cohorts

| Карточка | SQL | SoT |
|----------|-----|-----|
| Сводка D1/D7/D30 | [sql/dashboard_retention_summary.sql](./sql/dashboard_retention_summary.sql) | `retention_d1_d7_d30.sql` |
| По entry bucket | [sql/dashboard_retention_by_entry_point.sql](./sql/dashboard_retention_by_entry_point.sql) | `cohort_by_entry_point` + retention |
| По path активации | [sql/dashboard_retention_by_activation_path.sql](./sql/dashboard_retention_by_activation_path.sql) | только активировавшиеся |
| Heatmap по неделе signup | [sql/dashboard_cohort_heatmap_signup_week.sql](./sql/dashboard_cohort_heatmap_signup_week.sql) | retention по неделям |
| Onboarding source | [sql/dashboard_cohort_onboarding.sql](./sql/dashboard_cohort_onboarding.sql) | `cohort_onboarding_attribution.sql` |

### 2.6 Engagement / Product Usage

| Карточка | SQL | SoT |
|----------|-----|-----|
| Recipe views по source | [sql/dashboard_recipe_engagement.sql](./sql/dashboard_recipe_engagement.sql) | `recipe_view` |
| Replace attempt/success/fail | [sql/dashboard_replace_usage.sql](./sql/dashboard_replace_usage.sql) | Stage 5 replace |
| Избранное | [sql/dashboard_favorites_usage.sql](./sql/dashboard_favorites_usage.sql) | `favorite_add` |
| Core features по дням | [sql/dashboard_core_feature_usage.sql](./sql/dashboard_core_feature_usage.sql) | см. список feature в SQL |

---

## 3. Режим просмотра

- **Ежедневно (founder):** Executive KPI + trends (последние 7–14 дней), health flags, paywall trend, share overview.
- **Еженедельно (product):** signup cohorts, retention summary + по entry/path, paywall surfaces, activation paths, share ref quality, core feature usage.
- **Релиз / инцидент:** health flags, paywall trend, share conversion trend, replace usage, purchase diagnostics; сузить окно дат до 3–7 дней и сравнить с предыдущей неделей.

---

## 4. Gaps и ограничения

- **Анонимы** не входят в DAU/WAU/MAU продуктового определения.
- **Acquisition:** `session_id` / смена `anon_id` ломают стыковку; для строгих когорт см. комментарии в `funnel_acquisition.sql`.
- **Paywall same-day proxy** ≠ воронка в окне по пользователям.
- **Trial vs paid:** нет единой когортной метрики trial→paid без джойна к `profiles_v2` / подпискам (не входило в pack).
- **Избранное:** только `favorite_add`; снятие/«активные» в избранном — не через этот pack.
- **Onboarding cohort:** только пользователи с непустым `onboarding` на `auth_success` в выборке.
- **Retention по path активации:** знаменатель — только пользователи с записанной первой активацией в окне (не все зарегистрированные).

---

## 5. Перенос в BI

- Подставляйте даты в CTE `params` в начале каждого файла (или замените на переменные Metabase `{{reference_date}}` и т.д.).
- Для тяжёлых дашбордов при росте объёма см. идеи MV в [product-metrics-layer.md §7](./product-metrics-layer.md) — отдельная задача.
