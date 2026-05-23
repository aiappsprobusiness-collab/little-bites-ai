# Аллергии и план: источник истины и фильтрация

Документ описывает, откуда берётся активный профиль/аллергии при генерации плана и в чате, как выполняется фильтрация кандидатов и проверка на аллергены.

## 1. Активный профиль / memberId при генерации плана

- **Где берётся:** в Edge Function `generate-plan` из тела запроса: `body.member_id`, `body.member_data`.
- **Кто передаёт:** клиент (MealPlanPage → usePlanGenerationJob / runPoolUpgrade). При вызове `invokeGeneratePlan` в body всегда передаются `member_id` и `member_data` (аллергии, предпочтения, age_months) из выбранного на экране плана профиля.
- **Режим «Семья»:** при выборе «Семья» на клиенте передаётся один `member_id` (например null или специальное значение в зависимости от реализации) и один `member_data`. Объединение аллергий всех членов семьи для плана должно делаться на клиенте перед вызовом (передать в `member_data.allergies` объединённый массив).

## 2. Формирование списка аллергенов по режиму

- **Free / один профиль:** только выбранный профиль → `member_data.allergies` (один массив).
- **Premium/Trial + режим «Семья»:** в чате (deepseek-chat) аллергии собираются из `allMembers`: в `applyPromptTemplate` при `targetIsFamily && allMembers.length > 0` в `allergiesSet` добавляются аллергии всех `allMembers`. Для плана (generate-plan) объединённые аллергии семьи должны приходить в `member_data.allergies`, если клиент при выборе «Семья» формирует такой объединённый `member_data`.

## 3. Где выполняется фильтрация кандидатов пула

- **Edge (generate-plan):**
  - `fetchPoolCandidates(supabase, userId, memberId, limit)` — только выборка рецептов из БД (source in seed/starter/manual/week_ai/chat_ai), без фильтра по аллергиям.
  - `pickFromPool(...)` — все фильтры: exclude ids/titleKeys, mainIngredient, mealType, breakfast no-soup, lunch soup-only, sanity, **profile (аллергии, предпочтения, возраст)**, goals-hints. Аллергии — **`planRecipeMatchesProfileAllergyTokens`** только по **`recipe_ingredients[].name`** (не по title/description/display_text/category).
- **Клиент:** `src/utils/recipePool.ts` — `pickRecipeFromPool` и `passesProfileFilter` при подборе из пула используют **те же** токены аллергенов, что и Edge: `buildBlockedTokensFromAllergies` / `allergyAliases.ts`, матч аллергий — **`planRecipeMatchesProfileAllergyTokens`** только по **`recipe_ingredients[].name`** (как post-check чата). Dislikes — по-прежнему подстрока по title+description+ингредиентам.

**Мясо (umbrella):** аллергия **«мясо»** / `meat` задаётся в `ALLERGY_ALIASES` и разворачивается в объединение токенов из `src/shared/meatAllergyTokens.ts` (копия в Edge через `npm run sync:allergens`): птица (курица, индейка), КРС (говядина/телятина), свинина, фарш/mince/ground *, лексемы «мясо»/склонения/`meat`, плюс распространённые виды (баранина, утка, гусь, кролик и т.д.). **Рыба и морепродукты в эту группу не входят** — остаются отдельными каноническими аллергиями («рыба», «морепродукты»). Узкие записи **«говядина»**, **«курица»**, **«индейка»**, **«свинина»**, **«фарш»** дают только свои подмножества токенов (говядина и телятина сознательно делят один набор стемов `говяд`/`телят`/`beef`/`veal`).

## 4. Как рецепт проверяется на аллерген

