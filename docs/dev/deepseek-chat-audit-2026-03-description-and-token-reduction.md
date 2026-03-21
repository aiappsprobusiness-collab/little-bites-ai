# Технический аудит: `deepseek-chat` — токены промпта, путь `description`, fallback

**Дата:** 2026-03-22  
**Область:** `supabase/functions/deepseek-chat` (recipe-path: `type === "chat"` с релевантностью + `type === "recipe"`).  
**Цель аудита:** понять раздувание input tokens, канонический путь `description`, причины частого `deterministic_fallback`, безопасное сокращение промпта, план снижения частоты fallback (~1%) без ослабления allergy/dislike blocking.

---

## 1. Executive summary

### Почему функция «раздута» по input

Основной вызов DeepSeek для рецепта отправляет **один длинный system prompt** + **одно user-сообщение** (`index.ts`: `messages: [{ role: "system", content: currentSystemPrompt }, { role: "user", content: userMessage }]`). System prompt для recipe-path собирается из **роли**, **контекста профиля** (возраст, аллергии, dislikes, meal meta), **трёх крупных правилых блоков** (`MEAL_SOUP_RULES`, `CMPA_SAFETY_RULE`, `RECIPE_SYSTEM_RULES_V3` — последний **включает полный `CHEF_ADVICE_RULES` с примерами**), плюс **условно** likes anti-repeat / soft likes + `LIKES_DIVERSITY_RULE`, `extraSystemSuffix`. Часть констант в `prompts.ts` **не попадает** в живой recipe-path, но документация всё ещё ссылается на них как на активные — это создаёт ощущение «лишнего» при чтении репо.

### 3–7 главных источников inflation input tokens (recipe-path)

1. **`RECIPE_SYSTEM_RULES_V3` + встроенный `CHEF_ADVICE_RULES`** — длинный блок с дублированием требований к JSON (поля, шаги, nutrition) и **развёрнутыми good/bad примерами** для `chefAdvice` (модель тратит внимание и токены на примеры, хотя пост-обработка жёстко режет слабый совет).
2. **`MEAL_SOUP_RULES`** — отдельный блок; логика слотов частично **дублируется** строками внутри `RECIPE_SYSTEM_RULES_V3` / контракта в комментариях к схеме.
3. **`CMPA_SAFETY_RULE`** — обоснованный safety-блок; при отсутствии БКМ в контексте теоретически можно было бы условно опускать (см. risky cuts).
4. **Динамический `[CONTEXT]`** — списки аллергий и **всех dislikes** (семья → union), плюс mealType / время / порции / anti-duplicate строка.
5. **Likes-блоки** (`buildRecipeSoftLikesPromptBlock`, `LIKES_DIVERSITY_RULE`, иногда `buildLikesAntiRepeatPromptLine`) — добавляются в `index.ts` поверх V3.
6. **`extraSystemSuffix`** с клиента — непредсказуемая длина.
7. **Логирование полного payload** (`safeLog("SENDING PAYLOAD:", JSON.stringify(payload, null, 2))`) — **не увеличивает billable tokens API**, но раздувает логи/стоимость наблюдаемости; на восприятие «тяжёлой» функции влияет.

### 3–5 главных причин, почему `description` часто не доходит до «LLM accepted» и уходит в fallback

Канон: **`pickCanonicalDescription`** (`sanitizeAndRepair.ts`) принимает санитизированный LLM-текст только если **`passesDescriptionQualityGate`** и нет **`textContainsRequestContextLeak`**. Иначе — **`buildRecipeBenefitDescription`** (детерминированный benefit по `nutrition_goals` + seed).

По коду наиболее вероятные причины высокой частоты fallback:

