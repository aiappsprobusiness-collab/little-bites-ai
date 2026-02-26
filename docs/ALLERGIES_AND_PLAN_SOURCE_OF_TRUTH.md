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
  - `pickFromPool(...)` — все фильтры: exclude ids/titleKeys, mainIngredient, mealType, breakfast no-soup, lunch soup-only, sanity, **profile (аллергии, предпочтения, возраст)**. Аллергии применяются в `passesProfileFilter` → `checkAllergyWithDetail` по полям рецепта: title, description, recipe_ingredients (name, display_text). Не по `recipe_ingredients.category`.
- **Клиент:** `src/utils/recipePool.ts` — `pickRecipeFromPool` и `passesProfileFilter` используются при подборе рецептов по кнопке «Подобрать рецепты» (weekly generation). Логика аллергий там совпадает по смыслу с Edge (токены из allergies + dairy expansion), но без единого словаря (курица/орехи и т.д.) — только tokenize(allergy) и молоко.

**Разрыв (до исправления):** для «курица» токенизация даёт слово «курица»; в названии «Суп с курицей и овощами» подстрока «курица» не входит в «курицей», поэтому рецепт не отфильтровывался. Нужен единый словарь расширенных токенов (кур, куриц, chicken и т.д.) и использование его и в плане, и в чате.

## 4. Как рецепт проверяется на аллерген

- **Поля:** title, description, ingredients (в Edge — `recipe_ingredients.name`, `recipe_ingredients.display_text`). Не используются: `recipe_ingredients.category`, tags как единственный источник (tags участвуют в общем тексте в recipePool, в Edge только title/description/ingredients).
- **Метод:** набор «запрещённых токенов» (blockedTokens) строится из аллергий профиля (+ расширения для молока, курицы, орехов и т.д.). Текст рецепта (title + description + ingredients) приводится к нижнему регистру; если в нём есть подстрока из blockedTokens — рецепт запрещён.

## 5. Где в чате стоит guard на аллерген и почему «не удалось распознать рецепт»

- **Guard:** в `src/hooks/useDeepSeekAPI.tsx` перед вызовом API вызывается `checkChatAllergyBlock(lastUserMessage, memberData?.allergies)`. При `blocked && found.length > 0` возвращается `{ message: "У нас аллергия на ..." }` без вызова DeepSeek.
- **Проблема «не удалось распознать рецепт»:** при таком ответе в ответе нет `recipes`; клиент (ChatPage) парсит ответ как рецепт, не находит рецепт и подставляет сообщение по умолчанию «Не удалось распознать рецепт. Попробуйте уточнить запрос.» вместо текста отказа по аллергии. Нужно: возвращать флаг (например `blockedByAllergy: true`) и на клиенте показывать именно сообщение отказа.
- **Второй разрыв:** `checkChatAllergyBlock` делает точное совпадение слова из запроса со списком аллергий. Запрос «ореховый пудинг» даёт слова «ореховый», «пудинг»; аллергия «орехи» не совпадает с «ореховый», поэтому блок не срабатывает, модель генерирует рецепт без орехов (подмена). Нужна проверка по подстрокам/токенам (как в плане): если в запросе есть подстрока аллергена (орех, куриц и т.д.) — отказ, без подмены.

## 6. Единый helper аллергенов (после внедрения)

- **Edge:** `supabase/functions/_shared/allergens.ts` — `buildAllergenSet({ allergies[] })` → `{ blockedTokens }`, `isRecipeAllowedByAllergens(recipe, allergenSet)` → `{ allowed: boolean, reason?: string }`. Используется в generate-plan в pickFromPool (фильтр до soup-only) и при AI fallback в system prompt.
- **Клиент (чат):** тот же словарь токенов (или общий пакет/копия) для пред-проверки запроса: если в сообщении пользователя есть запрещённый токен — не вызывать модель, вернуть дружелюбный отказ с именем профиля и альтернативами.

## 7. Предпочтения («любит ягоды»)

- Учитываются как мягкий сигнал: цель ~25% рецептов с ягодами на неделю, не в каждом.
- Реализация (TODO): счётчик на уровне генерации дня/недели (usedPreferenceLikeCount), при вызове pickFromPool передавать cap = ceil(0.25 * totalSlots); в скоринге давать бонус рецептам с preferenceLikeToken только пока count < cap, иначе не бонусовать (или штрафовать), чтобы не превышать ~25%.
