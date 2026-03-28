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
  - `pickFromPool(...)` — все фильтры: exclude ids/titleKeys, mainIngredient, mealType, breakfast no-soup, lunch soup-only, sanity, **profile (аллергии, предпочтения, возраст)**, goals-hints. Аллергии применяются в `passesProfileFilter` → `checkAllergyWithDetail` по полям рецепта: title, description, recipe_ingredients (name, display_text). Не по `recipe_ingredients.category`.
- **Клиент:** `src/utils/recipePool.ts` — `pickRecipeFromPool` и `passesProfileFilter` при подборе из пула используют **те же** токены аллергенов, что и Edge: `buildBlockedTokensFromAllergies` / `allergyAliases.ts` (и fallback из `allergensDictionary.ts`), плюс `containsAnyTokenForAllergy` для матча по тексту рецепта.

**Исторический разрыв (курица):** для свободного ввода «курица» без попадания в словарь алиасов теоретически возможны расхождения с Edge; при вводе из подсказок словаря клиент и Edge согласованы по куриным токенам.

## 4. Как рецепт проверяется на аллерген

- **Поля:** title, description, ingredients (в Edge — `recipe_ingredients.name`, `recipe_ingredients.display_text`). Не используются: `recipe_ingredients.category`, tags как единственный источник (tags участвуют в общем тексте в recipePool, в Edge только title/description/ingredients).
- **Метод:** набор «запрещённых токенов» (blockedTokens) строится из аллергий профиля (+ расширения для молока, курицы, орехов и т.д.). Текст рецепта (title + description + ingredients) приводится к нижнему регистру; если в нём есть подстрока из blockedTokens — рецепт запрещён (в generate-plan / `preferenceRules` — подстрока; в части чата для отдельных проверок может использоваться `containsAnyToken` с границей слова — см. код).

### 4.1 Аллергия на яйца и слово «белок»

- В словаре `ALLERGY_ALIASES` для канонического **«яйца»** **нет** отдельного токена **«белок»**: иначе ложные срабатывания на нейтральные фразы в описаниях («даёт белок», «источник белка»).
- Для яйца остаются токены вроде **яйц**, **яичн**, **желтк**, **egg** / **eggs** и **явные подстроки**: **белок яйц…**, **яичный белок**, **egg white**.
- Клиентский `allergensDictionary` (fallback по категории eggs) синхронизирован с этой политикой.

## 5. Где в чате стоит guard на аллерген и почему «не удалось распознать рецепт»

- **Guard:** в `src/hooks/useDeepSeekAPI.tsx` перед вызовом API вызывается `checkChatAllergyBlock(lastUserMessage, memberData?.allergies)`. При `blocked && found.length > 0` возвращается `{ message: "У нас аллергия на ..." }` без вызова DeepSeek. Матч по тексту запроса — **`containsAnyTokenForAllergy`** (подстроки токенов, как в плане), а не граница слова.
- **Профильный пречек:** `checkChatRequestAgainstProfile` (`chatBlockedCheck.ts`) для аллергий и dislikes в запросе использует тот же **`containsAnyTokenForAllergy`**, чтобы русские формы («луком», «курицей», «ягодный») обрабатывались согласованно с планом.
- **Проблема «не удалось распознать рецепт»:** при таком ответе в ответе нет `recipes`; клиент (ChatPage) парсит ответ как рецепт, не находит рецепт и подставляет сообщение по умолчанию «Не удалось распознать рецепт. Попробуйте уточнить запрос.» вместо текста отказа по аллергии. Нужно: возвращать флаг (например `blockedByAllergy: true`) и на клиенте показывать именно сообщение отказа.
- **Второй разрыв (исправлен):** в словаре аллергенов (_shared/allergyAliases.ts и клиент) для блокировки запроса добавлены прилагательные и формы («ореховый», «яичный», «молочный» и т.д.). Запрос «ореховый пудинг» при аллергии на орехи теперь блокируется до вызова модели (findMatchedTokens по границам слов), показывается понятное сообщение без подмены блюда.

## 6. Единый helper аллергенов (после внедрения)

- **Edge:** `supabase/functions/_shared/allergens.ts` — `buildAllergenSet({ allergies[] })` → `{ blockedTokens }`, `isRecipeAllowedByAllergens(recipe, allergenSet)` → `{ allowed: boolean, reason?: string }`. Используется в generate-plan в pickFromPool (фильтр до soup-only) и при AI fallback в system prompt.
- **Клиент (чат):** тот же словарь токенов (или общий пакет/копия) для пред-проверки запроса: если в сообщении пользователя есть запрещённый токен — не вызывать модель, вернуть дружелюбный отказ с именем профиля и альтернативами.

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