1. **Жёсткий гейт по длине и числу предложений:** минимум **38** символов, **1–2 предложения** (`countSentences`), для двух предложений дополнительно **≥45** символов; максимум **210**. Модель, следующая промпту «макс. 160 симв.», может выдать **одно** сильное предложение или чуть короче 38 — сразу reject.
2. **Обязательный нутритивный маркер** — список подстрок (`DESCRIPTION_NUTRITIONAL_MARKERS`), включая очень широкие вроде **`полезн`**. Формально многие тексты проходят; **пробелы** — когда модель использует синонимы вне списка (редко, но возможно).
3. **`descriptionStartsWithTitle` / дублирование title** — эвристика по первому слову и префиксу; пересечение с названиями блюд, начинающимися с общих слов, может давать ложные срабатывания (зависит от паттернов title).
4. **Список `DESCRIPTION_FORBIDDEN_PHRASES`** — подстроки (`includes`), например **`подходит для`** — может задеть нейтральные конструкции.
5. **Пост-обработка до гейта:** `sanitizeRecipeText` (удаление age/allergy-подобных фраз) и **`sanitizeMealMentions`** (вырезание `breakfast`/`lunch`/`на обед` и т.д.) **могут искалечить** текст или сократить его ниже порогов / сломать «предложения» для `countSentences`.

Дополнительно: **рассинхрон промпт vs гейт** — в `RECIPE_STRICT_JSON_CONTRACT` и строках V3 указано **макс. 160** символов для `description`, схема Zod и гейт — **до 210** и минимум **38**. Модель оптимизирует под 160 и 1–2 коротких предложения → легко выпасть из минимальной длины или структуры, которую ожидает гейт.

### Оценка: что сократить быстро vs что требует рефакторинга

| Категория | Примеры |
|-----------|---------|
| **Быстро и относительно безопасно** | Сжать `CHEF_ADVICE_RULES` в промпте (оставить 3–5 буллетов, убрать длинные примеры — дублируются пост-gate); убрать/сократить дубли «только JSON / mealType enum»; не слать полный `payload` в лог; пометить мёртвые константы. |
| **Средний риск** | Условный `CMPA_SAFETY_RULE`; пересборка `MEAL_SOUP_RULES` + одна строка в V3; пересмотр `sanitizeMealMentions` для поля `description` (отдельный путь). |
| **Рефакторинг / метрики** | Согласовать промпт и `passesDescriptionQualityGate` (один источник правды по длине и предложениям); таргетный micro-repair description; модульный split `index.ts`. |

---

## 2. Полная карта recipe path (end-to-end)

