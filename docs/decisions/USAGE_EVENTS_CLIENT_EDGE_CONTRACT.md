# Контракт: клиентские vs серверные события `usage_events`

**Статус:** каноническое поведение после Stage 1 hardening (2026-03).  
**Связанные файлы:** `supabase/functions/track-usage-event/index.ts`, `supabase/functions/_shared/trackUsageClientPolicy.ts`, зеркало `src/utils/trackUsageClientPolicy.ts`, `src/utils/usageEvents.ts`.

## Limit-sensitive features (только сервер)

Эти значения `feature` участвуют в `get_usage_count_today` и **не принимаются** через Edge `track-usage-event` (ответ `200` с `ok: false`, `error: forbidden_feature`). На клиенте `trackUsageEvent` для них — no-op (dev: предупреждение в консоль).

| feature | Кто пишет |
|---------|-----------|
| `chat_recipe` | `deepseek-chat` |
| `help` | `deepseek-chat` |
| `plan_fill_day` | `generate-plan` |
| `plan_refresh` | зарезервировано в миграции; в коде не пишется — запрет с клиента для симметрии |

Любая другая строка `feature` с клиента **разрешена** для продуктовой аналитики (до появления отдельного строгого allowlist).

## Клиентский helper (`usageEvents.ts`)

- **Dedup:** короткое окно для «действий» (~550 ms), длиннее для списка view-событий (~4 s); ключ включает `feature`, `page`, `entry_point`, fingerprint переданных `properties` (не merged share/onboarding), чтобы разные клики с разными параметрами не склеивались.
- **Ошибки сети / HTTP error:** backoff **только по данному `feature`** (~12 s), без глобальной блокировки остальных событий.
- **Атрибуция:** в `properties` добавляется вложенный объект `onboarding` из `onboarding_attribution` (если есть); если `last_touch_utm` пуст, колонки `utm_*` в запросе заполняются из onboarding UTM.

## Новые продуктовые события (Stage 1)

| feature | Источник |
|---------|----------|
| `shared_plan_view` | клиент, `SharedPlanPage` |
| `plan_slot_replace_success` | клиент, `useReplaceMealSlot` |
| `landing_demo_open` / `landing_demo_save_click` | клиент, welcome + `WelcomeRecipeBlock` |

Подробная таблица событий — `docs/analytics/analytics-system.md`.

## Stage 2 (taxonomy)

Группы событий, legacy mapping, CTA matrix, разделение продуктовой аналитики и billing — [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](./ANALYTICS_EVENT_TAXONOMY_STAGE2.md).

## Stage 5 (telemetry gaps)

События `recipe_view`, `share_link_created`, `plan_slot_replace_attempt`, `plan_slot_replace_fail`; во все исходящие события в `properties` добавляется **`platform`** (`web` \| `pwa` \| `ios` \| `android` \| `unknown`). Детали и payload — [STAGE5_TELEMETRY_ADDITIONS.md](./STAGE5_TELEMETRY_ADDITIONS.md).

Limit-sensitive список **не менялся** — по-прежнему только `chat_recipe`, `help`, `plan_fill_day`, `plan_refresh`.
