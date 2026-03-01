# Аудит Edge Function deepseek-chat и связанных модулей

**Дата:** 2026-03-02  
**Цель:** выявить реально используемые пути кода, мёртвый/недостижимый код, дублирование и безопасные направления упрощения.

**Обновление:** по результатам аудита выполнен рефакторинг (см. `docs/deepseek-chat_refactor_report.md`): удалены типы single_day/diet_plan, весь SSE, кэш промпта, шаблоны планов в prompts.ts. Оставлены только chat, recipe, sos_consultant, balance_check; ответ всегда JSON.

---

## 1. Entry points и реальные code paths

### Какие `type` реально дергает фронт

По коду фронта (запросы к `/functions/v1/deepseek-chat`):

| type             | Где вызывается |
|------------------|-----------------|
| `chat`           | `ChatPage.tsx` (основной чат), `MealEditDialog.tsx` (замена слота в плане — один рецепт) |
| `sos_consultant` | `SosScenarioScreen.tsx`, `ChatPage.tsx` (кнопка «Мы рядом»), `TopicConsultationSheet.tsx` |
| `single_day`     | `useGenerateWeeklyPlan.ts` (план на день, 2 вызова: основной + реген при слабых шагах) |
| `recipe`         | `useReplaceMealSlot.ts` (замена одного приёма в плане) |
| `balance_check`  | `FoodDiary.tsx` (анализ тарелки) |

**Не используется фронтом:** `diet_plan`. В `useDeepSeekAPI.tsx` тип указан в union (`'chat' | 'recipe' | 'diet_plan' | 'sos_consultant'`), но ни один компонент не передаёт `type: "diet_plan"`. В Edge и миграциях он обрабатывается (recipe-like промпт, token_usage_log), но с клиента не вызывается.

### Недостижимые ветки в index.ts

**Стриминг рецептов (recipeStream) — всегда false.**

В коде:

```ts
const stream =
  type === "sos_consultant" || type === "balance_check" || isRecipeRequest
    ? false
    : reqStream;
// ...
const recipeStream = isRecipeRequest && stream;
```

При любом запросе рецепта (`isRecipeRequest === true`) `stream` принудительно `false`, значит `recipeStream` всегда `false`. Блок:

- `if (recipeStream && response.body)` (примерно строки 1122–1367) — **никогда не выполняется**.

Итог: весь SSE-ветка для рецептов (парсинг стрима, `event: delta` / `event: done`, сохранение рецепта из стрима, retryFixJson по стриму) — **мёртвый код** при текущей логике. Фронт при этом готов к SSE (проверяет `Content-Type: text/event-stream` и парсит `event: done` с `recipe_id`/`recipes`), но сервер для рецептов всегда отдаёт JSON.

**Резюме:** для ускорения TTFB можно было бы снова включить стриминг рецептов (изменить условие `stream`), но тогда нужно задействовать и поддерживать уже написанную SSE-ветку; сейчас она не используется.

---

## 2. Неиспользуемые экспорты/импорты

### deepseek-chat/index.ts

- **`validateRecipeJson`** (из `./recipeSchema.ts`) — импортируется, но **нигде не вызывается**. Везде используется `validateRecipe` из `_shared/parsing` с колбэком `parseAndValidateRecipeJsonFromString`. Импорт можно удалить.

### deepseek-chat/recipeSchema.ts

- **`validateRecipeJson`** — экспортируется, в Edge используется только через `validateRecipe` + `parseAndValidateRecipeJsonFromString`; в других местах не найден. Либо оставить для внешнего использования, либо пометить как неиспользуемый в deepseek-chat.
- **`assertIngredientDisplayExamples`** — экспортируется, нигде не импортируется (предположительно ручной/тестовый хелпер). Мёртвый экспорт с точки зрения приложения.

### supabase/functions/_shared/memberConstraints.ts

- **`formatAllergiesLine`**, **`formatPreferencesLine`** — экспортируются, в репозитории нигде не импортируются (в deepseek-chat используются только `getFamilyContextPromptLine` и `getFamilyContextPromptLineEmpty`). Мёртвые экспорты.

### Кэш system prompt (в index.ts)

- **`getCachedSystemPrompt`** — всегда возвращает `null` (кэш закомментирован).
- **`getCacheKey`** — вызывается только внутри закомментированного блока в `getCachedSystemPrompt`.
- Вызов `getCachedSystemPrompt(type, memberDataForPrompt, isPremiumUser)` на строке ~1073 всегда даёт `null`, затем используется `getSystemPromptForType(...)`. Блок кэша можно считать мёртвым; его удаление не меняет поведения.

---

## 3. Подозрение на мёртвый код (давно не менялся)

Даты последнего коммита по файлам (git log -1):