| Этап | Файл(ы) | Функции / точки | Ответственность | Input tokens? | Качество `description`? | Частота fallback? |
|------|---------|-----------------|------------------|----------------|---------------------------|-------------------|
| HTTP body | `index.ts` | `serve` handler | Парсинг `messages`, `memberData`/`allMembers`, `type`, family flags, `generationContextBlock`, meal, limits | Нет | Нет | Нет |
| Нормализация членов | `buildPrompt.ts` | `normalizeMemberData`, `findYoungestMember`, `getAgeMonths` | Возраст для категорий | Нет | Косвенно (возраст в промпте) | Нет |
| Семейный контекст для промпта | `domain/family/*`, `_shared/familyMode.ts`, `_shared/familyContextBlock.ts` | `getFamilyPromptMembers`, `buildFamilyMemberDataForChat`, `buildFamilyGenerationContextBlock` | Кого включать в промпт, server-truth блок | Да (семейный контекст) | Косвенно | Нет |
| Policy block | `domain/policies/checkRequestBlocked.ts` | `checkRecipeRequestBlocked` | Блокировка по allergy/dislike в **тексте запроса** | Нет | Нет | Нет |
| Tariff | `promptByTariff.ts` | `buildPromptByProfileAndTariff` | `useAllAllergies`, `maxTokens` для **non-recipe**; **recipe path V3 не добавляет `tariffAppendix`** | Нет* | Нет | Нет |
| Recent titles | `index.ts` | `fetchRecentTitleKeys` | Anti-duplicate строка в промпт | Да (короткая) | Косвенно (давит на разнообразие) | Нет |
| System prompt recipe | `buildPrompt.ts` | `generateRecipeSystemPromptV3` | Роль + `[CONTEXT]` + `MEAL_SOUP_RULES` + `CMPA_SAFETY_RULE` + `RECIPE_SYSTEM_RULES_V3` | **Да, основной объём** | **Да** (инструкции к полю) | **Да** (если модель не соблюдает) |
| Доп. системные куски | `index.ts` | блок likes | `shouldFavorLikes`, `chatLikesSignal`, `LIKES_DIVERSITY_RULE` | Да | Слабо | Слабо |
| User message | `index.ts` | — | Только последний user turn как `user` | Да | Да | — |
| Вызов LLM | `index.ts` | `fetch` DeepSeek | `response_format: json_object`, `max_tokens: 1600` | — | — | Таймаут → minimal recipe |
| Parse / validate | `_shared/parsing/validateRecipe.ts`, `recipeSchema.ts` | `validateRecipe`, `parseAndValidateRecipeJsonFromString`, `decideRecipeRecovery`, `retryFixJson`, `getRecipeOrFallback` | JSON из текста, Zod, retry | Нет | Если описание отброшено при полном fallback — теряется | Косвенно |
| Ранний quality log | `index.ts` | `passesDescriptionQualityGate` на `validated` | Только лог `DESCRIPTION_QUALITY_GATE_RAW_LLM` | Нет | Диагностика | Нет |
| Ингредиенты | `recipeSchema.ts` | `ingredientsNeedAmountRetry`, `applyIngredientsFallbackHeuristic` | Количества | Нет | Нет | Нет |
| Санитизация текста | `sanitizeAndRepair.ts`, `_shared/requestContextLeakGuard.ts` | `sanitizeRecipeText`, `sanitizeMealMentions` | Вычистить паттерны из description перед гейтом | Нет | **Да, сильно** | **Да** |
| Guards title / leak / lexicon | `index.ts` + `_shared/*` | `checkTitleIngredientConsistency`, `checkRequestContextLeak`, `checkTitleLexicon` | Мутации title; leak по title/advice; шаги | Нет | Leak на description флажком `descriptionUseComposer` в результате check — **в текущем коде финальный канон всё равно через `pickCanonicalDescription`** | Leak в тексте description → fallback |
| Канон description | `sanitizeAndRepair.ts`, `_shared/recipeGoals.ts`, `_shared/recipeBenefitDescription.ts` | `inferNutritionGoals`, `buildRecipeBenefitDescription`, `pickCanonicalDescription` | Единый текст для ответа и БД | Нет | **Финальное качество карточки** | **Да** |
| RPC / DB | `_shared/recipeCanonical.ts`, `index.ts` | `canonicalizeRecipePayload`, `create_recipe_with_steps` | Сохранение | Нет | Хранится канон | Нет |
| Response | `index.ts` | JSON body | `message` + `recipes` + `recipe_id` | Нет | — | — |

\*Для recipe JSON `max_tokens` зафиксирован `RECIPE_MAX_TOKENS = 1600`, не из `promptByTariff`.

---

## 3. Где и как запрашивается `description`

### Prompt builder

- **Recipe-path:** `generateRecipeSystemPromptV3` (`buildPrompt.ts`) включает константу **`RECIPE_SYSTEM_RULES_V3`** из `prompts.ts`.
- **Дополнительно:** в **`RECIPE_STRICT_JSON_CONTRACT`** (тот же файл) задано более развернутое описание поля `description`, но **эта константа не интерполируется в `generateRecipeSystemPromptV3`** (проверка grep по `deepseek-chat`: нет использования кроме определения и тестов). Фактический контракт для модели в recipe-path — **текст внутри `RECIPE_SYSTEM_RULES_V3`** и вставка **`CHEF_ADVICE_RULES`** через шаблонную строку.

### Что модель обязана вернуть (по промпту)

Из `RECIPE_SYSTEM_RULES_V3` / вложенного контракта в `RECIPE_STRICT_JSON_CONTRACT` (смысл совпадает, детали расходятся по длине):

