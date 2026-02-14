# Диагностика: план на день/неделю и пул рецептов

**Дата:** 2025-02-14  
**Задача:** выяснить, используется ли пул рецептов при генерации «План на день/неделю» (кнопка «Улучшить с AI») и сохраняются ли рецепты из чата в пул. Только диагностика и логи, без изменения поведения.

---

## 1) Где реализована генерация day/week

### UI

- **Файл:** `src/pages/MealPlanPage.tsx`
- **Кнопка «Улучшить с AI»:** строки ~388–404 (пустая неделя) и ~444–461 (когда уже есть план).
- **Действие:** вызывается `generateWeeklyPlan()` из хука `useGenerateWeeklyPlan`.

### Endpoint и параметры

- **Endpoint:** Edge Function `POST ${SUPABASE_URL}/functions/v1/deepseek-chat`
- **Файл хука:** `src/hooks/useGenerateWeeklyPlan.ts`
- **Параметры запроса (на один день):**
  - `type: "single_day"`
  - `stream: false`
  - `dayName` — название дня недели (например, «Понедельник»)
  - `memberData` — данные профиля (имя, возраст, аллергии и т.д.)
  - `weekContext` — опционально, контекст уже запланированных дней при перегенерации одного дня
  - `messages` — один user message с просьбой составить план на день в JSON

Неделя генерируется **7 параллельными запросами** (по одному на каждый день). Рецепты на бэкенде **не создаются** — только возвращается текст с JSON (завтрак, обед, полдник, ужин). Создание записей в БД делается на фронте.

---

## 2) Бэкенд (Edge Function)

- **Файл:** `supabase/functions/deepseek-chat/index.ts`

### Выборка из БД (pool)

- **Не используется.** Для `type === "single_day"` нет запросов к `public.recipes` и никакой логики выбора рецептов из пула. Генерация — только по промпту и ответу AI.

### Генерация через AI

- Для `single_day` используется шаблон `SINGLE_DAY_PLAN_TEMPLATE`, подставляются `memberData`, `weekContext` и т.д.
- Ответ — текст с одним JSON-объектом (поля `breakfast`, `lunch`, `snack`, `dinner`). Парсинг и создание рецептов выполняет **клиент**.

### Сохранение рецептов (insert в public.recipes)

- **В чате (type `chat` / `recipe`):** при успешном ответе с рецептом (RecipeJson) Edge Function **вставляет** одну запись в `public.recipes` с **`source: "chat_ai"`** (строки ~813–831 в `index.ts`). То есть рецепты из чата сохраняются на бэке с `source='chat_ai'`.
- **План на день/неделю (`single_day`):** на бэкенде **ничего не сохраняется**. Рецепты создаёт фронт через `useRecipes().createRecipe()`, который вызывает `supabase.from('recipes').insert(payload)`. В `payload` поле **`source` не передаётся**, поэтому в БД подставляется **дефолт** (в миграции задано `DEFAULT 'chat_ai'`). То есть рецепты плана на неделю сейчас попадают в БД с тем же `source='chat_ai'`, а не `week_ai`.

---

## 3) Добавленные DEBUG-логи

### Фронт (`import.meta.env.DEV`)

- **Файл:** `src/hooks/useGenerateWeeklyPlan.ts`
- Перед запросом на день: `[DEBUG] single_day request: type=single_day dayName=... hasMemberId=... (no pool query on client)`.
- Перед генерацией недели: `[DEBUG] generateWeeklyPlan: pool query filters N/A (no pool used); generating 7 days via AI.`
- После обработки одного дня: `[DEBUG] single_day done: selectedFromPoolCount=0 generatedCount=... recipeIds=[...xxxxxx, ...] (source not set on client, DB default)`.
- После всей недели: `[DEBUG] total recipes for plan: up to 28 (all from AI, no pool; see per-day logs for actual counts)`.

### Edge (env `DEBUG=1` или `DEBUG=true`)

- **Файл:** `supabase/functions/deepseek-chat/index.ts`
- При `type === "single_day"`: логируем, что пул не используется, план генерируется только AI, рецепты создаются на клиенте.
- После ответа AI для `single_day`: длина ответа и пояснение, что рецепты создаются только на клиенте.
- При сохранении рецепта из чата: `[DEBUG] saved recipe source=chat_ai id=...XXXXXX` (последние 6 символов id).

