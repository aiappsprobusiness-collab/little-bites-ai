# Генерация рецептов во вкладке «Чат» — полное описание

Документ описывает, как работает функция генерации рецептов в чате: поток данных, фильтры, возрастные группы, аллергии, «любит/не любит», используемые модули и вебхуки (Edge Functions и _shared).

---

## Карта системы (1 экран)

Четыре доменных модуля (Edge, `supabase/functions/deepseek-chat/`):
- **domain/policies** — аллергии, dislikes, «без X», токены, границы слов; формирование ответа «заблокировано».
- **domain/family** — семейный режим: исключение <12 мес, kid-safety 12–35 мес, server-truth контекст, лайки, storage member.
- **domain/recipe_io** — парсинг/валидация/retry JSON рецепта, описание/совет шефа, ремонт и санитизация.
- **domain/meal** — определение типа приёма пищи из запроса, дефолты (servings, maxCookingTime).

Оркестратор **index.ts**: вход → policy-block → сборка промпта → вызов модели → parse/repair → сохранение → ответ.

---

## Где править что

- **Блокировка по аллергии/dislike, «без X», альтернативы** — `deepseek-chat/domain/policies/`; токены/алиасы — `_shared/blockedTokens.ts`, `_shared/allergyAliases.ts`.
- **Семейный режим, <12 мес, kid-safety 12–35 мес, server-truth блок** — `deepseek-chat/domain/family/` (re-export из `_shared/familyMode.ts`, `_shared/familyContextBlock.ts`).
- **Текст промптов, возраст, шаблоны Free/Premium** — `deepseek-chat/prompts.ts`, `deepseek-chat/ageCategory.ts`, `deepseek-chat/buildPrompt.ts`.
- **Парсинг/валидация/retry рецепта, описание/совет, санитизация** — `deepseek-chat/domain/recipe_io/`, `_shared/parsing/`, `_shared/recipeCopy.ts`; схема — `deepseek-chat/recipeSchema.ts`.
- **Тип приёма пищи из запроса** — `deepseek-chat/domain/meal/` (re-export `_shared/mealType/inferMealType.ts`).
- **Оркестрация, лимиты, сохранение в БД** — `deepseek-chat/index.ts`.

---

## Контракты ответа (blocked vs ok)

| Тип | HTTP | Ключевые поля | Когда |
|-----|------|----------------|-------|
| blocked | 200 | `blocked: true`, `blocked_by`, `message`, `blocked_items`, `suggested_alternatives`, `original_query` | Запрос содержит аллерген/dislike (кроме «без X»). Модель не вызывается. |
| ok (рецепт) | 200 | `message`, `recipes`, `recipe_id?` | Успешная генерация. |
| ok (без рецепта) | 200 | `message`, `recipes: []` | Заглушка, SOS, анализ тарелки. |
| ошибка | 200/429/500 | `error`, `message` | Лимит, таймаут, API/сервер. |

Примеры: **blocked** — `{"blocked":true,"blocked_by":"allergy","profile_name":"Ребёнок","blocked_items":["орехи"],"suggested_alternatives":[...],"message":"У профиля..."}`. **ok** — `{"message":"{...}","recipes":[{...}],"recipe_id":"uuid"}`. **Лимит** — `{"error":"LIMIT_REACHED","message":"Лимит на сегодня исчерпан.","payload":{"feature":"chat_recipe","limit":2,"used":2}}`.