- Поле **`description`**: 1–2 коротких предложения; в V3 — «макс. 160 симв.»; в `RECIPE_STRICT_JSON_CONTRACT` — подробные запреты (штампы, мед. обещания, дубль title, нутритивный акцент, запрет контекста «в дорогу» и т.д.).
- Запрет упоминать профиль, возраст, детей, аллергии в `description`, `steps`, `chefAdvice`.

### Ограничения длины / стиля

| Источник | Лимит / правило |
|----------|-----------------|
| Промпт V3 / STRICT_CONTRACT | ~160 символов заявлено |
| Zod `RecipeJsonSchema` | `description.max(210)` |
| `passesDescriptionQualityGate` | 38–210 символов, 1–2 предложения, завершённое последнее предложение |
| `pickCanonicalDescription` | обрезка до `DESCRIPTION_MAX_LENGTH` (210) при accept |

### Что «убивает» description после промпта

1. **`sanitizeRecipeText`** — regex-удаления (англ. child/baby, рус. «для ребёнка», фрагменты про аллергии и т.д.).
2. **`sanitizeMealMentions`** — удаление слов приёмов пищи и «на обед» и т.п.
3. **`passesDescriptionQualityGate` / `explainCanonicalDescriptionRejection`**.
4. **`textContainsRequestContextLeak`** — отдельно от `checkRequestContextLeak` на всём рецепте; список фраз в `requestContextLeakGuard.ts`.

### Файлы, функции, константы, влияющие на `description`

| Компонент | Расположение |
|-----------|----------------|
| Промпт: правила поля | `prompts.ts`: `RECIPE_SYSTEM_RULES_V3`, `RECIPE_STRICT_JSON_CONTRACT` (справочно, не в V3 path) |
| Схема | `recipeSchema.ts`: `RecipeJsonSchema`, нормализация `description.slice(0, 210)` |
| Гейт и выбор канона | `sanitizeAndRepair.ts`: `passesDescriptionQualityGate`, `pickCanonicalDescription`, `explainCanonicalDescriptionRejection`, `DESCRIPTION_FORBIDDEN_PHRASES`, `DESCRIPTION_NUTRITIONAL_MARKERS`, `descriptionStartsWithTitle` |
| Санитайзеры | `sanitizeAndRepair.ts`: `sanitizeRecipeText`, `sanitizeMealMentions` |
| Fallback текст | `_shared/recipeBenefitDescription.ts`: `buildRecipeBenefitDescription` |
| Цели для fallback | `_shared/recipeGoals.ts`: `inferNutritionGoals` (в `index.ts` до pick) |
| Legacy / не в hot path | `sanitizeAndRepair.ts`: `enforceDescription`, `buildDescriptionFallback`, `sanitizeDescriptionForPool`; **`repairDescriptionOnly`** (отдельный вызов LLM — **не вызывается из `index.ts`**); `_shared/recipeCopy.ts` (`buildRecipeDescription`) — реэкспорт в `recipe_io`, для chat-канона не используется в `index.ts` |
| Оркестрация | `index.ts`: блок `RECIPE_SANITIZED` / `pickCanonicalDescription` |

**Канонический путь сейчас:** один JSON от основной модели → parse/validate → санитайзеры → **`pickCanonicalDescription`**. Путь **`repairDescriptionOnly`** — **не** подключён к оркестратору (мёртвый/запасной код).

---

## 4. Token inflation audit

### Обязательные блоки (recipe-path V3)

- Строка роли (Free/Premium).
- `[CONTEXT]`: профиль, `AGE_CONTEXTS_SHORT`, `ВОЗРАСТ_МЕС`, allergiesExclude, dislikesLine, meal мета, optional `recentTitleKeysLine`.
- `MEAL_SOUP_RULES`.
- `CMPA_SAFETY_RULE` (всегда вставляется в V3, даже если нет БКМ в списке — усиление безопасности ценой токенов).
- `RECIPE_SYSTEM_RULES_V3` (**содержит полный `CHEF_ADVICE_RULES`**).

### Условные блоки (`index.ts`)

