# Документация проекта Little Bites AI

Структура и назначение папок в `docs/`.

## AI entry point

If you are an AI agent working with this repository, read the following documents first:

1. docs/PROJECT_CONTEXT.md
2. docs/database/DATABASE_SCHEMA.md
3. docs/architecture/CHAT_HISTORY_SOURCE_OF_TRUTH.md
4. docs/architecture/chat_recipe_generation.md

These documents provide the core project context and should be used before making assumptions about the architecture.

---

## Структура

```
docs/
  README.md          — этот файл
  PROJECT_CONTEXT    — обзор того, что важно помнить при работе
  architecture/      — архитектурная документация
  analytics/         — аналитика и метрики
  database/          — схема БД и работа с данными
  decisions/         — архитектурные решения и конвенции
  dev/               — заметки для разработки, планы, PR
```

---

## Назначение папок

### `architecture/`

Описание устройства системы: потоки данных, источники истины, интеграции.

- **CHAT_HISTORY_SOURCE_OF_TRUTH.md** — где и как хранится история чата (`chat_history`).
- **recipe_save_flow_chat.md** — как рецепт из чата сохраняется в БД (от LLM до RPC).
- **chat_recipe_generation.md** — генерация рецептов в чате.
- **welcome_prelogin_routing.md** — маршрутизация welcome/prelogin и роли root.
- **share_og_setup.md** — настройка OG-превью для ссылок `/r/:shareRef`.

Используйте для онбординга и понимания «как устроено».

---

### `analytics/`

События, лимиты, трекинг, отчёты по использованию.

- **analytics-system.md** — обзор системы аналитики (таблицы, Edge Functions, события).
- **ad-views-chat-free-users.md** — показ рекламы у free-пользователей во вкладке «Чат».

Используйте при доработке лимитов, трекинга и отчётов.

---

### `database/`

Схема базы данных, миграции, кэш и обходные пути.

- **DATABASE_SCHEMA.md** — полное описание схемы БД (таблицы, RLS, enum).
- **FIX_SCHEMA_CACHE.md** — исправление кэша схемы PostgREST после миграций.

Используйте при изменениях схемы и отладке доступа к данным.

---

### `decisions/`

Принятые решения и конвенции: «почему так сделано», правила полей и форматов.

- **PAYMENT_WEBHOOK_WHY_NOT_AUTO.md** — почему premium не ставится без вебхука.
- **PAYMENT_PREMIUM_WITHOUT_COMPLETED_PAYMENT.md** — сценарии premium без completed payment.
- **MEAL_TYPE_AND_LUNCH_SOUP.md** — типы приёмов пищи и «суп на обед».
- **PREFERENCES_LIKES_DISLIKES.md**, **PREFERENCES_BERRIES_RATIO.md** — предпочтения и ягоды.
- **ALLERGY_ALIASES.md**, **ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md** — аллергии и план.
- **INGREDIENT_CATEGORY_NORMALIZATION.md** — нормализация категорий ингредиентов.
- **recipe_prompt_sources_for_token_reduction.md** — источники промптов для сокращения токенов.
- **prompts_shortening_proposal.md** — предложения по сокращению промптов.

Используйте при изменении бизнес-правил и форматов данных.

---

### `dev/`

Заметки для разработки: планы деплоя, описания PR, рефакторинг, фичи.

- **dev-notes.md** — общие заметки (таблицы, возраст рецептов, диагностика).
- **PLAN_MEAL_PLANS_DEPLOY.md** — деплой изменений плана питания (миграции, Edge, фронт).
- **PR_*.md** — описания pull request’ов (аллергии, ланч/суп, аллергены и т.д.).
- **PHASE3_TWEAKS.md**, **RECIPES_CLEANUP.md**, **POOL_AND_CHAT_RECIPES.md** — твики и очистки.
- **CHAT_BLOCKED_BEHAVIOR.md** — поведение при blocked-ответах в чате.
- **deepseek-chat_refactor_report.md** — отчёт о рефакторинге deepseek-chat.

Используйте при планировании задач и ревью изменений.

---

## Что было удалено при реорганизации

Временные и отладочные документы (по шаблонам `audit*`, `debug*`, `diagnostic*`, `*_test_report*`, `*_debug*`, `*_audit*`) были удалены. Основная документация (**DATABASE_SCHEMA.md**, **analytics-system.md**) сохранена и перенесена в `database/` и `analytics/` соответственно.
