# Генерация рецептов во вкладке «Чат» — полное описание

Документ описывает, как работает функция генерации рецептов в чате: поток данных, фильтры, возрастные группы, аллергии, «любит/не любит», используемые модули и вебхуки (Edge Functions и _shared).

---

## Карта системы (1 экран)

Четыре доменных модуля (Edge, `supabase/functions/deepseek-chat/`):
- **domain/policies** — аллергии, dislikes, «без X», токены, границы слов; формирование ответа «заблокировано».
- **domain/family** — семейный режим: исключение <12 мес, kid-safety 12–35 мес, server-truth контекст, лайки, storage member.
- **domain/recipe_io** — парсинг/валидация/retry JSON рецепта, описание/совет шефа, ремонт и санитизация.
- **domain/meal** — определение типа приёма пищи из запроса, дефолты (servings, maxCookingTime).

Оркестратор **index.ts**: вход → policy-block → **маршрут recipe-generation** (standard / **блок 0–11 мес curated-only**) → сборка промпта → вызов модели → parse/repair → сохранение → ответ.

### Маршрутизация recipe-generation (0–11 мес: только curated, без AI-рецепта в чате)

Действует **только** если запрос уже попал в **recipe-generation path** (`isRecipeRequest`: `type === "recipe"` или `type === "chat"` после allow по релевантности). **Не** влияет на SOS, balance_check, нерелевантный чат, assistant_topic.

| Ветка | Условие | Поведение |
|--------|---------|-----------|
| **under_12_curated_block** | `targetIsFamily === false`, профиль **child** (`members.type` или fallback см. ниже), числовой **age_months** (или **ageMonths**) ∈ [0, 11] | Ответ с текстом-подсказкой, `recipes: []`, `route: "under_12_curated_recipe_block"`, `reason_code: "under_12_curated_recipe_block"`. **Без LLM**, без сохранения рецепта, без retry. Рекомендации по прикорму — во вкладке «Помощь маме»; проверенные блюда — **план питания** (пул рецептов). |
| **standard** | семья, взрослый, ребёнок ≥12 мес, ребёнок без числового возраста, неизвестный тип при возрасте ≥12 мес | **generateRecipeSystemPromptV3** и обычный вызов модели. |

**Продуктовые причины:** безопасность и предсказуемость для возраста до года; меньше токенов и проще сопровождение; контроль качества через **курируемый пул** в плане (группы 4–6, 7–8 и 9–11 мес), а не через свободную генерацию в чате.

**Семья:** блок **не** применяется; семейные рецепты остаются на **standard** path (как и раньше).

**Отсутствие `age_months` у child:** блок **не** включается → **standard** path (компромисс: без возраста не отключаем генерацию).

**Отсутствие `type` в запросе:** Edge может считать профиль «ребёнком» при эвристике **числовой возраст &lt; 12 мес** (`normalizeMemberTypeForRecipeRouting` в **recipeGenerationRouting.ts**). Явный **`type: "adult"`** отключает детский routing.

**Проверка в коде:** `isUnderOneYearChildForRecipeGeneration` / `resolveRecipeGenerationRoute` — **deepseek-chat/domain/recipe_generation/recipeGenerationRouting.ts**.

---

## Где править что

- **Блокировка по аллергии/dislike, «без X», альтернативы** — `deepseek-chat/domain/policies/`; токены/алиасы — `_shared/blockedTokens.ts`, `_shared/allergyAliases.ts`.
- **Семейный режим, <12 мес, kid-safety 12–35 мес, server-truth блок** — `deepseek-chat/domain/family/` (re-export из `_shared/familyMode.ts`, `_shared/familyContextBlock.ts`).
- **Текст промптов, возраст, шаблоны Free/Premium** — `deepseek-chat/prompts.ts`, `deepseek-chat/ageCategory.ts`, `deepseek-chat/buildPrompt.ts`.
- **Парсинг/валидация/retry рецепта, описание/совет, санитизация** — `deepseek-chat/domain/recipe_io/`, `_shared/parsing/`, `_shared/recipeCopy.ts`; схема — `deepseek-chat/recipeSchema.ts`.
- **Тип приёма пищи из запроса** — `deepseek-chat/domain/meal/` (re-export `_shared/mealType/inferMealType.ts`).
- **Оркестрация, лимиты, сохранение в БД** — `deepseek-chat/index.ts`.
- **Routing 0–11 мес (curated-only)** — `deepseek-chat/domain/recipe_generation/recipeGenerationRouting.ts` (`buildUnder12CuratedRecipeBlockPayload`, константы `UNDER_12_*`).

---

## Контракты ответа (blocked vs ok)