- `buildLikesAntiRepeatPromptLine` + при другом условии `buildRecipeSoftLikesPromptBlock` + `LIKES_DIVERSITY_RULE`.
- `extraSystemSuffix`.

### Дубли / перекрытия

- **JSON-only / один рецепт / mealType enum** повторяются в нескольких константах (`RECIPE_SYSTEM_RULES_V3`, фрагменты в `RECIPE_STRICT_JSON_CONTRACT`, исторически `RULES_USER_INTENT` — см. ниже).
- **`CHEF_ADVICE_RULES`**: большой pedagogical блок в промпте + **тот же смысл** enforced в `chefAdviceQuality.ts` / `enforceChefAdvice` (длина, low-value, forbidden start).
- **Супы:** `MEAL_SOUP_RULES` + упоминания mealType в V3.

### Конфликтующие правила (промпт vs пост-обработка)

- Промпт: `description` макс. **160**; схема/гейт: до **210**, минимум **38** и структура предложений — модель не получает одного согласованного целевого интервала.
- Промпт требует нутритивный акцент; гейт проверяет **фиксированный список** маркеров — частично дублирование, частично расхождение покрытия.

### Правила, лучше перенести в post-processing

- Укоротить **в промпте** список штампов для `description` до 1 строки («избегайте маркетинговых штампов»), детальный список оставить только в коде (`DESCRIPTION_FORBIDDEN_PHRASES`).
- Требование «не дублировать title» — уже есть в коде (`descriptionStartsWithTitle`); в промпте можно сократить до одной фразы.

### Уже дублируются пост-обработкой (кандидаты на сжатие в prompt)

- Длинные **good/bad примеры `chefAdvice`** в промпте при наличии `isChefAdviceLowValue` + `hasForbiddenChefAdviceStart` + обрезка по длине.

### Подозрительные блоки (детально)

| Блок | Где | Зачем добавлен (инференс) | Дубли | Сжатие? | Риск |
|------|-----|---------------------------|-------|---------|------|
| `CHEF_ADVICE_RULES` внутри V3 | `prompts.ts` | Качество совета с первого прохода | `chefAdviceQuality.ts`, `enforceChefAdvice` | Убрать примеры, оставить жёсткие ограничения | Средний: чуть больше generic советов до отсечения → чаще `null` |
| `MEAL_SOUP_RULES` | `prompts.ts` | План/слоты обед=суп | Строки в V3 / decision docs | Слить в 4–5 строк | Средний |
| `CMPA_SAFETY_RULE` | `prompts.ts` | БКМ safety | Алиасы в blockedTokens | Условно если нет молочного аллергена в профиле | **Высокий** при ошибочной классификации |
| `RECIPE_STRICT_JSON_CONTRACT` | `prompts.ts` | Исторически полный контракт | Не вставляется в V3 | Не тянуть в промпт; или явно пометить deprecated для recipe-path | Низкий |
| `RULES_USER_INTENT` | `prompts.ts` | User intent | Не используется в `FREE_RECIPE_TEMPLATE` / V3 | Удалить или подключить осознанно | Низкий |
| Likes блоки | `index.ts` + `chatLikesSignal.ts` | Разнообразие | `LIKES_DIVERSITY_RULE` дублирует идею | Слить в один короткий блок | Низкий–средний |

### High confidence token cuts

1. Убрать из production-логов **полный** `SENDING PAYLOAD` или логировать только хеш + длины + первые N символов system prompt.
2. Сократить **`CHEF_ADVICE_RULES`** в промпте: оставить лимиты и запреты без многострочных примеров (пост-процесс остаётся).
3. Одна строка вместо повторов «только JSON, без markdown» если останется после слияния блоков.
4. Документировать и перестать рекомендовать **`RECIPE_STRICT_JSON_CONTRACT`** как часть живого recipe-path, если не возвращают в сборку — уменьшит путаницу и лишние правки.

### Risky cuts