Чтобы включить логи на Edge, при запуске функции задать переменную окружения `DEBUG=1` или `DEBUG=true`.

---

## 4) Source в ответе

- В ответе Edge Function для чата в теле уже есть `recipe_id` (и при необходимости можно добавить `source` в JSON для DEV). Сейчас в коде **на бэке** при insert явно проставляется `source: "chat_ai"`, и в DEBUG при сохранении логируется `source=chat_ai` и суффикс id.
- Для `single_day` в ответе приходит только `message` (текст с JSON плана), без массива рецептов и без `source`. Источник рецептов плана (все с клиента, без пула) выводится только в DEBUG-логах на бэке и на фронте.

---

## 5) Итоги

| Вопрос | Ответ |
|--------|--------|
| **Точные файлы UI** | `src/pages/MealPlanPage.tsx` (кнопки «Улучшить с AI`), `src/hooks/useGenerateWeeklyPlan.ts` (вызов API и создание рецептов/планов). |
| **Точный файл Edge Function** | `supabase/functions/deepseek-chat/index.ts` (обработка `type: "single_day"` и сохранение рецептов чата). |
| **Используется ли пул при генерации плана на день/неделю?** | **Нет.** Пул `public.recipes` при генерации плана не запрашивается ни на бэке, ни на фронте. Все рецепты плана генерируются AI и создаются на клиенте через `createRecipe()`. |
| **Сохраняются ли рецепты из чата с `source='chat_ai'` в public.recipes?** | **Да.** При ответе чата с рецептом (type `chat`/`recipe`) Edge Function вставляет запись в `public.recipes` с **`source: "chat_ai"`**. |
| **Используется ли public.recipes как пул для week/day?** | **Нет.** Текущая реализация плана на день/неделю не читает `public.recipes` для выбора рецептов. |

---

## Схема потоков

- **План на неделю:**  
  UI → `generateWeeklyPlan()` → 7× `POST deepseek-chat` с `type: "single_day"` → ответ (JSON-текст) → фронт парсит → для каждого приёма пищи `createRecipe()` + `createMealPlan()` → рецепты в БД **без явного `source`** (дефолт `chat_ai`).

- **Чат с рецептом:**  
  UI → `POST deepseek-chat` с `type: "chat"`/`"recipe"` → ответ с RecipeJson → Edge вставляет в `public.recipes` с **`source: "chat_ai"`** и возвращает `recipe_id`.

---

## 6) Идемпотентность и лок недели (2025-02)

Чтобы не плодить дубликаты `week_ai` при повторах и повторном заходе на страницу:

- **Идемпотентность по дню:** перед применением результата `single_day` для `planned_date` загружается строка `meal_plans_v2` по `(user_id, member_id, planned_date)`. Если запись есть и `meals` уже не пустой — новые рецепты не создаются, день пропускается (в консоли DEV: `[DEBUG] skip day apply: plan already exists planned_date=...`).
- **Лок на запуск недели:** ключ `userId:memberId:weekStartKey`. Если генерация уже идёт — повторный вызов (вторая кнопка, повторный заход) игнорируется (DEV: `[DEBUG] skip week start: already running lockKey=...`). При старте: `[DEBUG] week generate start lockKey=...`.
- **Полная неделя только по кнопке:** `generateWeeklyPlan()` вызывается только из обработчиков кнопок «Улучшить с AI», не из `useEffect`. Autofill одного дня (последний день диапазона) по-прежнему может срабатывать из эффекта, с учётом скипа по существующему плану.

**Как протестировать:**

1. Нажать «Улучшить с AI» один раз → в БД `week_ai` создаётся примерно по количеству блюд (до 28 за неделю), без удвоения.
2. Повторно нажать кнопку или открыть страницу во время генерации → в консоли `skip week start` или дни с уже заполненным планом дают `skip day apply`, новые `week_ai` не создаются.
3. После одной полной генерации обновить страницу и снова нажать «Улучшить с AI» → все 7 дней уже с планом → все батчи скипаются по `skip day apply`, дубликатов нет.