| Тип | HTTP | Ключевые поля | Когда |
|-----|------|----------------|-------|
| blocked | 200 | `blocked: true`, `blocked_by`, `message`, `blocked_items`, `suggested_alternatives`, `original_query` | Запрос содержит аллерген/dislike (кроме «без X»). Модель не вызывается. |
| ok (рецепт) | 200 | `message`, `recipes`, `recipe_id?` | Успешная генерация. |
| ok (без рецепта) | 200 | `message`, `recipes: []` | Заглушка, SOS, анализ тарелки. |
| redirect/irrelevant | 200 | `message`, `recipes: []`, `route: "assistant_topic" \| "irrelevant"`, при assistant_topic — `topicKey`, `topicTitle`, `topicShortTitle` | Маршрутизация: тема Помощника или нерелевантный запрос; фронт рендерит SystemHintCard (короткий текст, «Тема: {topicShortTitle}», кнопка «Перейти в Помощник»). |
| under_12_curated_recipe_block | 200 | `message`, `recipes: []`, `route: "under_12_curated_recipe_block"`, **`reason_code`: `"under_12_curated_recipe_block"`** | Только **recipe-generation path**: одиночный профиль **child** с числовым возрастом **0–11 мес**. LLM не вызывается, рецепт не сохраняется. Лог: `under_12_curated_recipe_block`. |
| ошибка | 200/429/500 | `error`, `message` | Лимит, таймаут, API/сервер. |

### Текст блока 0–11 мес (recipe path only)

Текст поля **`message`** при **`route: "under_12_curated_recipe_block"`** задаётся константой **`UNDER_12_CURATED_RECIPE_BLOCK_MESSAGE`** в **`recipeGenerationRouting.ts`**: объяснение, что рецепты в чате не генерируются; предложение использовать **план питания** и раздел **«Помощь маме»**.

**Фронт:** `ChatPage` сохраняет в `chat_history.meta` значение **`systemHintType: "curated_under_12_recipe"`** и показывает **`SystemHintCard`** с кнопками «Открыть план» (`/meal-plan`) и «Помощь маме» (`/sos`).

Примеры: **blocked** — `{"blocked":true,"blocked_by":"allergy","profile_name":"Ребёнок","blocked_items":["орехи"],"suggested_alternatives":[...],"message":"У профиля..."}`. **ok** — `{"message":"{...}","recipes":[{...}],"recipe_id":"uuid"}`. **Лимит** — `{"error":"LIMIT_REACHED","message":"Лимит на сегодня исчерпан.","payload":{"feature":"chat_recipe","limit":2,"used":2}}`.