| Файл | Дата | Комментарий |
|------|------|-------------|
| `deepseek-chat/index.ts` | 2026-03-01 | Активно меняется |
| `deepseek-chat/prompts.ts` | 2026-02-28 | Недавно |
| `deepseek-chat/promptByTariff.ts` | 2026-02-06 | Старше; логика простая, дублирования с другими тарифами нет |
| `deepseek-chat/isRelevantQuery.ts` | 2026-02-15 | Средне |
| `deepseek-chat/ageCategory.ts` | 2026-02-28 | Недавно |
| `deepseek-chat/recipeSchema.ts` | 2026-02-28 | Недавно |
| `_shared/familyContextBlock.ts` | 2026-03-01 | Активно |
| `_shared/familyMode.ts` | 2026-03-01 | Активно |
| `_shared/memberConstraints.ts` | (в составе других) | Используются только 2 из 4 экспортов |

**Крупные «старые» блоки в index.ts:**

- Блок **recipeStream** (строки ~1122–1367): логика давно не задействована из‑за `stream=false` для рецептов; по сути мёртвая ветка.
- **Кэш system prompt** (getCacheKey / getCachedSystemPrompt, вызов ~1073): отключен, не влияет на результат.

Остальная логика (single_day, balance_check, sos_consultant, блокировка по аллергиям/дизлайкам, family, тарифы) используется и не выглядит забытой.

---

## 4. Риски при удалении

**Не трогать без согласованного контракта/фронта:**

- Формат тела запроса и поля ответа для типов: `chat`, `recipe`, `single_day`, `sos_consultant`, `balance_check` (сообщения, `recipes`, `recipe_id`, `blocked`, `message` и т.д.).
- Поведение при блокировке по аллергии/дизлайкам: ответ с `blocked: true`, `blocked_by`, `message`, `suggested_alternatives` и т.п. — используется фронтом.
- Лимиты и коды ошибок: 429, `usage_limit_exceeded`, `LIMIT_REACHED` с `payload.feature` — обрабатываются на клиенте.
- Для `single_day`: формат JSON (breakfast/lunch/snack/dinner с name, ingredients, steps, cookingTime, chefAdvice) и то, что рецепты создаются на клиенте, а не через сохранение в БД в этой функции.
- Авторизация и сохранение рецепта: при отсутствии auth рецепт не сохраняется и возвращается 401 — фронт это учитывает.

**Можно менять с осторожностью (внутренняя реализация):**

- Удаление мёртвой ветки recipeStream (SSE для рецептов) — поведение не изменится, т.к. ветка не выполняется. Если позже захотите вернуть стриминг рецептов — придётся восстанавливать или переписать логику.
- Удаление кэша system prompt (getCacheKey, getCachedSystemPrompt и вызов) — безопасно, кэш не работает.
- Удаление неиспользуемого импорта `validateRecipeJson` в index.ts — безопасно.
- Упрощение/объединение дублирующихся правил в промптах — только при сохранении текущего поведения ответов (формат JSON, тон, ограничения по возрасту/аллергиям).

---

## 5. Дублирование и конфликты

- **family generationContextBlock override:** в режиме «Семья» фронт может присылать `generationContextBlock` с формулировками вроде «Children:», «safe for ALL children». Edge при `targetIsFamily` подменяет его на `buildFamilyGenerationContextBlock(...)` (без младенцев <12m, без «Children:»). Дублирования нет — одна явная подмена, логика в одном месте.
- **Возраст (age rules):** считаются в index (getAgeMonths, getAgeCategory), подставляются в шаблоны через `applyPromptTemplate` и дополнительно добавляются `getAgeCategoryRules(ageCategory)`. Два слоя (шаблон + appendix) согласованы; дублирования формулировок можно уменьшить, вынеся общие фразы в константы.
- **Sanitize:** `sanitizeRecipeText` и `sanitizeMealMentions` вызываются только для сохранённого рецепта (перед отдачей/пулом), не дублируются в других функциях.
- **Anti-duplicate:** `fetchRecentTitleKeys` + `recentTitleKeysLine` в промпте и лог `ANTI_DUPLICATE` — одна логика, дублирования нет.
- **Лимиты:** Free (2/день по фичам help и chat_recipe) и проверки в Edge согласованы с фронтом; дублирования логики лимитов между Edge и другими сервисами в этом аудите не видно.

---

## 6. Логика single_day / diet_plan / balance_check / sos_consultant

- **single_day:** используется. Фронт (`useGenerateWeeklyPlan`) шлёт `type: "single_day"`, `dayName`, `weekContext`, `memberData`, `messages`. Edge собирает план на день (SINGLE_DAY_PLAN_TEMPLATE, weekContext, varietyRules), возвращает JSON в `message`; рецепты на клиенте создаются из этого JSON, в БД в этой функции не пишутся.
- **diet_plan:** в Edge обрабатывается как recipe-like тип (тот же шаблон рецепта, token_usage_log). С фронта ни разу не вызывается — по сути зарезервированный тип.
- **balance_check:** используется. `FoodDiary.tsx` шлёт `type: "balance_check"`; ответ пишется в `plate_logs`, тело возвращается в `message`.
- **sos_consultant:** используется из нескольких экранов; лимит по фиче `help`, без стриминга, ответ только в `message`.

