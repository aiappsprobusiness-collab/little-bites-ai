# Retention, когорты и growth-диагностика (Stage 4)

Поверх Stage 3 ([product-metrics-layer.md](./product-metrics-layer.md)). Все запросы — в [sql/](./sql/), только чтение; **новых миграций и telemetry на Stage 4 не добавлялось**.

---

## 1. Определения

### 1.1 Когорта «регистрация»

- **Дата когорты:** UTC-календарная дата **первого** `auth_success` для `user_id` (за всю историю в таблице), если не оговорено иное.
- **Окно отбора когорты:** в SQL задаётся `cohort_from` / `cohort_to` — в анализ попадают только пользователи, у которых эта дата первого auth попадает в интервал.

### 1.2 Активация (Stage 3 + 5)

События после `first_auth_at`:

`chat_recipe`, `plan_fill_day`, `favorite_add`, `plan_slot_replace_success`, `plan_fill_day_success`, `help`, **`recipe_view`**.

В **activation_path_breakdown** в первый путь также включены `chat_generate_success` и `plan_fill_day_click` (тоньше разбиение пути).

### 1.3 Активность / «вернулся» (retention и WAU/MAU)

**Meaningful / active use** — не менее одного события за календарный UTC-день из списка:

`chat_recipe`, `plan_fill_day`, `help`, `favorite_add`, `plan_slot_replace_success`, `plan_fill_day_success`, `chat_generate_success`, `member_create_success`, `plan_fill_day_click`, `chat_open`, `plan_view_day`, `share_click`, **`recipe_view`**.

**Не входят:** `paywall_*`, `landing_*`, `prelogin_*`, `auth_*`, `ad_rewarded_*`, «голые» просмотры share без продукта.

### 1.4 Retention D1 / D7 / D30

- **D1:** активность в дату `cohort_date + 1` (UTC).
- **D7:** `cohort_date + 7`.
- **D30:** `cohort_date + 30`.

**Цензурирование:** пользователь учитывается в знаменателе D*k* только если `cohort_date + k <= data_through` (чтобы не занижать retention из-за «ещё не наступившего» дня).

### 1.5 Когорты по входу (`cohort_by_entry_point`)

Первое событие **до** `first_auth_at` с тем же `anon_id`, среди  
`landing_view`, `prelogin_view`, `shared_plan_view`, `share_landing_view` (по времени). Иначе — `other_unknown`.

**Ограничение:** без `anon_id` или с обрывом anon — попадание в `other_unknown`.

### 1.6 Onboarding-атрибуция (`cohort_onboarding_attribution`)

Пользователи с **первым** `auth_success` в окне когорты, у которых на этом событии непустой `properties.onboarding`. Группировка по `onboarding.source` (или `(no_onboarding_source)`).

**Ограничение:** пользователи без onboarding на auth в окне **не попадают** в этот отчёт (это когорта «с сохранённой атрибуцией», не вся база).

### 1.7 Paywall surface

Из **первого** `paywall_view` пользователя в окне:  
`properties->>'paywall_surface'`, `properties->>'paywall_reason'`.  
Unified/Legacy часто **не** шлют `paywall_surface` — bucket `(null_unified_legacy)`.

### 1.8 Billing (monetization SoT)

Подтверждение оплаты — **`subscription_plan_audit`**. Клиентские `purchase_*` — продуктовый слой, не замена audit.

---

## 2. Source of truth (напоминание)

| Вопрос | Источник |
|--------|----------|
| Поведение, воронки | `analytics.usage_events_enriched` |
| Подтверждённая оплата | `subscription_plan_audit` |
| Создание short link рецепта | `share_refs` (не событие) |
| Токены AI | `token_usage_log` (не продуктовый engagement) |

---

## 3. Файлы SQL (Stage 4)

| Файл | Назначение |
|------|------------|
| [sql/retention_d1_d7_d30.sql](./sql/retention_d1_d7_d30.sql) | D1/D7/D30 + сегменты |
| [sql/cohort_activation_by_signup_week.sql](./sql/cohort_activation_by_signup_week.sql) | Неделя signup → активация, paywall, purchase |
| [sql/cohort_by_entry_point.sql](./sql/cohort_by_entry_point.sql) | Landing / shared / prelogin / other |
| [sql/cohort_onboarding_attribution.sql](./sql/cohort_onboarding_attribution.sql) | Когорты по `onboarding.source` |
| [sql/share_quality_diagnostics.sql](./sql/share_quality_diagnostics.sql) | Качество share, not_found, day/week |
| [sql/paywall_surface_performance.sql](./sql/paywall_surface_performance.sql) | Surface × reason, trial/purchase грубые объёмы |
| [sql/activation_path_breakdown.sql](./sql/activation_path_breakdown.sql) | Первый путь активации + D7 по путям |
| [sql/wau_mau_stickiness.sql](./sql/wau_mau_stickiness.sql) | DAU/WAU/MAU, stickiness |
| [sql/product_health_summary.sql](./sql/product_health_summary.sql) | Сводный снимок окна |

---

## 4. Gaps (что всё ещё нельзя надёжно)

- **Stitching anon → user:** retention и WAU только по `user_id`; анонимы и обрывы `anon_id` искажают acquisition/share связки.
- **Share ref → CTA → auth:** для плана CTA теперь несут `plan_ref` / `share_type` / `entry_point` в properties; для рецепта по-прежнему смотреть цепочку `share_link_created` → view → CTA.
- **Recipe open:** `recipe_view` есть для `/recipe/:id`, `/r/`, демо welcome; **нет** для просмотра только в sheet без маршрута рецепта.
- **Platform:** грубые значения; не различаем «установленная PWA, открытая во вкладке браузера».
- **Trial vs premium:** нет единой таблицы подписки в этих SQL — только события + audit; точное состояние «на дату» не восстанавливается.
- **Когортный D7 в `product_health_summary`:** намеренно заменён на proxy «≥2 активных календарных дня в окне»; классический D7 — только в `retention_d1_d7_d30.sql`.

---

## 5. Stage 5 (выполнено) и остаточные идеи

Реализовано: см. [STAGE5_TELEMETRY_ADDITIONS.md](../decisions/STAGE5_TELEMETRY_ADDITIONS.md) (`recipe_view`, `share_link_created`, `platform`, replace attempt/fail, `plan_ref` на CTA плана).

Дальше по желанию: просмотр рецепта в sheet без `/recipe/:id`; более явные checkout-события; MV для тяжёлых отчётов.