**Запуск контрактных тестов (Edge):** нужен [Deno](https://deno.com/). Установка на Windows: `winget install Deno.Deno` или с [deno.land](https://deno.land/#installation). Затем из корня репозитория: `npm run test:edge` или из `supabase/functions`: `deno test deepseek-chat/domain/policies/policies.test.ts deepseek-chat/domain/family/family.test.ts deepseek-chat/domain/recipe_io/recipe_io.test.ts --allow-read`.

---

## 1. Общий поток

1. **Пользователь** вводит сообщение на вкладке «Чат» (режим рецептов, `mode === "recipes"`) или приходит с **плана** с уже подставленным текстом в поле ввода (`location.state.prefillMessage`, без автоотправки — см. [PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md](./PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md) § 8).
2. **Клиент** (`ChatPage` → `useDeepSeekAPI`) собирает контекст: выбранный профиль или «Семья», члены семьи, строит `GenerationContext` и payload для API.
3. **Проверка на блокировку** (аллергия/dislike в запросе) выполняется дважды: на клиенте (`checkChatRequestAgainstProfile`) и на Edge (`buildBlockedTokenSet` + **`containsAnyTokenForAllergy`** из `_shared/allergensDictionary`, как на клиенте — подстрока по токенам, не граница слова). При совпадении запрос не отправляется в модель, возвращается сообщение с подсказками. (Вспомогательная `findMatchedTokens` в `blockedTokens.ts` остаётся для тестов/границ слова; политика чата ей не пользуется.)
4. **Запрос** уходит в Edge Function `deepseek-chat` (POST, без стриминга ответа — всегда JSON).
5. **Edge** собирает system prompt (шаблон Free/Premium, возраст, аллергии, предпочтения, тип приёма пищи, anti-duplicate), при необходимости блокирует по аллергии/dislike, вызывает DeepSeek API, парсит и валидирует JSON рецепта, при необходимости чинит описание/совет шефа, сохраняет рецепт в БД и возвращает `{ message, recipes, recipe_id }`.
6. **Клиент** обновляет сообщения в чате; если с бэкенда пришёл `recipe_id`, использует его, иначе при успешной валидации вызывает `saveRecipesFromChat` для сохранения рецепта через `createRecipe` (на случай, если Edge не сохранил или ответ пришёл без `recipe_id`).

---

## 2. Режимы профиля: один член семьи vs «Семья»

- **Один профиль (single):** выбран конкретный член семьи. В промпт идут его возраст, аллергии, likes, dislikes, difficulty. Рецепт привязан к нему по возрасту и ограничениям.
- **Семья (family):** доступно только при Premium/Trial (`buildGenerationContext`). Free при выборе «Семья» получает контекст первого профиля (single). В режиме «Семья»:
  - Учитываются **все** аллергии и **все** dislikes всех членов семьи.
  - Младенцы (**&lt; 12 мес**) в промпт для рецепта **не попадают**, если есть хотя бы один член ≥ 12 мес (`getFamilyPromptMembers` в `_shared/familyMode.ts`). Если все &lt; 12 мес — в промпт идут все.
  - Для возраста в шаблоне используется «взрослый» контекст (без прикорма), но при наличии детей 1–3 года (12–35 мес) добавляется блок безопасности `KID_SAFETY_1_3_INSTRUCTION` (kid-safety фильтр).
  - Блок контекста генерации в режиме «Семья» на Edge **всегда** пересобирается сервером (`buildFamilyGenerationContextBlock`), а не берётся с фронта (чтобы не было «Children:», «safe for ALL children» и младенцев &lt; 12 мес).

Построение контекста на клиенте:

- `buildGenerationContext(family, activeProfileId, plan)` — определяет `mode: "single" | "family"` и `target` / `targets`.
- `derivePayloadFromContext(context, membersWithAgeMonths)` — даёт `memberData`, `allMembers`, `targetIsFamily` для тела запроса.
- `buildPrompt(context, membersWithAgeMonths)` — даёт текстовый блок `generationContextBlock` (для single — «Child:», для family — «Children:» + блоки по каждому ребёнку). В режиме «Семья» на Edge этот блок заменяется на server-truth из `buildFamilyGenerationContextBlock`.

---

## 3. Фильтры и ограничения

### 3.1 Блокировка запроса по аллергиям и «не любят»

- **Цель:** не вызывать модель, если пользователь явно просит блюдо с аллергеном или с продуктом из «не любят». Исключение: формулировки вида «без X» (например, «суп без лука» при аллергии на лук) не блокируют — запрос разрешён.
- **Клиент:** `src/utils/chatBlockedCheck.ts` — `checkChatRequestAgainstProfile`. Использует `buildBlockedTokens` / **`containsAnyTokenForAllergy`** из `@/utils/allergenTokens` (в унисон с Edge по токенам/алиасам и с матчем плана).
- **Edge:** `supabase/functions/deepseek-chat/index.ts`: списки аллергий и dislikes для **политики блокировки** — **полный** набор: для «Семья» объединение по **`allMembers` из БД**, для одного профиля — `memberDataNorm` (не усечённый до одной аллергии вариант для промпта). Строится `buildBlockedTokenSet` (_shared/blockedTokens), из текста запроса удаляются фразы «без X» через `textWithoutExclusionPhrases`, затем **`checkRecipeRequestBlocked`** сравнивает текст с токенами через **`containsAnyTokenForAllergy`**. При совпадении возвращается JSON с `blocked: true`, …, без вызова модели и без записи в `usage_events`.
- **Post-recipe safety:** после валидного JSON рецепта от модели (и до учёта `usage_events` chat_recipe) — проверка теми же токенами и **`chatRecipeAllergySafety` + `recipeAllergyMatch`** по полям title, description, ингредиенты (name, display_text). При конфликте — тот же JSON `blocked` + `buildAllergyBlockedResponsePayload`; лог `CHAT_RECIPE_ALLERGY_SAFETY_REJECTION`. Не выполняется при `from_plan_replace`. Подробнее: `docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md` §5.

Токены для аллергий строятся через `_shared/allergens.ts` → `getBlockedTokensFromAllergies` → `_shared/allergyAliases.ts` (`buildBlockedTokensFromAllergies`) с алиасами (БКМ, глютен, яйца, рыба, орехи и т.д.). Для dislikes используется тот же механизм (один элемент = один «аллерген» для набора токенов). В `blockedTokens` проверка идёт по границам слов (например, «орех» не матчится в «запеканка»). Для явных запросов с прилагательными («ореховый пудинг», «яичный рулет») в словарь добавлены формы типа «ореховый», «яичный», «молочный», чтобы запрос блокировался до вызова модели и показывалось понятное сообщение об аллергии.

### 3.2 Маршрутизация запросов во вкладке Чат (type === "chat")

На Edge для типа `chat` применяется **порядок проверок** (без вызова модели при redirect):

1. **Тема вкладки «Помощник»** — `detectAssistantTopic` (`assistantTopicDetect.ts`): если запрос явно про прикорм, аллергию/сыпь, стул/ЖКТ, срыгивания, отказ от еды, режим кормления, дневник питания или срочную помощь, возвращается мягкое сообщение с предложением задать вопрос во вкладке «Помощник» (с указанием темы при совпадении). Модель не вызывается. Лог: `CHAT_ROUTE: assistant_topic` (topicKey, matchedTerms). Для темы «стул» слово **«кал»** сопоставляется только как отдельное слово (паттерн `_shared/russianStoolKalPattern.ts`), чтобы не перехватывать «калорийный», «калории» и т.п.; клиентский fallback (`chatRouteFallback.ts`) использует тот же паттерн.
2. **Релевантность для рецепта** — `checkFoodRelevance` (`isRelevantQuery.ts`): при `allowed: false` возвращается мягкое сообщение о том, что чат помогает подбирать рецепты. Модель не вызывается. Лог: `CHAT_ROUTE: irrelevant` (reason, matched_terms/patterns).
3. **Рецепт** — при `allowed: true` выполняется обычная генерация рецепта. Лог: `CHAT_ROUTE: recipe`.

Принцип: **fail-open** — при сомнении разрешать генерацию рецепта; темы Помощника и нерелевантные запросы отсекаются только по явным ключевым словам/паттернам.

Ответы redirect/irrelevant возвращают в теле JSON поля `route` (`assistant_topic` или `irrelevant`), при `assistant_topic` — `topicKey` и `topicTitle` (и при необходимости `topicShortTitle`) для перехода во вкладку «Помощник» по сценарию (`/sos?scenario=<topicKey>`). На фронте такие сообщения отображаются карточкой системной подсказки (`SystemHintCard`), без кнопок рецепта (избранное, поделиться, в план). Клиент при сохранении в `chat_history` записывает в `meta` поля `systemHintType`, `topicKey`, `topicTitle`, `topicShortTitle`, чтобы после переключения вкладки/remount карточка и кнопка «Перейти в тему» восстанавливались с корректной навигацией в нужную тему. Для **`under_12_curated_recipe_block`** в `meta.systemHintType` сохраняется **`curated_under_12_recipe`** (кнопки «Открыть план» / «Помощь маме»).

### 3.3 Релевантность запроса (тариф)

- **Фактическое поведение Edge (`index.ts`, `type === "chat"`):** перед генерацией рецепта вызывается **`checkFoodRelevance`** (внутри — `isRelevantQuery` / `isRelevantQuery.ts`). При `allowed: false` возвращается ответ с `route: "irrelevant"`, модель не вызывается. **Отдельного ветвления Free vs Premium через `isRelevantPremiumQuery` в этом обработчике нет** — тариф на этом шаге не меняет проверку релевантности.
- Функция **`isRelevantPremiumQuery`** может существовать в кодовой базе для иных сценариев; для описанного потока чата с рецептом источником истины — **`checkFoodRelevance`**.

### 3.4 Лимиты

- **Free:** 2 запроса в день на рецепты в чате (фича `chat_recipe`), 2 запроса на SOS (фича `help`). Проверка через `get_usage_count_today` и при необходимости `check_usage_limit`.
- **Premium/Trial:** без лимита по этим фичам.

---

## 4. Возрастные группы и правила

- **Категории возраста** (Edge: `deepseek-chat/ageCategory.ts`):  
  `infant` (≤12 мес), `toddler` (13–60 мес), `school` (61–216 мес), `adult` (&gt;216 мес).
- **Откуда берётся возраст:** на Edge — `getAgeMonths(member)` (поле `age_months` или `ageMonths`, иначе расчёт из `birth_date`). В режиме «Семья» для шаблона используется «объединённый» профиль с возрастом взрослого (216 мес), но для kid-safety смотрится наличие членов 12–35 мес.
- **Правила в промпт** (`prompts.ts` — `AGE_CONTEXTS`, плюс `getAgeCategoryRules` в `ageCategory.ts`):
  - **infant:** только прикорм/пюре; без соли, сахара, мёда, цельного молока; мягкие текстуры.
  - **toddler:** 12–60 мес; мягкая еда, минимум соли; без жёстких кусочков, орехов, сырых овощей (12–24 мес); 24–60 мес — мягкие кусочки, без зажарки и острого.
  - **school:** 5–18 лет, полноценное детское меню.
  - **adult:** 18+, без детского пюре и каш на воде.

Дополнительно в system prompt добавляется `getAgeCategoryRules(ageCategory)` (краткие правила по текстуре, соли, специям).

---

## 5. Аллергии

- **Учёт:** в system prompt подставляется список аллергий (для семьи — объединение по всем членам). В шаблоне есть явное требование: аллергии — абсолютный запрет, при конфликте с идеей блюда — замена ингредиента.
- **Кто считается Free/Premium на Edge (важно для аллергий):** `deepseek-chat/index.ts` передаёт в `buildPromptByProfileAndTariff` поле **`profiles_v2.status`** (`premium` / `trial` / иначе free). **`premium_until` и `trial_until` для выбора тарифа на Edge не используются** (даты только для лога / истечения trial в том же хендлере). На клиенте `useSubscription` показывает **effectiveStatus**: пользователь считается с оплаченным доступом при **активном `premium_until`**, даже если `status` ещё **`free`**. В таком состоянии в приложении Premium, а на Edge срабатывает ветка Free → **`useAllAllergies: false`** → в промпт уходит **не более одной** аллергии (`slice(0, 1)`). Тесты-контракт: `src/utils/subscriptionChatEdgeParity.test.ts`.
- **Free (когда Edge реально видит free по status):** в промпт передаётся не более одной аллергии (`useAllAllergies: false` в `promptByTariff`).
- **Токены и алиасы:** Edge использует `_shared/allergyAliases.ts` и `_shared/allergens.ts` (через `allergensDictionary.ts`). Алиасы покрывают БКМ, глютен, яйца, рыбу, орехи, арахис, сою, кунжут, мёд и др.; по каждому аллергену заданы токены для поиска в тексте (в т.ч. «молок», «йогурт», «глютен», «пшениц» и т.д.). Клиент для блокировки запроса использует тот же источник истины в `src/utils/allergenTokens` (и при необходимости словарь в `src/shared/allergensDictionary.ts`; см. `scripts/sync-allergens-dict.mjs` для синхронизации с Edge).
- **БКМ (аллергия на белок коровьего молока):** в промпт при генерации рецепта всегда добавляется блок **CMPA_SAFETY_RULE** (`prompts.ts`): при аллергии на БКМ запрещено предлагать безлактозные молочные продукты и козье молоко/козий творог (аллерген — белок, не лактоза; у большинства детей с БКМ перекрёстная реакция на козье молоко). Разрешены только полностью немолочные замены (тофу, бобовые, ореховые/соевые напитки и т.д.). Токены для БКМ дополнительно включают «коз», «козий», «козье», «безлактоз», «безлактозный», «goat», «lactose-free», чтобы рецепты с такими ингредиентами не сохранялись и при необходимости блокировались в запросе.

---

## 6. «Любит» (likes) и «Не любит» (dislikes)

- **Dislikes:** трактуются как жёсткое ограничение: в рецепте не должно быть этих продуктов. Участвуют в блокировке запроса (если в тексте запроса есть продукт из dislikes — ответ «заблокировано», с подсказками). В промпте передаются как «Dislikes (STRICT)».
- **Likes:** мягкий сигнал, **не** обязательный ингредиент и **не** часть компактного `[CONTEXT]` в **generateRecipeSystemPromptV3** (`buildPrompt.ts`): в recipe-path список likes туда не подставляется, чтобы модель не воспринимала его как must-use на каждой генерации. Сборка — в **deepseek-chat/index.ts**: `shouldFavorLikes` (~20%, детерминированно по requestId + userId + дата) и при срабатывании — блок `buildRecipeSoftLikesPromptBlock` + **LIKES_DIVERSITY_RULE** (`_shared/chatLikesSignal.ts`, `prompts.ts`). Если в **последних 3** нормализованных названиях чат-рецептов уже есть совпадение с like (подстрока/склонения через `likeMatchesTitleKey`), положительный сигнал про likes **не** добавляется, вместо этого в промпт попадает явный анти-повтор (`buildLikesAntiRepeatPromptLine`). Порядок title keys совпадает с хронологией `chat_history` (после выборки рецептов). Non-recipe path: при favor-roll — смягчённые `buildLikesLine` / `buildLikesLineForProfile` (`likesFavoring.ts`). Шаблоны Free/Premium по-прежнему подставляют **{{preferences}}** (likes или preferences) для текстового чата без JSON-рецепта. Диагностика: env **CHAT_LIKES_DEBUG=true** — JSON-лог `CHAT_LIKES_DEBUG` (request_id, member_type, likes, флаги сигнала/анти-повтора, reason, недавние title keys).

Предпочтения (preferences), включая «вегетарианское», «без молочного» и т.п., подставляются в шаблон и интерпретируются в `STRICT_RULES` (prompts.ts): семантически как запреты (не использовать мясо/рыбу, молочное и т.д.).

---

## 7. Валидация рецепта после генерации

- **На Edge:** ответ модели парсится через `validateRecipe` (_shared/parsing) с колбэком `parseAndValidateRecipeJsonFromString` (схема в `recipeSchema.ts`). При ошибке — попытка починить JSON через `retryFixJson`; при неудаче — fallback-рецепт `getRecipeOrFallback`. **`decideRecipeRecovery` / `retryFixJson` не зависят от качества `chef_advice`:** слабый совет не инициирует второй полный вызов модели; рецепт — от первого ответа, совет режется в `enforceChefAdvice` → `null`. Цель продукта — **полезный совет с первого прохода** (промпт + смягчённый quality gate), а не «любой текст ради поля». **Описание (один канон для чата и БД):** после `sanitizeMealMentions` / `sanitizeRecipeText` — **`resolveChatRecipeCanonicalDescription`**: при прохождении `passesDescriptionQualityGate` источник **`llm_raw`** (1–2 предложения; длина **38–210** симв. — `DESCRIPTION_QUALITY_MIN_LENGTH` / `DESCRIPTION_MAX_LENGTH` в `sanitizeAndRepair.ts`; при **двух** предложениях минимум **45** симв. — `DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH`; запретные штампы, **нутритивный или сенсорный** маркер — `hasNutritionalOrSensoryDescriptionCue`, не дубль title, завершённое последнее предложение; при **≥4 «сильных»** словах в title — мягкая привязка к блюду, иначе **`missing_title_anchoring`** (допускается проход при **сенсорике + бытовой пользе** — см. `descriptionPassesTitleAnchoringHeuristic`); нет утечки адаптации профиля/аллергий — `descriptionHasProfileAdaptationLeak` (**`profile_adaptation_leak`**) и нет `textContainsRequestContextLeak`; иначе один вызов **`repairChatRecipeDescription`** — при успехе **`llm_repair`**; иначе **`buildEmergencyChatRecipeDescription`** (**`emergency_fallback`**). **`buildRecipeBenefitDescription`** для **`chat_ai` на Edge как финальный текст не подставляется.** Промпт recipe-path (**`RECIPE_SYSTEM_RULES_V3`**) использует **те же числа** (импорт констант из `sanitizeAndRepair.ts` в `prompts.ts`). Текст попадает в payload `create_recipe_with_steps` и в `message` (JSON) и `recipes[0].description`; **UPDATE description после insert на Edge не делается**. Диагностика: **CHAT_DESCRIPTION_DEBUG=true** (`request_id`, `raw_llm_description`, `llm_description_accepted`, `rejection_reason`, `final_description_source` — `llm_raw` \| `llm_repair` \| `emergency_fallback`, `final_description`), плюс логи **`DESCRIPTION_PIPELINE_RAW_ACCEPTED`**, **`DESCRIPTION_PIPELINE_REPAIR_ATTEMPT`**, **`DESCRIPTION_PIPELINE_REPAIR_ACCEPTED`**, **`DESCRIPTION_PIPELINE_FALLBACK_USED`**; **CHEF_ADVICE_DEBUG=true** (`request_id`, `raw_chef_advice`, `normalized_chef_advice`, `accepted`, `rejection_reason`, `final_chef_advice`, `retry_skipped_due_to_advice_failure`). Ранний лог `passesChefAdviceQualityGate` / `passesDescriptionQualityGate` на «сыром» JSON — только метрики; финальное описание определяется после санитайзеров и пайплайна выше.
- **На клиенте:** перед показом рецепта вызывается `validateRecipe` из `src/domain/generation/validateRecipe.ts`: проверка по аллергиям, dislikes и вегетарианским предпочтениям по всем профилям из контекста. **Аллергии:** `buildBlockedTokens` + **`containsAnyTokenForAllergy`** по тексту **title, description, имена и display_text ингредиентов** (в унисон с Edge post-check и планом; для яйца по-прежнему нет голого токена «белок» в словаре). **Dislikes:** по **title и именам ингредиентов** + **`containsAnyToken`** (граница слова), без description — меньше ложных срабатываний. Если валидация не прошла, рецепт может показываться с тостом «Не сохранён в список: не совпадает с аллергиями или предпочтениями» (если рецепт пришёл с API). В dev при отклонении в консоль выводится причина (`[validateRecipe] Recipe rejected: …`). **Карточка чата (`ChatRecipeCard`):** в заголовок передаётся **`recipe.description`** из ответа API, если строка непустая (тот же канон, что ушёл в БД); иначе — локальный **`buildRecipeBenefitDescription`** (например пустое описание у fallback-рецепта).

---

## 8. Тип приёма пищи (mealType), супы и время готовки

- **mealType:** на Edge определяется из запроса пользователя, если в нём явно указано блюдо: `isExplicitDishRequest` + `inferMealTypeFromQuery` (_shared/mealType/inferMealType.ts). Паттерны: завтрак (каша, омлет, сырники, блинчики, тосты и т.д.), обед (суп, борщ, щи и т.д.), ужин (котлеты, рагу, плов, гарнир и т.д.), перекус (смузи, йогурт, творожок, печенье и т.д.). Иначе может использоваться переданный с клиента `mealType` (например, из `detectMealType` в ChatPage). В шаблон подставляются `{{mealType}}` и `{{maxCookingTime}}`; при необходимости — `servings` (по умолчанию 1).
- **Правило супов (MEAL_SOUP_RULES в prompts.ts):** супы (суп, борщ, щи, солянка, рассольник, окрошка, гаспачо и аналоги) — только для приёма «обед» (mealType: lunch). Для ужина (dinner), завтрака (breakfast) и перекуса (snack) супы не предлагать. Для запроса на обед — только супы и их аналоги. Блок MEAL_SOUP_RULES подставляется в system prompt при генерации рецепта (buildPrompt.ts → generateRecipeSystemPromptV3). Слоты mealType для JSON-рецепта задаются **MEAL_SOUP_RULES** и **RECIPE_SYSTEM_RULES_V3**; константа **RULES_USER_INTENT** относится к шаблонам Free/Premium для non-recipe и **не** входит в `generateRecipeSystemPromptV3`.
- **maxCookingTime и servings:** передаются в теле запроса с клиента (если есть) и подставляются в промпт; на Edge по умолчанию servings = 1.

---

## 9. Anti-duplicate и сохранение рецепта

- **Не повторять недавние рецепты:** Edge запрашивает за последние 14 дней `recipe_id` из `chat_history` по user_id и (в режиме «Семья») по storageMemberId, затем названия рецептов из `recipes`, нормализует их в `titleKey` и формирует строку «Не повторять: …» в промпт (`recentTitleKeysLine`). Список ключей упорядочен по времени сообщений в чате (не порядку ответа SQL `.in()`). Тот же упорядоченный список используется для **анти-доминирования likes** (см. §6). На клиенте при повторной попытке (если рецепт совпал с последним сохранённым по title) может добавляться `extraSystemSuffix` с просьбой сгенерировать другой рецепт.
- **Сохранение в БД:** при успешном ответе и авторизации Edge вызывает RPC `create_recipe_with_steps` с payload через `canonicalizeRecipePayload` (_shared/recipeCanonical.ts): перед RPC для каждого ингредиента вызывается **`enrichIngredientMeasurementForSave`** (`shared/ingredientMeasurementDisplay.ts`) — заполнение `measurement_mode` / `display_*` и `display_text` по канону: **dual** только если кандидат бытовой меры проходит `ingredientMeasurementEngine` + quality gate (`ingredientMeasurementQuality`); иначе **`canonical_only`** (см. `docs/dev/RECIPE_INGREDIENT_DUAL_MEASUREMENT.md`). **description** = результат **`resolveChatRecipeCanonicalDescription`** (`llm_raw` / `llm_repair` / `emergency_fallback`), совпадает с текстом в ответе чата. Отдельный `UPDATE recipes.description` benefit-builder после insert **не выполняется**. Теги `chat`, `chat_<mealType>`, в режиме «Семья» — `family` и при kid-safety — `kid_1_3_safe`; `min_age_months` / `max_age_months` из `AGE_RANGE_BY_CATEGORY`. `inferNutritionGoals` → `recipes.nutrition_goals`. Для записи в режиме «Семья» — `member_id` от `resolveFamilyStorageMemberId`, иначе выбранный member_id. **Клиент:** при резервном сохранении через `createRecipe` с **`source: 'chat_ai'`** описание из рецепта не перезаписывается `buildRecipeBenefitDescription` (`useRecipes.tsx`).

---

## 10. Модули _shared, используемые в deepseek-chat

| Модуль | Назначение |
|--------|------------|
| `safeLogger.ts` | Логирование (safeLog, safeError, safeWarn). |
| `recipeCanonical.ts` | Канонический payload для RPC `create_recipe_with_steps`: resolveMealType, buildCanonicalTags, canonicalizeRecipePayload + enrich ингредиентов (dual display). |
| `blockedTokens.ts` | buildBlockedTokenSet(allergies, dislikes), textWithoutExclusionPhrases, findMatchedTokens (юнит-тесты/граница слова). Блокировка в `checkRequestBlocked` — `containsAnyTokenForAllergy`. |
| `mealType/inferMealType.ts` | isExplicitDishRequest, inferMealTypeFromQuery — определение типа приёма пищи из текста. |
| `parsing/index.ts` | validateRecipe (извлечение JSON, нормализация кавычек, валидация), retryFixJson. |
| `recipeCopy.ts` | buildRecipeDescription, buildChefAdvice, shouldReplaceDescription, shouldReplaceChefAdvice — универсальные описания и советы. |
| `familyMode.ts` | getFamilyPromptMembers (исключение младенцев <12 мес, флаг applyKidFilter), buildFamilyMemberDataForChat (объединённые аллергии/dislikes/likes, возраст «взрослый»). |
| `familyStorageResolver.ts` | resolveFamilyStorageMemberId — member_id для записи в режиме «Семья» (из БД, старший ≥ 12 мес). |
| `memberConstraints.ts` | getFamilyContextPromptLine, getFamilyContextPromptLineEmpty — строки для шаблона «общий стол». |
| `likesFavoring.ts` | shouldFavorLikes (≈20% запросов), buildLikesLine / buildLikesLineForProfile — мягкий текст для non-recipe path. |
| `chatLikesSignal.ts` | detectRepeatedLikesInRecentTitles, likeMatchesTitleKey, buildRecipeSoftLikesPromptBlock, buildLikesAntiRepeatPromptLine — recipe-path likes + анти-повтор по недавним title. |
| `familyContextBlock.ts` | buildFamilyGenerationContextBlock — server-truth блок контекста для режима «Семья» (без младенцев, без «Children:»/«safe for ALL»). |
| `logging.ts` | serializeError для логов. |
| `allergens.ts` | getBlockedTokensFromAllergies (через allergyAliases) — токены для блокировки по аллергиям; используется в blockedTokens. |

Другие Edge Functions используют _shared так:

- **generate-plan:** safeLogger, allergens (getBlockedTokensFromAllergies), memberAgeContext, familyMode, familyStorageMember, mealJson, plan/familyDinnerFilter.
- **payment-webhook, create-payment:** в основном safeLogger.

---

## 11. Внешние функции и модули (клиент)

- **useDeepSeekAPI** (`src/hooks/useDeepSeekAPI.tsx`): собирает контекст (buildGenerationContext, derivePayloadFromContext, buildPrompt), проверяет блокировку (checkChatRequestAgainstProfile). Перед запросом получает токен через **getValidAccessToken()**: сначала `refreshSession()` (чтобы не отправлять истёкший access_token — `getSession()` отдаёт кэш из памяти/локального хранилища без проверки срока действия), затем fallback на `getSession()`. Отправляет POST в `/functions/v1/deepseek-chat` с заголовком `Authorization: Bearer <token>`, messages, memberData, type и т.д., обрабатывает ответ (JSON с message/recipes/recipe_id или blocked, при отсутствии авторизации на Edge — auth_required_to_save).
- **useChatRecipes** (`src/hooks/useChatRecipes.tsx`): getTodayChatRecipes (рецепты с тегом chat за 48 ч), saveRecipesFromChat — парсит ответ через parseRecipesFromChat или использует переданный parsedResult, фильтрует невалидные названия, создаёт рецепты через createRecipe (useRecipes) с тегами, шагами и ингредиентами.
- **buildGenerationContext** (`src/domain/generation/buildGenerationContext.ts`): по activeProfileId и плану (free/trial/premium) возвращает single (один target) или family (targets); Free при выборе «Семья» получает single с первым профилем.
- **derivePayloadFromContext** (`src/domain/generation/derivePayloadFromContext.ts`): из GenerationContext формирует memberData (name, ageMonths, allergies, likes, dislikes, difficulty), allMembers, targetIsFamily; для семьи объединяет аллергии/dislikes/likes и исключает младенцев <12 мес из целевых профилей.
- **buildPrompt** (`src/domain/generation/buildPrompt.ts`): по context и membersWithAgeMonths строит текстовый блок «Child:» или «Children:» + блоки по каждому ребёнку (age, allergies, likes, dislikes, difficulty).
- **parseRecipesFromChat** / **parseRecipesFromApiResponse** (`src/utils/parseChatRecipes.ts`): извлечение JSON рецепта из ответа (code block, regex, баланс скобок), нормализация ингредиентов и шагов, определение mealType по тексту, формирование ParseRecipesFromChatResult (recipes, displayText). В ParsedRecipe попадают **КБЖУ** с верхнего уровня или из `nutrition` (числа и строковые числа из JSON); поле **`nutrition_goals`** из ответа API/`recipes[]` (или из JSON). Текст `displayText` дополняется строками ккал/БЖУ, если они есть.
- **validateRecipe** (`src/domain/generation/validateRecipe.ts`): проверка рецепта по аллергиям, dislikes и вегетарианским предпочтениям (VEGETARIAN_BANNED и т.д.) для всех профилей из контекста.
- **chatBlockedCheck** (`src/utils/chatBlockedCheck.ts`): проверка текста запроса на токены аллергий и dislikes с учётом фраз «без X»; возврат ChatBlockedResponse при совпадении.
- **allergenTokens** (`src/utils/allergenTokens`): buildBlockedTokens, containsAnyToken, getBlockedTokensPerAllergy — в унисон с Edge (алиасы и словарь аллергенов).

---

## 12. Сводка по данным в запросе и ответе

**Запрос (клиент → deepseek-chat):**

- `messages`, `type` (chat | recipe | sos_consultant | balance_check)
- `memberData` (name, ageMonths, **type** (child \| adult \| family), allergies, likes, dislikes, difficulty)
- `targetIsFamily`, `memberId`, `allMembers` (в режиме «Семья»)
- `generationContextBlock` (на Edge в режиме «Семья» подменяется)
- `mealType`, `maxCookingTime`, при необходимости `extraSystemSuffix`

**Ответ (успешный рецепт):**

- `message` — строка с JSON рецепта (или текст)
- `recipes` — массив из одного рецепта (объект с title, description, ingredients, steps, cookingTimeMinutes, mealType, servings, chefAdvice, nutrition, **nutrition_goals** (после Edge — rule-based infer) и т.д.). Поле **description** совпадает с тем, что пишется в **`recipes.description`** при сохранении с Edge (**resolveChatRecipeCanonicalDescription**: `llm_raw` / `llm_repair` / `emergency_fallback`).
- `recipe_id` — id сохранённого рецепта в БД (если пользователь авторизован и сохранение прошло)

**Ответ (блокировка):**

- `blocked: true`, `blocked_by`: "allergy" | "dislike", `message`, `blocked_items`, `suggested_alternatives`, `original_query`, `intended_dish_hint`

---

Этот файл можно использовать как единую точку входа для понимания и доработки логики генерации рецептов в чате.