1. Условный **`CMPA_SAFETY_RULE`** — только с надёжным детектом БКМ в профиле.
2. Ослабление **`MEAL_SOUP_RULES`** — затрагивает decision SoT по обеду/супу.
3. Удаление **dislikes** из промпта — нарушает продуктовые ограничения (не делать).
4. Смягчение **allergy** или **checkRecipeRequestBlocked** — категорически не для этой задачи.

---

## 5. Description failure audit (таблица)

| Причина | Где проверяется | При fail | Вероятность (оценка по коду) | Prompt vs post |
|---------|-----------------|----------|------------------------------|----------------|
| Невалидный / обрезанный JSON | `validateRecipe`, `recipeSchema` | `getRecipeOrFallback` / retry | Средняя при сбоях модели | Оба |
| `description` отсутствует / пустое | Zod / нормализация | Пустая строка в объект → гейт | Низкая если JSON валиден | Промпт |
| Длина \< 38 или \> 210 | `passesDescriptionQualityGate` | `deterministic_fallback` | **Высокая** при коротких ответах | Рассинхрон промпт/гейт |
| Не 1–2 предложения (`countSentences`) |同上 | fallback | Средняя (3 предложения, «!» и т.д.) | Промпт + пост (`sanitizeRecipeText` меняет `!`) |
| Два предложения, длина \< 45 |同上 | fallback | Средняя | Гейт жёстче промпта |
| Запрещённая фраза / штамп | `DESCRIPTION_FORBIDDEN_PHRASES` | fallback | Средняя (подстроки) | Дубль: промпт + код |
| Повтор / начало как title | `descriptionStartsWithTitle` | fallback | Средняя для коротких title | Пост |
| Нет нутритивного маркера | `hasNutritionalMarker` | fallback | Низкая–средняя | Пост |
| Незавершённое последнее предложение | `lastSentenceComplete` | fallback | Средняя | Пост |
| Request context leak | `textContainsRequestContextLeak` | fallback | Средняя если модель «продаёт» сценарий | Промпт запрещает; пост отсекает |
| `sanitizeRecipeText` / `sanitizeMealMentions` | до гейта | Может сделать текст невалидным для гейта | Средняя | **Пост** |
| Полный fallback рецепта | `getRecipeOrFallback` | Шаблонное description | Редко при успешном JSON | Отдельный от канона |

---

## 6. Prompt vs post-processing diagnosis

### Оставить в prompt

- Один рецепт, JSON-only, список полей (компактно).
- Аллергии / dislikes как жёсткие ограничения (без дублирования всего `STRICT_RULES`, если не используется).
- Супы ↔ lunch (коротко).
- БКМ / CMPA при наличии риска (или всегда, если не внедряем условную вставку).
- Общий тон description (без перечисления 15 штампов).

### Ослабить в prompt

- Детальные примеры `chefAdvice`.
- Дублирующие абзацы про description (свести к одному согласованному диапазону длины с гейтом).

### Убрать из prompt → делать детерминированно после ответа

- Расширенные списки запрещённых штампов (уже в коде).
- Часть нутритивных требований: опционально **добавлять** маркер при мягком repair (без второго полного JSON), если политика продукта позволит — обсуждается отдельно.

**Важно:** не убирать пост-обработку в пользу только промпта для pool-safe текстов (leak, age mentions) — это security/quality для БД.

---

## 7. План снижения fallback frequency (safe-first)

### Stage A — Instrumentation

- **Цель:** измерить доли `rejection_reason` из `explainCanonicalDescriptionRejection`.
- **Файлы:** `index.ts` / `sanitizeAndRepair.ts` (структурированный лог уже частично есть: `CHAT_DESCRIPTION_DEBUG`).
- **Проверка:** выборка логов за N дней; топ причин.
- **Риск:** низкий.

### Stage B — Prompt compression (без смены гейта)

- **Цель:** −токены, меньше когнитивной перегрузки модели.
- **Файлы:** `prompts.ts`.
- **Проверка:** регрессионные `deno test` recipe_io; ручной smoke чат.
- **Риск:** низкий–средний.