**Запуск контрактных тестов (Edge):** нужен [Deno](https://deno.com/). Установка на Windows: `winget install Deno.Deno` или с [deno.land](https://deno.land/#installation). Затем из корня репозитория: `npm run test:edge` или из `supabase/functions`: `deno test deepseek-chat/domain/policies/policies.test.ts deepseek-chat/domain/family/family.test.ts deepseek-chat/domain/recipe_io/recipe_io.test.ts --allow-read`.

---

## 1. Общий поток

1. **Пользователь** вводит сообщение на вкладке «Чат» (режим рецептов, `mode === "recipes"`).
2. **Клиент** (`ChatPage` → `useDeepSeekAPI`) собирает контекст: выбранный профиль или «Семья», члены семьи, строит `GenerationContext` и payload для API.
3. **Проверка на блокировку** (аллергия/dislike в запросе) выполняется дважды: на клиенте (`checkChatRequestAgainstProfile`) и на Edge (`buildBlockedTokenSet` + `findMatchedTokens`). При совпадении запрос не отправляется в модель, возвращается сообщение с подсказками.
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
- **Клиент:** `src/utils/chatBlockedCheck.ts` — `checkChatRequestAgainstProfile`. Использует `buildBlockedTokens` / `containsAnyToken` из `@/utils/allergenTokens` (в унисон с Edge по токенам/алиасам).
- **Edge:** `supabase/functions/deepseek-chat/index.ts`: собираются списки аллергий и dislikes (для семьи — объединение по всем членам), строится `buildBlockedTokenSet` (_shared/blockedTokens), из текста запроса удаляются фразы «без X» через `textWithoutExclusionPhrases`, затем проверка `findMatchedTokens`. При совпадении по аллергии или dislike возвращается JSON с `blocked: true`, `blocked_by`, `message`, `suggested_alternatives`, `intended_dish_hint` и т.д., без вызова модели и без записи в `usage_events`.

Токены для аллергий строятся через `_shared/allergens.ts` → `getBlockedTokensFromAllergies` → `_shared/allergyAliases.ts` (`buildBlockedTokensFromAllergies`) с алиасами (БКМ, глютен, яйца, рыба, орехи и т.д.). Для dislikes используется тот же механизм (один элемент = один «аллерген» для набора токенов). В `blockedTokens` проверка идёт по границам слов (например, «орех» не матчится в «запеканка»).

### 3.2 Релевантность запроса (Free vs Premium)

- **Free:** если запрос не релевантен питанию (`isRelevantQuery` из `isRelevantQuery.ts`), Edge сразу возвращает заглушку без вызова модели.
- **Premium:** используется `isRelevantPremiumQuery`. При `false` — заглушка; при `soft` — рецепт всё равно генерируется (общие запросы вроде «что приготовить» тоже получают рецепт).

### 3.3 Лимиты

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
- **Free:** в промпт передаётся не более одной аллергии (`useAllAllergies: false` в `promptByTariff`).
- **Токены и алиасы:** Edge использует `_shared/allergyAliases.ts` и `_shared/allergens.ts` (через `allergensDictionary.ts`). Алиасы покрывают БКМ, глютен, яйца, рыбу, орехи, арахис, сою, кунжут, мёд и др.; по каждому аллергену заданы токены для поиска в тексте (в т.ч. «молок», «йогурт», «глютен», «пшениц» и т.д.). Клиент для блокировки запроса использует тот же источник истины в `src/utils/allergenTokens` (и при необходимости словарь в `src/shared/allergensDictionary.ts`; см. `scripts/sync-allergens-dict.mjs` для синхронизации с Edge).
- **БКМ (аллергия на белок коровьего молока):** в промпт при генерации рецепта всегда добавляется блок **CMPA_SAFETY_RULE** (`prompts.ts`): при аллергии на БКМ запрещено предлагать безлактозные молочные продукты и козье молоко/козий творог (аллерген — белок, не лактоза; у большинства детей с БКМ перекрёстная реакция на козье молоко). Разрешены только полностью немолочные замены (тофу, бобовые, ореховые/соевые напитки и т.д.). Токены для БКМ дополнительно включают «коз», «козий», «козье», «безлактоз», «безлактозный», «goat», «lactose-free», чтобы рецепты с такими ингредиентами не сохранялись и при необходимости блокировались в запросе.

---

## 6. «Любит» (likes) и «Не любит» (dislikes)

- **Dislikes:** трактуются как жёсткое ограничение: в рецепте не должно быть этих продуктов. Участвуют в блокировке запроса (если в тексте запроса есть продукт из dislikes — ответ «заблокировано», с подсказками). В промпте передаются как «Dislikes (STRICT)».
- **Likes:** мягкое предпочтение. В режиме «Семья» в части запросов (~20%, детерминированно по requestId + userId + дата) в промпт добавляется строка «ПРИОРИТЕТ ЛАЙКОВ СЕМЬИ» через `shouldFavorLikes` и `buildLikesLine` (_shared/likesFavoring.ts). Один профиль — likes тоже могут попадать в контекст как предпочтения (через `preferences`/likes в шаблоне).

Предпочтения (preferences), включая «вегетарианское», «без молочного» и т.п., подставляются в шаблон и интерпретируются в `STRICT_RULES` (prompts.ts): семантически как запреты (не использовать мясо/рыбу, молочное и т.д.).

---

## 7. Валидация рецепта после генерации

- **На Edge:** ответ модели парсится через `validateRecipe` (_shared/parsing) с колбэком `parseAndValidateRecipeJsonFromString` (схема в `recipeSchema.ts`). При ошибке — попытка починить JSON через `retryFixJson`; при неудаче — fallback-рецепт `getRecipeOrFallback`. Проверяются наличие title, ingredients, steps, описание не обрывается и т.д. Для описания и совета шефа при необходимости вызываются `buildRecipeDescription` / `buildChefAdvice` (_shared/recipeCopy.ts), а также точечный `repairDescriptionOnly` при обрыве описания.
- **На клиенте:** перед показом рецепта вызывается `validateRecipe` из `src/domain/generation/validateRecipe.ts`: проверка по аллергиям, dislikes и вегетарианским предпочтениям по всем профилям из контекста (по тексту рецепта и `buildBlockedTokens` / `containsAnyToken` из `@/utils/allergenTokens`). Если валидация не прошла, рецепт может показываться с тостом «Не сохранён в список: не совпадает с аллергиями или предпочтениями» (если рецепт пришёл с API).

---

## 8. Тип приёма пищи (mealType), супы и время готовки

- **mealType:** на Edge определяется из запроса пользователя, если в нём явно указано блюдо: `isExplicitDishRequest` + `inferMealTypeFromQuery` (_shared/mealType/inferMealType.ts). Паттерны: завтрак (каша, омлет, сырники, блинчики, тосты и т.д.), обед (суп, борщ, щи и т.д.), ужин (котлеты, рагу, плов, гарнир и т.д.), перекус (смузи, йогурт, творожок, печенье и т.д.). Иначе может использоваться переданный с клиента `mealType` (например, из `detectMealType` в ChatPage). В шаблон подставляются `{{mealType}}` и `{{maxCookingTime}}`; при необходимости — `servings` (по умолчанию 1).
- **Правило супов (MEAL_SOUP_RULES в prompts.ts):** супы (суп, борщ, щи, солянка, рассольник, окрошка, гаспачо и аналоги) — только для приёма «обед» (mealType: lunch). Для ужина (dinner), завтрака (breakfast) и перекуса (snack) супы не предлагать. Для запроса на обед — только супы и их аналоги. Блок MEAL_SOUP_RULES подставляется в system prompt при генерации рецепта (buildPrompt.ts → generateRecipeSystemPromptV3). RULES_USER_INTENT требует соответствия mealType правилам слотов (супы только lunch).
- **maxCookingTime и servings:** передаются в теле запроса с клиента (если есть) и подставляются в промпт; на Edge по умолчанию servings = 1.

---

## 9. Anti-duplicate и сохранение рецепта

- **Не повторять недавние рецепты:** Edge запрашивает за последние 14 дней `recipe_id` из `chat_history` по user_id и (в режиме «Семья») по storageMemberId, затем названия рецептов из `recipes`, нормализует их в `titleKey` и формирует строку «Не повторять: …» в промпт (`recentTitleKeysLine`). На клиенте при повторной попытке (если рецепт совпал с последним сохранённым по title) может добавляться `extraSystemSuffix` с просьбой сгенерировать другой рецепт.
- **Сохранение в БД:** при успешном ответе и авторизации Edge вызывает RPC `create_recipe_with_steps` с payload, собранным через `canonicalizeRecipePayload` (_shared/recipeCanonical.ts): теги `chat`, `chat_<mealType>`, в режиме «Семья» — `family` и при kid-safety — `kid_1_3_safe`; `min_age_months` / `max_age_months` из `AGE_RANGE_BY_CATEGORY`. Для записи в `recipes`, `usage_events`, `chat_history` в режиме «Семья» используется `member_id` от `resolveFamilyStorageMemberId` (старший член ≥ 12 мес из таблицы `members`), иначе — выбранный member_id.

---

## 10. Модули _shared, используемые в deepseek-chat

| Модуль | Назначение |
|--------|------------|
| `safeLogger.ts` | Логирование (safeLog, safeError, safeWarn). |
| `recipeCanonical.ts` | Канонический payload для RPC `create_recipe_with_steps`: resolveMealType, buildCanonicalTags, canonicalizeRecipePayload. |
| `blockedTokens.ts` | buildBlockedTokenSet(allergies, dislikes), textWithoutExclusionPhrases, findMatchedTokens — блокировка запроса по аллергиям/dislikes. |
| `mealType/inferMealType.ts` | isExplicitDishRequest, inferMealTypeFromQuery — определение типа приёма пищи из текста. |
| `parsing/index.ts` | validateRecipe (извлечение JSON, нормализация кавычек, валидация), retryFixJson. |
| `recipeCopy.ts` | buildRecipeDescription, buildChefAdvice, shouldReplaceDescription, shouldReplaceChefAdvice — универсальные описания и советы. |
| `familyMode.ts` | getFamilyPromptMembers (исключение младенцев <12 мес, флаг applyKidFilter), buildFamilyMemberDataForChat (объединённые аллергии/dislikes/likes, возраст «взрослый»). |
| `familyStorageResolver.ts` | resolveFamilyStorageMemberId — member_id для записи в режиме «Семья» (из БД, старший ≥ 12 мес). |
| `memberConstraints.ts` | getFamilyContextPromptLine, getFamilyContextPromptLineEmpty — строки для шаблона «общий стол». |
| `likesFavoring.ts` | shouldFavorLikes (≈20% запросов), buildLikesLine — приоритет лайков в промпте. |
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
- **parseRecipesFromChat** / **parseRecipesFromApiResponse** (`src/utils/parseChatRecipes.ts`): извлечение JSON рецепта из ответа (code block, regex, баланс скобок), нормализация ингредиентов и шагов, определение mealType по тексту, формирование ParseRecipesFromChatResult (recipes, displayText).
- **validateRecipe** (`src/domain/generation/validateRecipe.ts`): проверка рецепта по аллергиям, dislikes и вегетарианским предпочтениям (VEGETARIAN_BANNED и т.д.) для всех профилей из контекста.
- **chatBlockedCheck** (`src/utils/chatBlockedCheck.ts`): проверка текста запроса на токены аллергий и dislikes с учётом фраз «без X»; возврат ChatBlockedResponse при совпадении.
- **allergenTokens** (`src/utils/allergenTokens`): buildBlockedTokens, containsAnyToken, getBlockedTokensPerAllergy — в унисон с Edge (алиасы и словарь аллергенов).

---

## 12. Сводка по данным в запросе и ответе

**Запрос (клиент → deepseek-chat):**

- `messages`, `type` (chat | recipe | sos_consultant | balance_check)
- `memberData` (name, ageMonths, allergies, likes, dislikes, difficulty)
- `targetIsFamily`, `memberId`, `allMembers` (в режиме «Семья»)
- `generationContextBlock` (на Edge в режиме «Семья» подменяется)
- `mealType`, `maxCookingTime`, при необходимости `extraSystemSuffix`

**Ответ (успешный рецепт):**

- `message` — строка с JSON рецепта (или текст)
- `recipes` — массив из одного рецепта (объект с title, description, ingredients, steps, cookingTimeMinutes, mealType, servings, chefAdvice, nutrition и т.д.)
- `recipe_id` — id сохранённого рецепта в БД (если пользователь авторизован и сохранение прошло)

**Ответ (блокировка):**

- `blocked: true`, `blocked_by`: "allergy" | "dislike", `message`, `blocked_items`, `suggested_alternatives`, `original_query`, `intended_dish_hint`

---

Этот файл можно использовать как единую точку входа для понимания и доработки логики генерации рецептов в чате.
