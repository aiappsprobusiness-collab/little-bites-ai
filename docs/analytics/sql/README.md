# SQL: продуктовая аналитика

Готовые запросы для Supabase SQL Editor / Metabase / BI. Подставьте даты вместо плейсхолдеров.

## Stage 3 — воронки и дневные KPI

| Файл | Назначение |
|------|------------|
| [funnel_activation.sql](./funnel_activation.sql) | Активация после auth (SoT по событиям) |
| [funnel_paywall.sql](./funnel_paywall.sql) | Paywall + billing (`subscription_plan_audit`) |
| [funnel_acquisition.sql](./funnel_acquisition.sql) | Лендинг / shared → auth |
| [funnel_share.sql](./funnel_share.sql) | Вирусность плана и рецепта |
| [replace_engagement.sql](./replace_engagement.sql) | Replace, избранное |
| [product_kpi_daily.sql](./product_kpi_daily.sql) | Сводка DAU / конверсии за день |

## Stage 4 — retention, когорты, growth

| Файл | Назначение |
|------|------------|
| [retention_d1_d7_d30.sql](./retention_d1_d7_d30.sql) | Retention D1/D7/D30 + сегменты |
| [cohort_activation_by_signup_week.sql](./cohort_activation_by_signup_week.sql) | Когорты по неделе signup, активация, paywall, purchase |
| [cohort_by_entry_point.sql](./cohort_by_entry_point.sql) | Когорты по типу входа (landing / shared / prelogin) |
| [cohort_onboarding_attribution.sql](./cohort_onboarding_attribution.sql) | Когорты по `onboarding.source` |
| [share_quality_diagnostics.sql](./share_quality_diagnostics.sql) | Share: not_found, CTA, day/week, anon→auth |
| [paywall_surface_performance.sql](./paywall_surface_performance.sql) | Paywall surface × reason, конверсии |
| [activation_path_breakdown.sql](./activation_path_breakdown.sql) | Первый путь активации + D7 по путям |
| [wau_mau_stickiness.sql](./wau_mau_stickiness.sql) | DAU, WAU, MAU, stickiness |
| [product_health_summary.sql](./product_health_summary.sql) | Сводный health по окну |

## Stage 6 — dashboard-ready SQL

Один файл ≈ одна карточка/график в BI. Список дашбордов, SoT и gaps: **[dashboard-pack.md](../dashboard-pack.md)**.

| Префикс файла | Назначение |
|----------------|------------|
| `dashboard_exec_*` | Executive: KPI, тренды, health flags |
| `dashboard_acquisition_*`, `dashboard_activation_*`, `dashboard_signup_*` | Вход, воронка, пути, недельные когорты |
| `dashboard_share_*` | Share / virality |
| `dashboard_paywall_*`, `dashboard_purchase_*`, `dashboard_trial_*` | Paywall и монетизация |
| `dashboard_retention_*`, `dashboard_cohort_*` | Retention и когорты |
| `dashboard_recipe_*`, `dashboard_replace_*`, `dashboard_favorites_*`, `dashboard_core_*` | Engagement |

**Определения когорт и retention:** [retention-and-cohorts.md](../retention-and-cohorts.md).

**View в БД:** после миграции `20260331180000_analytics_usage_events_enriched_view.sql` доступен `analytics.usage_events_enriched`.

Обзор Stage 3: [product-metrics-layer.md](../product-metrics-layer.md). Контекст системы: [analytics-system.md](../analytics-system.md).