- **Поля (аллергии):** только **`recipe_ingredients[].name`** (Edge generate-plan, клиентский пул, vk-preview через `passesPreferenceFilters`). **Не используются** для аллергий: title, description, display_text, tags, **`recipe_ingredients.category`**. Dislikes — отдельный контракт (§3 в [PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md](../architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md)): title, description, recipe_ingredients (name, display_text), категории ингредиентов.
- **Метод (аллергии):** набор «запрещённых токенов» (blockedTokens) строится из аллергий профиля через `buildBlockedTokensFromAllergies` / `expandAllergyToTokens` (`allergyAliases.ts` + fallback `allergensDictionary.ts`). Матч — **`allergyTokenMatchesInChatIngredientText`** / **`planRecipeMatchesProfileAllergyTokens`** / **`listAllergyTokenHitsInPlanIngredientNames`** в `src/shared/recipeAllergyMatch.ts` (синхронизируется в `_shared/recipeAllergyMatch.ts`): prefix/suffix по **словам** имени ингредиента, без вложенных подстрок (нет ложных «рож» в «творожный», «пекан» в «запеканка»). В generate-plan / `preferenceRules.ts` для аллергий — этот helper; для dislikes — **`recipeMatchesAllergyTokens`** (подстрока по title+description+ингредиентам). В **`allergensDictionary.containsAnyToken`** (граница слова) для плана не опираемся — там другой контракт; `isRecipeAllowedByAllergens` в `_shared/allergens.ts` остаётся для прочих вызовов.
- **Исключение «птица + яйцо» (umbrella «мясо» и узкие птицы):** токены вроде `курин` / `chicken` матчатся подстрокой и иначе давали бы ложное срабатывание на формулировках **«куриные яйца»**, **«яйцо куриное»** (яйца курицы не входят в каноническую аллергию «мясо»). Перед проверкой этих токенов из текста вырезаются коллокации «прилагательное птицы + яйц*» и обратный порядок (RU + EN: chicken/duck/turkey/goose + egg). Реализация: `stripPoultryEggCollocationsForMeatCheck` / `poultryAdjTokenNeedsEggColocationStrip` в `recipeAllergyMatch.ts`, тот же шаг в `containsAnyTokenForAllergy` (`allergensDictionary.ts`).
- **Синхронизация Edge:** `npm run sync:allergens` копирует `allergensDictionary.ts`, `meatAllergyTokens.ts`, `recipeAllergyMatch.ts`, **`chatRecipeAllergySafety.ts`** из `src/shared/` в `supabase/functions/_shared/`. Словарь `ALLERGY_ALIASES` по-прежнему дублируется в `src/utils/allergyAliases.ts` и `supabase/functions/_shared/allergyAliases.ts` — при правках алиасов/токенов править **оба** файла (или один коммит на пару).

### 4.1 Аллергия на яйца и слово «белок»

- В словаре `ALLERGY_ALIASES` для канонического **«яйца»** **нет** отдельного токена **«белок»**: иначе ложные срабатывания на нейтральные фразы в описаниях («даёт белок», «источник белка»).
- Для яйца остаются токены вроде **яйц**, **яичн**, **желтк**, **egg** / **eggs** и **явные подстроки**: **белок яйц…**, **яичный белок**, **egg white**.
- Клиентский `allergensDictionary` (fallback по категории eggs) синхронизирован с этой политикой.

## 4.2 Расхождение «Premium в приложении» и тариф на Edge (чат)

В **deepseek-chat** признак Premium для промпта и лимитов берётся из **`profiles_v2.status`**, а не из **`premium_until`**. В **useSubscription** доступ Premium определяется в том числе по **дате `premium_until`**. Если в БД `status` ещё `free`, а оплаченный период уже открыт по дате, пользователь видит Premium, а Edge обрабатывает запрос как Free — в т.ч. **обрезка списка аллергий до одной** (`promptByTariff` + `index.ts`). Подробнее: `docs/architecture/chat_recipe_generation.md` §5, тесты `src/utils/subscriptionChatEdgeParity.test.ts`.

## 5. Чат: двухэтапный allergy guard и канонический отказ

### 5.1 Pre-request (до LLM)

- **Клиент:** `useDeepSeekAPI` → `checkChatRequestAgainstProfile` (`chatBlockedCheck.ts`): аллергии + dislikes, фразы «без X» вырезаются через `textWithoutExclusionPhrases`. Токены — `buildBlockedTokensFromAllergies` / `expandAllergyToTokens` (`allergyAliases.ts`), матч — **`containsAnyTokenForAllergyInWords`** (`recipeAllergyMatch.ts`): по **словам** запроса (prefix/suffix, без вложенных подстрок вроде «пекан» в «запеканка»). Многословные токены («белок яйц») — подстрока по всей строке.
- **Edge:** `deepseek-chat/index.ts` → `checkRecipeRequestBlocked` (тот же `containsAnyTokenForAllergyInWords`). **Списки аллергий/dislikes для политики берутся из полного профиля:** для «Семья» — объединение по **`allMembers` из БД**, для одного профиля — `memberDataNorm`, **не** усечённые до одной аллергии варианты для промпта по тарифу.

### 5.2 Post-recipe (после JSON рецепта от модели)

- **Где:** `deepseek-chat/index.ts`, сразу после успешной валидации/сборки `responseRecipes`, **до** `usage_events` «chat_recipe».
- **Не выполняется** при `from_plan_replace` (кандидат уже прошёл фильтр плана).
- **Логика (единый контракт с post-check чата):** только **`recipe_ingredients[].name`** — без title, description, display_text. Матч: **`findFirstAllergyConflictInChatRecipeIngredients`** / `listAllergyTokenHitsInChatIngredientNames` / **`allergyTokenMatchesInChatIngredientText`** (prefix/suffix по словам ингредиента). План использует те же helpers: **`planRecipeMatchesProfileAllergyTokens`** / `listAllergyTokenHitsInPlanIngredientNames` в `preferenceRules.ts` и `recipePool.ts`.
- **При конфликте:** один **retry LLM** (`retryRecipeAllergyFix`) — заменить аллергенные ингредиенты; повторная проверка. **Hard block снят:** если конфликт остаётся — рецепт **всё равно отдаётся**, в ответе опционально `allergy_ingredient_warning`, лог **`CHAT_RECIPE_ALLERGY_SAFETY_WARNING`** (не `…REJECTION`). Pre-block (`blocked: true`) — только когда пользователь **явно** просит аллерген в запросе (§5.1).

