# Stage 5: закрытие ключевых telemetry gaps

**Статус:** реализовано в коде + миграция view `analytics.usage_events_enriched`.  
**Связь:** [ANALYTICS_EVENT_TAXONOMY_STAGE2.md](./ANALYTICS_EVENT_TAXONOMY_STAGE2.md), [USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md](./USAGE_EVENTS_CLIENT_EDGE_CONTRACT.md), [analytics-system.md](../analytics/analytics-system.md).

## Что добавлено

| Событие / поле | Назначение | SoT |
|----------------|-------------|-----|
| `recipe_view` | Пользователь увидел полноценную карточку рецепта | Клиент: `RecipePage`, `PublicRecipeSharePage`, `WelcomeRecipeBlock` (только демо на welcome) |
| `share_link_created` | Запись share ref после успешного persist | После insert в `share_refs` или `shared_plans` |
| `properties.platform` | web \| pwa \| ios \| android \| unknown | Каждый вызов `trackUsageEvent` (`getAnalyticsPlatform`) |
| `plan_slot_replace_attempt` | Старт попытки замены слота | `useReplaceMealSlot` |
| `plan_slot_replace_fail` | Неуспех (пул, лимит, HTTP, persist, валидация и т.д.) | `useReplaceMealSlot` |
| `plan_slot_replace_success` | Без изменения смысла; при прямом assign — attempt+success в одном flow | `useReplaceMealSlot` |

## Payload (канон)

### `recipe_view`

- `recipe_id` (uuid)
- `source`: `plan` \| `favorites` \| `shared` \| `welcome_demo` \| `chat` \| `other` (навигация `location.state` / query `ep`/`sr`)
- `is_public`: boolean (`true` на `/r/:ref`)
- опционально `share_ref` на публичной странице

### `share_link_created`

- `share_type`: `recipe` \| `day_plan` \| `week_plan`
- `share_ref`: строка ref
- `surface`: `recipe_page` \| `chat` \| `meal_plan_share`
- опционально `recipe_id`, `has_native_share` (recipe only)

### `platform`

- Значения: `web`, `pwa` (standalone / iOS home screen), `ios`, `android` (Capacitor native), `unknown`
- PWA vs обычный браузер: только по standalone; отдельно «установлено, но открыто во вкладке» не различаем.

### Replace attempt / fail

- Общие: `day_key`, `meal_type`, `source` (pool_pick, ai_chat, assign, auto_pool, auto_ai, auto)
- fail: `reason` (короткий код), опционально `error_type`, `fail_code`

## Share attribution (усиление)

- `share_day_plan_cta_click` / `share_week_plan_cta_click`: в `properties` добавлены `plan_ref`, `share_type`, `entry_point` для связки с `shared_plan_view`.

## Миграции

- `20260401120000_analytics_usage_events_enriched_stage5.sql` — обновление view: новые `event_group` / `event_type`, `platform` и плоские `prop_share_type`, `prop_entry_point` из `properties`.

## Оставшиеся gaps

- Нет отдельного события для «открыл рецепт в sheet/modal» без перехода на `/recipe/:id` (например FavoriteRecipeSheet).
- `fromChat` на `RecipePage` пока не проставляется при навигации из чата (если появится переход — передать `state.fromChat`).
- Точная склейка «одна попытка auto» при retry внутри `replaceMealSlotAuto` — два HTTP-вызова могут дать один success (attempt один на UX-кнопку).

## Приоритет Stage 6 (идеи)

- `recipe_sheet_view` или единый параметр `surface` на все модалки рецепта.
- Явный `session_replay_id` — не планируется без отдельного продукта.
