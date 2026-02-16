# Quality Debug Workflow: сбор логов генерации плана

Скрипт `collect-plan-debug-logs.mjs` запускает генерацию week/day через Edge `generate-plan` с `debug_pool=true`, затем вытягивает Edge Logs и сохраняет отчёт в `reports/`.

## Необходимые переменные окружения (.env)

| Переменная | Описание |
|------------|----------|
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SUPABASE_ANON_KEY` или `VITE_SUPABASE_ANON_KEY` | Anon key (auth и polling) |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | Тестовый пользователь (или `HARNESS_TOKEN`) |
| `SUPABASE_ACCESS_TOKEN` или `SUPABASE_PAT` | **Опционально.** Personal Access Token для Management API — без него логи не подтягиваются автоматически (fallback: job + meal_plans snapshot) |

PAT создаётся на [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens).

## Команды запуска

### Базовая команда (семья, week, debug)

```bash
npm run debug:plan
```

### Профиль (member_id)

```bash
node scripts/collect-plan-debug-logs.mjs --mode week --member <uuid> --debug
```

### Семья (member_id=null)

```bash
node scripts/collect-plan-debug-logs.mjs --mode week --debug
```

### Один день

```bash
node scripts/collect-plan-debug-logs.mjs --mode day --member <uuid> --debug
```

### Опции

- `--mode week|day` — режим (default: week)
- `--member <uuid>` — ID профиля (если не указано — family)
- `--start YYYY-MM-DD` — дата начала (default: сегодня)
- `--timeoutSec N` — таймаут в секундах (default: 420 для week, 180 для day)
- `--debug` — включает `debug_pool=true`
- `--token <jwt>` — использовать готовый JWT вместо sign-in

## Где лежит отчёт

`reports/plan_debug_<mode>_<memberOrFamily>_<timestamp>.json`

Пример: `reports/plan_debug_week_family_2025-02-16T14-30-00.json`

## Структура отчёта

```json
{
  "request": { "type", "member_id", "member_data", "start_key", "debug_pool", ... },
  "job": { "status", "progress_done", "progress_total", "error_text", "started_at", "finished_at" },
  "mealPlansSnapshot": [...],
  "logs": {
    "candidates_snapshot": [...],
    "allergy": [...],
    "sanity": [...],
    "plan_quality": [...],
    "job": [...],
    "pool_upgrade": [...],
    "other": [...]
  }
}
```

## Что отправлять в чат

Для диагностики качества можно отправить фрагменты отчёта:

- `report.logs.candidates_snapshot[0]` — снапшот кандидатов пула
- `report.logs.allergy[0]` — аллергии
- `report.logs.sanity[0]` — sanity-нарушения
- `report.logs.plan_quality` — итоги качества
- `report.logs.job` — итоговые статусы job

## Fallback без SUPABASE_ACCESS_TOKEN

Если PAT не задан, скрипт сохраняет:

- `job` — статус и ошибки
- `mealPlansSnapshot` — срез `meal_plans_v2`

В консоль выводится инструкция, как включить `SUPABASE_ACCESS_TOKEN` или смотреть логи в Dashboard:
`https://supabase.com/dashboard/project/<ref>/logs/edge-logs`