### 5.3 Канонический текст отказа (аллергия)

- **Клиент и Edge:** `buildBlockedMessage` / `buildBlockedMessageEdge` — мягкая формулировка («в анкете указана аллергия», объяснение что блюда с ингредиентом в чате не подбираются, при необходимости эмодзи 🤍); для dislike — «отмечено „не любит“», без угрожающего тона. Тексты синхронизированы между клиентом и Edge.

### 5.4 Клиентский `validateRecipe` (после ответа)

- Для **аллергий** — тот же контракт, что post-check Edge: **`findFirstAllergyConflictInChatRecipeIngredients`** только по **`ingredients[].name`**. Dislikes по-прежнему без description (меньше ложных срабатываний).

### 5.5 Почему раньше могло быть «не удалось распознать рецепт»

- Ответ с `blocked: true` без массива `recipes` не должен гоняться через `parseRecipesFromChat` как рецепт: в `ChatPage` учитываются `blocked` / `blockedByAllergy` / `blockedByDislike` и готовый `message`. SSE-ветка в `useDeepSeekAPI` при `event: done` также пробрасывает поля `blocked*`, если появятся.

### 5.6 Вспомогательный модуль `checkChatAllergyBlock`

- `src/utils/chatAllergyCheck.ts` — узкий helper (тот же словарь токенов); основной путь чата — **`checkChatRequestAgainstProfile`** (аллергии + dislikes + «без X»).

### 5.7 Аудит чата

- **`npm run audit:chat-allergy`** — `scripts/audit-chat-allergy-guard.ts`: pre-request и post-recipe на тех же хелперах, сценарии «мясо», БКМ, рыба, орехи, глютен, яблоко и др. Подробнее: **`docs/dev/CHAT_ALLERGY_GUARD.md`**.

## 6. Единый helper аллергенов (после внедрения)

- **Edge:** `supabase/functions/_shared/allergens.ts` — `buildAllergenSet({ allergies[] })` → `{ blockedTokens }`, `isRecipeAllowedByAllergens(recipe, allergenSet)` → `{ allowed: boolean, reason?: string }`. Используется в generate-plan в pickFromPool (фильтр до soup-only) и при AI fallback в system prompt.
- **Клиент (чат):** тот же словарь токенов для пред-проверки запроса: при матче — не вызывать модель, вернуть отказ с именем профиля. Подсказки-замены в тексте для аллергии не выводятся; для dislike опционально — см. `buildBlockedMessage` / `docs/dev/CHAT_BLOCKED_BEHAVIOR.md`. В `meta` по-прежнему можно хранить `suggested_alternatives` для follow-up.

### 6.1 Dev: аудит и объяснение отсева кандидата

- **CLI:** `npm run audit:plan-allergy` — `scripts/audit-plan-allergy-debug.ts`, те же `buildBlockedTokensFromAllergies` / `explainAllergyFilterOnRecipe` / `passesPreferenceFilters`, плюс проверка паритета списка токенов client/Edge для «мясо».
- **Клиент (только dev/тесты):** `src/utils/planCandidateFilterExplain.ts` — `explainPoolCandidateRejection` (шаги как у `filterPoolCandidatesForSlot` до прикорма), `explainAllergyFilterOnRecipe` (поля + токены).
- **Группы по аллергиям:** `expandAllergiesToCanonicalBlockedGroups(allergies)` в `allergyAliases.ts`.

## 7. Предпочтения («любит ягоды»)

- Учитываются как мягкий сигнал: цель ~25% рецептов с ягодами на неделю, не в каждом.
- Реализация (TODO): счётчик на уровне генерации дня/недели (usedPreferenceLikeCount), при вызове pickFromPool передавать cap = ceil(0.25 * totalSlots); в скоринге давать бонус рецептам с preferenceLikeToken только пока count < cap, иначе не бонусовать (или штрафовать), чтобы не превышать ~25%.

**См. также:** полное описание подбора рецептов для плана (день/неделя): аллергии, любит/не любит, возраст, режим «Семья» — [docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md](../architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md).

## 8. Goals в generate-plan (Stage 4)

- Источник: `recipes.nutrition_goals` (jsonb array; whitelist).
- Правила дня:
  - минимум 1 рецепт с goal `balanced`;
  - желательно 1 дополнительный goal (iron_support/brain_development/weight_gain/gentle_digestion/energy_boost);
  - обед остаётся soup-first (как раньше).
- Правила недели:
  - goal-группы распределяются, чтобы не повторять одну и ту же постоянно;
  - при наличии `nutrition_goals` в запросе (future user goal) приоритет смещается к рецептам с этими goals.
- Реализация intentionally simple: небольшие бонусы/штрафы в in-memory выборе кандидата, без отдельной системы сложного scoring.