---

## 7. План упрощения на 2 шага

### Шаг 1: безопасные чистки (нулевой риск для контракта и UX)

1. Удалить неиспользуемый импорт **`validateRecipeJson`** из `deepseek-chat/index.ts`.
2. Удалить мёртвый кэш system prompt: функцию **`getCachedSystemPrompt`**, функцию **`getCacheKey`** и константу **`CACHE_KEY_PREFIX`**, а также вызов `getCachedSystemPrompt(...)` — везде использовать сразу `getSystemPromptForType(...)`.
3. (Опционально) Удалить весь блок **recipeStream** (условие `if (recipeStream && response.body)` и тело ~1122–1367): ветка недостижима, фронт уже работает только с JSON-ответом для рецептов. Перед удалением зафиксировать, что при желании вернуть стриминг рецептов логику нужно будет восстанавливать или переписывать.
4. В **memberConstraints.ts**: либо удалить экспорты **`formatAllergiesLine`** и **`formatPreferencesLine`** (если ни один другой сервис не планирует их использовать), либо оставить и пометить комментарием «legacy/unused» до проверки остальных Edge-функций.
5. В **recipeSchema.ts**: экспорт **`assertIngredientDisplayExamples`** — либо оставить для ручных/тестовых запусков, либо убрать экспорт и вызывать из теста по относительному пути.

### Шаг 2: чистки с изменением поведения (требуют решения продукта/фронта)

1. **Включить стриминг для рецептов:** не принудительно выставлять `stream = false` при `isRecipeRequest`, а например `stream = reqStream` (или отдельная опция). Тогда заработает существующая SSE-ветка, фронт уже умеет показывать чанки и финальный `event: done` с `recipe_id`/`recipes` — улучшится TTFB и субъективная скорость ответа.
2. **Тип `diet_plan`:** либо объявить устаревшим и не документировать, либо реализовать отдельный сценарий на фронте и оставить как есть в Edge.
3. Упрощение текстов промптов: вынести повторяющиеся фразы (возраст, аллергии, запрет статей) в общие константы и подставлять в FREE/PREMIUM/SINGLE_DAY/SOS/BALANCE шаблоны — без изменения формулировок, только DRY.

---

## 8. Очевидные баги / замечания (без правок в рамках аудита)

- **Стриминг рецептов отключён при готовом SSE-клиенте:** для запросов рецептов Edge всегда возвращает JSON, стриминг не используется. В комментариях в начале index упоминается быстрый TTFB за счёт stream и чек-лист «первый символ ответа ≤ 2s» — при текущей логике это для рецептов недостижимо. Имеет смысл либо явно включить стриминг рецептов, либо убрать/переформулировать упоминания в комментариях.
- Опечатка в **prompts.ts** (SAFETY_RULES): «Прредлагай» → «Предлагай».

---

## 9. Предлагаемые конкретные удаления/упрощения (следующий шаг)

1. Удалить импорт **`validateRecipeJson`** из `supabase/functions/deepseek-chat/index.ts`.
2. Удалить **getCacheKey**, **getCachedSystemPrompt**, **CACHE_KEY_PREFIX** и вызов кэша в index.ts; везде использовать только **getSystemPromptForType**.
3. Удалить весь блок **`if (recipeStream && response.body) { ... }`** (SSE для рецептов) в index.ts как недостижимый код — с комментарием в коммите, что при необходимости стриминг можно вернуть отдельной задачей.
4. В **memberConstraints.ts** удалить неиспользуемые экспорты **formatAllergiesLine** и **formatPreferencesLine** (или оставить и пометить комментарием), после проверки, что их не использует generate-plan или другие функции.
5. В **recipeSchema.ts**: убрать экспорт **assertIngredientDisplayExamples** или оставить только для теста; при наличии unit-теста вызывать из теста без экспорта.
6. Исправить опечатку в **prompts.ts**: SAFETY_RULES «Прредлагай» → «Предлагай».
7. В начале **index.ts** обновить комментарии/чек-лист: указать, что для рецептов стриминг сейчас отключён и TTFB достигается только для не-рецепт ответов (или включить стриминг рецептов по п.1 из Шага 2).
8. (Опционально) Вынести общие части промптов (NO_ARTICLES_RULE, GREETING_STYLE_RULE, возрастные формулировки) в отдельные константы и подставлять в шаблоны, чтобы править в одном месте.
9. (Опционально) Добавить в тип запроса на фронте только реально используемые типы (`'chat' | 'recipe' | 'sos_consultant'`) и в документации API явно пометить `single_day` и `balance_check` как вызываемые из других хуков/страниц, а `diet_plan` — как зарезервированный/неиспользуемый.

Итог: шаги 1–6 и 8–9 не меняют контракт и поведение для текущего фронта; шаг 7 — только комментарии или включение стриминга по решению команды.
