# Отчёт: рефакторинг deepseek-chat (планы + SSE + мёртвый код)

## Что будет удалено

### Файл `supabase/functions/deepseek-chat/index.ts`
- **Типы запросов:** поддержка `type="single_day"` и `type="diet_plan"`. При этих типах будет возвращаться 400 с сообщением о неподдерживаемом типе.
- **Поля и интерфейсы:** `dayName`, `weekContext`, `WeekContextPayload`, `buildVarietyRules`, переменные `weekContextForPrompt`, `varietyRulesForPrompt`; из `ChatRequest` — поля `dayName`, `weekContext`, `stream` (игнорируем, ответ всегда JSON).
- **Промпты:** вызовы `getSystemPromptForType` для single_day/diet_plan; параметры `weekContext`, `varietyRules` у `getSystemPromptForType` и в шаблоне (applyPromptTemplate без weekContext/varietyRules для оставшихся типов).
- **SSE/стриминг:** вся ветка `recipeStream` (ReadableStream, `response.body.getReader()`, парсинг `data:`, `event: delta`/`event: done`, заголовки `text/event-stream`); переменные `stream`, `recipeStream`; в payload — всегда `stream: false`, для рецепта — `response_format: { type: "json_object" }`.
- **Кэш:** `CACHE_KEY_PREFIX`, `getCacheKey`, `getCachedSystemPrompt` и вызов кэша перед `getSystemPromptForType`.
- **Мёртвый код:** импорт `validateRecipeJson`; DEBUG-логи только для single_day; в `token_usage_log.action_type` — ветки `weekly_plan`, `diet_plan`.
- **Таймауты:** упрощение `MAIN_LLM_TIMEOUT_MS` (без single_day 60s и без stream 90s).

### Файл `supabase/functions/deepseek-chat/prompts.ts`
- Экспорт и шаблон **SINGLE_DAY_PLAN_TEMPLATE**.
- Экспорт **VARIETY_AND_MEALS_RULES** (использовался только в SINGLE_DAY_PLAN_TEMPLATE).

---

## Что остаётся

- **Типы:** `chat`, `recipe` (один рецепт в JSON, как сейчас; фронт `useReplaceMealSlot` шлёт `recipe` — без изменений), `sos_consultant`, `balance_check`.
- **Контракт ответа:** для `chat`/`recipe` — `message`, `recipes[]`, `recipe_id` при успехе; для `sos_consultant` — `message`; для `balance_check` — `message` + запись в `plate_logs`. Формат и коды ошибок не меняются.
- **Семейный режим:** без изменений: дети <12 мес исключаются из учёта; 12–35 мес — kid safety (тег `kid_1_3_safe`); allergies/dislikes strict, likes soft; логика «1 из 5» для лайков сохраняется.
- **Блокировка до модели:** аллергии/dislikes, лимиты Free (help, chat_recipe), 429/usage_limit_exceeded — как раньше.
- **Валидация и сохранение рецепта:** как раньше (JSON, retryFixJson, fallback, сохранение в БД с тегами family/kid_1_3_safe).

---

## Риски для фронта

1. **Критично:** вызовы с `type: "single_day"` перестанут работать. Используются в `useGenerateWeeklyPlan.ts`. После деплоя генерация плана на день через deepseek-chat вернёт **400** с сообщением вроде «Unsupported type: single_day». Нужно перевести генерацию плана на отдельную Edge Function (например, `generate-plan`) или другой endpoint до или сразу после деплоя.
2. **Нет риска:** `type: "diet_plan"` фронт не отправляет — удаление не ломает клиент.
3. **Нет риска:** ответ всегда JSON (без SSE). Фронт уже обрабатывает JSON-ответ для рецептов; проверка `Content-Type: text/event-stream` просто не сработает — будет использоваться ветка `response.json()`.

---

## План выноса SOS Consultant (D)

### Вариант 1 (рекомендуемый): отдельная Edge Function `sos-consultant`
- **Файл:** `supabase/functions/sos-consultant/index.ts`.
- **Логика:** только SOS: проверка лимита (get_usage_count_today, feature "help"), сборка промпта (SOS_PROMPT_TEMPLATE + подстановки), вызов DeepSeek (без stream), запись usage_events (feature "help"), возврат `{ message }`.
- **Вход:** body: messages (или userMessage), memberData (для подстановки в шаблон), memberId; auth — как сейчас.
- **В deepseek-chat:** убрать ветку `type === "sos_consultant"` (и лимит help, и промпт, и запись help); при type "sos_consultant" возвращать 400 с указанием вызывать новый endpoint.
- **Фронт:** позже заменить URL с `/functions/v1/deepseek-chat` на `/functions/v1/sos-consultant` для экранов Помощь маме (SosScenarioScreen, ChatPage, TopicConsultationSheet).

### Вариант 2: оставить SOS в deepseek-chat (упрощённо)
- Оставить в deepseek-chat только ветки: chat, recipe, sos_consultant, balance_check.
- Удалить всё, что касается планов и SSE; семейный режим и лимиты не трогать.
- Отдельная функция не создаётся; все вызовы по-прежнему идут в deepseek-chat.

---

## Changelog (после применения)

### Удалено
- Типы: `single_day`, `diet_plan` (при приходе возвращается 400 unsupported_type).
- Поля запроса: `dayName`, `weekContext`, `stream` (из интерфейса/обработки).
- Интерфейс `WeekContextPayload`, функция `buildVarietyRules`, переменные `weekContextForPrompt`, `varietyRulesForPrompt`.
- Весь SSE: `recipeStream`, `ReadableStream`, парсинг `data:`/`event: delta`/`event: done`, заголовки `text/event-stream`.
- Кэш промпта: `CACHE_KEY_PREFIX`, `getCacheKey`, `getCachedSystemPrompt`.
- Импорт `validateRecipeJson`; константа `RECIPE_SLOW_MS`.
- В `prompts.ts`: `VARIETY_AND_MEALS_RULES`, `SINGLE_DAY_PLAN_TEMPLATE`.
- В `token_usage_log.action_type`: ветки `weekly_plan`, `diet_plan`.
- DEBUG-логи только для single_day.

### Оставлено без изменений контракта
- `type`: `chat`, `recipe`, `sos_consultant`, `balance_check`.
- Ответ: для chat/recipe — `message`, `recipes[]`, `recipe_id`; для sos — `message`; для balance_check — `message` + запись в `plate_logs`.
- Семейный режим (исключение <12 мес, kid_1_3_safe, allergies/dislikes/likes, «1 из 5»).
- Блокировка по аллергиям/дизлайкам, лимиты Free, 429/usage_limit_exceeded.

### Подтверждение для PR
- SSE полностью удалён: нет `stream: true`, нет `ReadableStream`, нет `text/event-stream`; ответ всегда JSON.
- Удалённые типы: `single_day`, `diet_plan`.

---

## Команды деплоя

Деплой только Edge Function deepseek-chat (без фронта):

```bash
npx supabase functions deploy deepseek-chat
```

Или через npm-скрипт, если есть:

```bash
npm run supabase:deploy:chat
```

После деплоя: генерация плана через `useGenerateWeeklyPlan` (type `single_day`) будет получать 400 до перевода на `generate-plan` или другой endpoint.