### Stage C — Синхронизация промпта с гейтом

- **Цель:** одна спецификация длины и предложений (например минимум 38, макс 210, 1–2 предложения) **явно** в промпте.
- **Файлы:** `prompts.ts`, при необходимости комментарий в `recipeSchema.ts`.
- **Ожидание:** резкое снижение fallback из-за length/sentence mismatch.
- **Риск:** средний (нужны A/B или логи до/после).

### Stage D — Tune description gate

- **Цель:** снизить ложные отбрасывания (например пересмотр `descriptionStartsWithTitle`, узкие запреты вместо широких подстрок).
- **Файлы:** `sanitizeAndRepair.ts`, тесты `recipe_io.test.ts`.
- **Риск:** средний — больше штампов в БД если перегнуть.

### Stage E — Optional targeted micro-repair

- **Цель:** только если Stage C–D недостаточно: вызов **`repairDescriptionOnly`** или короткий follow-up **только для description** при конкретных причинах (например `incomplete_final_sentence`), с лимитом и флагом env.
- **Файлы:** `index.ts`, `sanitizeAndRepair.ts`.
- **Риск:** латентность + стоимость; нужен kill-switch.

---

## 8. Конкретные рекомендации по коду (приоритеты)

### P0

| # | Файлы | Суть | Эффект | Риск |
|---|-------|------|--------|------|
| 1 | `index.ts` | Не логировать полный payload в production / маскировать | Меньше шума, дешевле логи | Низкий |
| 2 | `prompts.ts` | Сжать `CHEF_ADVICE_RULES` в промпте (убрать длинные примеры) | −input tokens | Чуть больше `chefAdvice` → null |
| 3 | `prompts.ts` + `system-prompts-map.md` | Явно указать: recipe-path использует только V3-вставки; `RECIPE_STRICT_JSON_CONTRACT` не в hot path | Меньше ошибочных правок | Низкий |

### P1

| # | Файлы | Суть | Эффект | Риск |
|---|-------|------|--------|------|
| 4 | `prompts.ts` | Согласовать текст description (мин/макс символов) с `passesDescriptionQualityGate` | Меньше fallback | Средний |
| 5 | `sanitizeAndRepair.ts` | Пересмотреть `sanitizeMealMentions` для `description` (опционально пропускать или мягче) | Меньше поломки текста | Средний |
| 6 | `sanitizeAndRepair.ts` | Сузить проблемные `DESCRIPTION_FORBIDDEN_PHRASES` (regex / word boundary) | Меньше ложных fallback | Средний |

### P2

| # | Файлы | Суть | Эффект | Риск |
|---|-------|------|--------|------|
| 7 | `buildPrompt.ts` | Условно включать `CMPA_SAFETY_RULE` | −токены когда не нужно | Высокий при ошибке условия |
| 8 | `index.ts` | Модульный split оркестратора (prompt assembly / post-process / persist) | Поддерживаемость | Средний (регрессии) |
| 9 | `index.ts` | Опциональный `repairDescriptionOnly` за флагом + причина reject | Ниже fallback | Стоимость/латентность |

---

## 9. Проверка рассинхронов docs vs code

