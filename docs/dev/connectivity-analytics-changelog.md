# История правок: аналитика проверки связи (PWA startup)

Каноническое описание события и полей `properties`: **`docs/decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md`** (§3.0 PWA / connectivity).

---

## 2026-05-05 — UX: подсказка про VPN при таймауте

Текст **`timeout`** дополнен фразой про VPN: при многих блокировках запрос **висит** до `AbortController`, а не падает сразу с `Failed to fetch` — раньше пользователь попадал в ветку **`blocked`** (явный VPN-текст) реже, чем в **`timeout`**.

---

## 2026-05-05 — исправление: 401 на Supabase `/auth/v1/health`

**Симптом:** без заголовков `apikey` / `Authorization: Bearer <anon>` GoTrue отвечал **401** на health; клиент классифицировал ответ как `bad_response` («Проверка связи») или при долгом ответе — `timeout`, хотя сеть и VPN могли быть в порядке.

**Исправление:** в `src/utils/checkAppConnectivity.ts` для URL того же origin, что и `VITE_SUPABASE_URL`, к запросу health добавляются заголовки с `VITE_SUPABASE_ANON_KEY` (как у остальных вызовов Supabase с фронта).

**Тест:** `checkAppConnectivity.test.ts` — кейс с `vi.stubEnv` и проверкой заголовков.

---

## 2026-05-04 — внедрение `app_connectivity_result`

### Задача

Логировать исход проверки доступности бэкенда до монтирования `App` (`mountReactApp`), с учётом того, что при `blocked` / `no_internet` запрос в Supabase может не дойти.

### Поведение

1. **Событие:** `usage_events.feature = app_connectivity_result` (клиент → Edge `track-usage-event`).
2. **Отправка:** `trackUsageEventOk` в `src/utils/usageEvents.ts` возвращает `Promise<boolean>` (`true` при HTTP 2xx). Внутренний POST (`postTrackUsageEventToEdge`) больше не опирается на внешний `.catch` для учёта сетевых ошибок — ошибки обрабатываются внутри и возвращают `false`.
3. **Очередь:** ключ `localStorage` **`mr_connectivity_pending_analytics`**, до **8** записей. Если `trackUsageEventOk` вернул `false`, в очередь кладётся компактный объект (`outcome`, `check_ms`, `http_status?`, `health_source`, `deferred_at_ms`).
4. **Flush:** при `outcome === ok`** после** успешного health, и при старте со **`skipped`** (до монтирования App), вызывается `flushConnectivityAnalyticsQueue()` — последовательная попытка отправить записи с `delivery: "replay"` и исходным `deferred_at_ms`. Неудачные строки остаются в очереди.
5. **Код:** `src/utils/connectivityAnalytics.ts`, вызовы из `src/bootstrapReactApp.tsx` через `emitConnectivityAnalyticsSession` (не блокирует UI: `void` IIFE).
6. **HTTP в отчёте:** для `server_error` и `bad_response` в результат проверки добавлено поле `http_status` (`src/utils/checkAppConnectivity.ts`).

### Изменённые / добавленные файлы (код)

| Файл |
|------|
| `src/utils/usageEvents.ts` — `postTrackUsageEventToEdge` → `Promise<boolean>`; `trackUsageEventAwait` делегирует в `trackUsageEventOk`; экспорт `trackUsageEventOk` |
| `src/utils/connectivityAnalytics.ts` — новый модуль |
| `src/utils/connectivityAnalytics.test.ts` — тесты очереди и отправки (мок `trackUsageEventOk`) |
| `src/bootstrapReactApp.tsx` — `emitConnectivityAnalyticsSession`, замер `check_ms` |
| `src/utils/checkAppConnectivity.ts` — `http_status` в ошибочных HTTP-ответах |
| `src/utils/checkAppConnectivity.test.ts` — ожидания `http_status` |

### Документация

| Файл |
|------|
| `docs/decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md` — §3.0 |
| `docs/analytics/analytics-system.md` — абзац про старт PWA |
| `docs/dev/STARTUP_UI_AND_PLAN_LOADING.md` — строка в таблице проверки связи |
| `docs/dev/dev-notes.md` — ссылка на этот changelog |
| `docs/dev/connectivity-analytics-changelog.md` — этот файл (журнал) |

### SQL / дашборды

Новые миграции не требуются: события пишутся в существующую `usage_events`. Примеры срезов: фильтр `feature = 'app_connectivity_result'`, разбор `properties->>'outcome'`, `properties->>'delivery'`, платформа уже в `properties.platform` (как у остальных клиентских событий).

### Ограничения

- При длительном офлайне события могут накапливаться в очереди и доставляться пачкой при первом удачном сеансе — в метках времени в БД будет момент отправки, не момент сбоя; для приближения к моменту сбоя использовать `deferred_at_ms` в `properties` у `replay`.