| Наблюдение | Детали |
|------------|--------|
| **`system-prompts-map.md`** перечисляет `RECIPE_STRICT_JSON_CONTRACT`, `RULES_USER_INTENT`, `STRICT_RULES` как часть правил парсинга recipe | Для **recipe JSON path** фактически в промпт идёт **`generateRecipeSystemPromptV3`**, который **не** включает `RECIPE_STRICT_JSON_CONTRACT` и **`RULES_USER_INTENT`**. `STRICT_RULES` только внутри **FREE/PREMIUM шаблонов**, которые для recipe-path **не** выбираются. |
| **`chat_recipe_generation.md` §3.3** (Premium / `isRelevantPremiumQuery`) | В **`index.ts`** для `type === "chat"` используется **`checkFoodRelevance`**; **`isRelevantPremiumQuery`** в обработчике **не вызывается**. |
| **Длина `chefAdvice` в доках** | `system-prompts-map` упоминает ≤220 в контексте схемы; **`chefAdviceQuality.ts`**: `CHEF_ADVICE_MAX_LENGTH = 160**; Zod в `recipeSchema` режет до 200 на этапе нормализации и max 220 в схеме — требуется единая цифра в документации. |
| **`recipe-core-multilang-progress.md`** исторические чеклисты про `composeRecipeDescription` / `descriptionSource: "composer"` | В начале файла есть предупреждение об архивности; ниже по тексту всё ещё есть строки про composer-path — **канон сейчас: `pickCanonicalDescription` + `buildRecipeBenefitDescription`**. |
| **`repairDescriptionOnly`** в refactor-plan | В коде функция есть, **вызова из `index.ts` нет** — документы, предполагающие активный repair, устарели. |

### Что досинхронизировать

- `docs/architecture/system-prompts-map.md`: уточнить, какие константы **реально** входят в recipe-path V3.
- `docs/architecture/chat_recipe_generation.md`: убрать или пометить устаревшим блок про Premium `isRelevantPremiumQuery`, если поведение не планируется возвращать.
- `docs/refactor/recipe-core-multilang-refactor-plan.md` (при следующем редактировании): обновить упоминания `repairDescriptionOnly` как основного пути.
- Вынести в один абзац **single source of truth** для description: промпт + Zod + `passesDescriptionQualityGate` (после согласования цифр).

---

## 10. Что НЕ надо менять (в рамках этой цели)

- **`checkRecipeRequestBlocked`** и клиентский mirror для токенов аллергий/dislikes.
- **`CMPA`** логика на уровне продуктовых требований без отдельного анализа рисков.
- **Супы только на обед** — зафиксировано в decisions / generate-plan; не ломать ради токенов без пересмотра SoT.
- **Поле `chefAdvice` → null** при слабом тексте — не подменять агрессивными шаблонами в hot path (текущая политика).
- **`chat_history` пишет только клиент** (см. change-safety-checklist) — не переносить на Edge.

---

## 11. Финальный deliverable

1. **Отчёт:** этот файл — [`docs/dev/deepseek-chat-audit-2026-03-description-and-token-reduction.md`](./deepseek-chat-audit-2026-03-description-and-token-reduction.md).
2. **Краткий итог:** recipe-path раздут за счёт **V3 + большого `CHEF_ADVICE_RULES` + супы + CMPA + контекст**; fallback по `description` в основном из‑за **жёсткого `passesDescriptionQualityGate` и рассинхрона с промптом (160 vs 38–210)** плюс **санитайзеры**; быстрые победы — **сжать промпт chefAdvice**, **согласовать лимиты**, **логи**; `repairDescriptionOnly` **не используется**.
3. **Рекомендуемые next steps:** Stage A логирование долей `rejection_reason` → Stage B сжатие промпта → Stage C синхронизация цифр description → точечная настройка гейта → опционально repair под флагом.
4. **Следующий prompt для Cursor (пример):**  
   *«По отчёту `docs/dev/deepseek-chat-audit-2026-03-description-and-token-reduction.md` реализуй Stage B+C: сожми `CHEF_ADVICE_RULES` в `prompts.ts` без удаления смысловых запретов; синхронизируй требования к `description` в `RECIPE_SYSTEM_RULES_V3` с `passesDescriptionQualityGate` (мин/макс длина и число предложений); обнови `docs/architecture/system-prompts-map.md` и затронутые абзацы `chat_recipe_generation.md`; добавь/обнови тесты в `recipe_io.test.ts`; не трогай allergy/dislike blocking и CMPA без отдельного согласования.»*

---

## Допущения

- Частота fallback **оценивалась логически** по условиям гейта; точные проценты требуют логов (`CHAT_DESCRIPTION_DEBUG` / расширенного структурированного лога).
- Поведение DeepSeek по `response_format: json_object` считается достаточно стабильным; основные потери качества description локализованы в пост-обработке и гейте, а не в extract JSON.
