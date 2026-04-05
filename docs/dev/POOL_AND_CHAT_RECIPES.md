# Пул рецептов и сохранение блюд из чата

## 1. Что считается пулом в БД

**Пул рецептов** — это таблица **`public.recipes`** в Supabase (ваш проект → Table Editor → `recipes`).

Выборка для подстановки в план (Edge Function **`generate-plan`**, `fetchPoolCandidates` → фильтры и `pickFromPoolInMemory`):

- **Таблица:** `public.recipes`
- **Доступ (RLS):** любой авторизованный пользователь может **читать** строки с `source IN ('seed','starter','manual','week_ai','chat_ai')` и не заблокированным `trust_level` (см. миграцию `20260227120000_recipes_pool_select_authenticated.sql`). Каталоги infant/toddler живут под `user_id` сервисного владельца импорта, но видны всем для чтения как pool.
- **Условия запроса:** тот же набор `source`, `trust_level IS NULL OR trust_level != 'blocked'`.
- **Две выборки и merge:** (1) `source IN ('seed','starter')` с лимитом **600** — чтобы curated-каталог (сотни рецептов с `score = 0`) **всегда** попадал в память; (2) `source IN ('manual','week_ai','chat_ai')` с лимитом `max(limitCandidates, 200)` (для дня `limitCandidates = 120`, для недели — `280`). Иначе при **одном** запросе `ORDER BY score DESC LIMIT 120` почти все строки с нулевым score дают **произвольный** срез БД, и детские каталоги часто **не входят** в выборку → 0 кандидатов после фильтра по возрасту/слоту.
- **После merge:** предварительная сортировка по `trustOrder` и `score` DESC — для порядка в памяти; **финальный выбор слота** — по **`computeCompositeScore`** (slot-fit Edge + trust + `recipes.score` + exploration + **`rankJitterFromSeed(rankSalt, recipeId)`**). В slot-fit Edge для **недели** и для **replace_slot** (не прикорм) дополнительно вычитается **ingredient diversity penalty** (`computeWeeklyKeyIngredientPenaltyCalibrated` в `shared/keyIngredientSignals.ts`): глобальные счётчики, усиление **primary** относительно secondary, для **breakfast/snack** — дополнительный мягкий слой по `usedKeyIngredientCountsByMealType` и степлерам (apple, banana, oatmeal, rice). Соль **`rank_salt`** задаётся **`buildAlignedRankSalt`** (см. `shared/planRankTrustShared.ts`, §6.1–6.3 в `PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md`, кратко **`docs/plan-generation.md`**).

**Клиент** (`recipePool.ts`, `poolRankLite.ts`, `useReplaceMealSlot`): та же выборка по `source` и **`POOL_TRUST_OR`**, тот же **`computeCompositeScore`** и та же **форма** `rank_salt`, что и Edge при совпадении контекста (`plannedDayKey`, `mealType`, infant-вариант, **`rankEntropy`** за сессию — см. **`docs/plan-generation.md`**). Полный slot-fit Edge на клиенте **не** воспроизводится — остаётся **slot-fit-lite**; см. §6.2–**6.3** `PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md` (**Client ↔ Edge ranking synchronization**).

**Диагностика сравнения:** Edge — лог **`RANK_DEBUG`** (рядом с `CHAT_PLAN_RANK_PICK` при rank-debug); клиент — консоль **`RANK_DEBUG`** при `?rankDebug=1` или `?debugPool=1`.

**Клиент (`recipePool.ts`, `useReplaceMealSlot`):** для возраста профиля **&lt; 12 мес** к запросу в `recipes` добавляется PostgREST-фильтр по `min_age_months` / `max_age_months` (эквивалент `recipeFitsAgeMonthsRow`), **до** `ORDER BY created_at DESC` и `LIMIT`. Иначе после массового импорта каталога 12+ мес последние N строк по дате создания могут не содержать ни одной строки, подходящей младенцу, и вкладка прикорма показывает «Пока нет подходящих вариантов…», хотя infant seed в базе есть.

**Curated infant seed (4–6, 7–8 и 9–11 мес):** импорт и идемпотентность — `docs/dev/infant-seed-import.md` (`source = seed`, `trust_level = core` — curated каталог; **trusted** = поведенческое доверие, не синоним seed-каталога).

**Curated toddler seed (12–36 мес):** отдельный snapshot и импорт — `docs/dev/toddler-seed-import.md`, тег батча `toddler_curated_v1`.

**Аудит покрытия пула 12–36 мес (разнообразие vs недельный план):** метрики по сид-каталогу, эффективный пул после фильтров, целевые объёмы и план расширения — **`docs/dev/recipe-pool-12-36-audit.md`**. Повторный пересчёт: `npx tsx scripts/audit-recipe-pool-12-36.ts`.

Для режима «прикорм» на клиенте (когда возраст профиля < 12 мес) подбор из пула опирается на `min_age_months/max_age_months` рецепта (через age-range фильтр), без использования `nutrition_goals` как основного механизма выбора. В UI для найденных infant-рецептов блок подсказки маркируется как **«Подсказка для мамы»**, а `description` показывается как текст рецепта (про текстуру/этап прикорма). На экране рецепта кнопка **«Добавить в покупки»** для таких рецептов скрыта (`RecipePage`, `isInfantRecipe`).

**Открытие рецепта с экрана плана:** карточки плана грузят превью через RPC **`get_recipe_previews`**, который для авторизованного пользователя отдаёт и рецепты пула с `user_id` каталога (seed и др.). Полный рецепт на `/recipe/:id` идёт через **`get_recipe_full`**; без расширения доступа тем же списком `source` экран рецепта мог вернуть пустой результат («Рецепт не найден»). См. миграцию `20260326100000_get_recipe_full_pool_access_align_previews.sql` и **docs/database/DATABASE_SCHEMA.md** (раздел про эти RPC).

---

## 2. Как для профиля выбирается блюдо из пула

Для **конкретного профиля** (член семьи или «Семья») логика такая.

### 2.1. Фильтр по `member_id`

- **План «Семья»** (`member_id` плана = `null`):
  - **Было:** в пул попадали только рецепты с `recipes.member_id IS NULL`.
  - **Стало:** в пул для «Семья» попадают **все рецепты пользователя** (без фильтра по `member_id`), чтобы и рецепты, сохранённые в контексте ребёнка, могли подставляться в общий семейный план.
- **План по ребёнку** (`member_id` = UUID ребёнка):
  - В пул попадают рецепты, где `recipes.member_id = этот UUID` **или** `recipes.member_id IS NULL` (семейные рецепты тоже доступны ребёнку).

Итог: для «Семья» пул = все рецепты пользователя из `public.recipes` с нужным `source`; для ребёнка — рецепты этого ребёнка + семейные.

### 2.2. Дальнейшая фильтрация кандидатов (в `pickFromPool`)

1. **Исключения:** уже выбранные в этот день/неделю `recipe_id` и нормализованные `title` (дедупликация).
2. **Тип приёма пищи (`meal_type`):**
   - Берётся из `recipes.meal_type` (нормализация: breakfast/lunch/snack/dinner, в т.ч. русские названия).
   - Если `meal_type` в БД `NULL` — определяется по названию/описанию/ингредиентам (токены: каша, омлет, суп, фрукты и т.д.).
   - В слот подставляется только рецепт с подходящим типом (например, в слот «завтрак» — только с resolved `breakfast`).
3. **Завтрак:** рецепты с «суп» в названии не подставляются на завтрак.
4. **Санity-правила:** тяжёлые блюда не на завтрак, супы не на полдник и т.д.
5. **Профиль (аллергии/предпочтения):** рецепты, содержащие ингредиенты из списка аллергий профиля, отбрасываются; учитываются предпочтения при скоринге.
6. **Ранжирование (клиент, fast-path):** после фильтров — **ranking-lite** (trust_level, `recipes.score`, slot-fit-lite, exploration, jitter), не случайный топ-10. Edge generate-plan использует полный composite (см. `generate-plan`).
7. **Неделя / замена слота (12+):** при переданных **`usedKeyIngredientCounts`** и опционально **`usedKeyIngredientCountsByMealType`** в slot-fit-lite тот же **калиброванный** штраф, что на Edge (`computeWeeklyKeyIngredientPenaltyCalibrated`). Не hard filter. Прикорм &lt;12 на клиенте для замены breakfast/lunch — без этого слоя (infant-пул). Подробнее: `docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md` §4.6, `docs/dev/plan-ingredient-diversity-progress.md`.

Если после всех фильтров кандидатов для слота не остаётся — слот остаётся пустым (режим «только пул», без AI).

---

## 3. Сохранение сгенерированного в чате блюда в пул

Любое сгенерированное в чате блюдо должно иметь **тип приёма пищи** и **теги** и сохраняться в **`public.recipes`** (то есть в тот же пул).

### 3.1. Где сохраняется (call sites RPC create_recipe_with_steps)

Все создания рецепта идут через один RPC и **один канонический формат** (helper `canonicalizeRecipePayload`):

| Место | Файл / функция | Контекст |
|--------|----------------|----------|
| Чат | `supabase/functions/deepseek-chat/index.ts` — после ответа с рецептом | `source: "chat_ai"`, `sourceTag: "chat"` |
| Plan replace_slot (parsed) | `supabase/functions/generate-plan/index.ts` — создание рецепта из разобранного AI-ответа | `source: "chat_ai"`, `sourceTag: "plan"`, `contextMealType: mealType` слота |
| Plan replace_slot (firstRecipe) | `supabase/functions/generate-plan/index.ts` — создание из `aiData.recipes[0]` | то же |
| Plan week_ai | `supabase/functions/generate-plan/index.ts` — генерация недельного плана | `source: "week_ai"`, `sourceTag: "week_ai"`, `contextMealType: mealKey` |
| Клиент | `src/hooks/useRecipes.tsx` — `createRecipe` mutation | `source` из аргумента, `sourceTag`: `week_ai` или `chat` |

То есть запись всегда идёт в **`public.recipes`** через `create_recipe_with_steps` с payload, собранным из **канонического** helper (клиент: `src/utils/recipeCanonical.ts`, Edge: `supabase/functions/_shared/recipeCanonical.ts`).

### 3.2. Канонический формат: meal_type, tags, source

**Инвариант:** независимо от того, создаётся рецепт из Plan или Chat, запись в `public.recipes` имеет один и тот же формат: валидные `title`/`steps`/`ingredients`, всегда заполненный `meal_type`, консистентные `tags`, `source` из POOL_SOURCES.

- **meal_type** (всегда один из `breakfast` | `lunch` | `snack` | `dinner`), приоритет вывода:
  1. **mealType** — если передан и валидный, используется.
  2. **tags** — если в тегах есть строка вида `*_breakfast` / `*_lunch` / `*_snack` / `*_dinner` (префиксы `chat_`, `week_`, `plan_`), из неё берётся тип приёма.
  3. **contextMealType** — тип слота при создании из Plan/replace_slot (завтрак/обед/полдник/ужин).
  4. **fallback** — `"snack"`.

- **tags** (всегда массив, без дублей):
  - Обязательно присутствуют: **sourceTag** (`"chat"` | `"plan"` | `"week_ai"`) и **`${sourceTag}_${meal_type}`** (например `chat_breakfast`, `plan_lunch`, `week_ai_snack`).
  - Остальные теги из рецепта добавляются без дублирования.

- **source** — должен входить в POOL_SOURCES (`seed`, `starter`, `manual`, `week_ai`, `chat_ai`); иначе подставляется дефолтный AI-источник (`chat_ai`).

- **steps / ingredients** — гарантированно массивы; минимум один шаг (иначе ошибка); у ингредиентов обязательно есть `display_text` (при отсутствии собирается из `name` и при необходимости `amount`).

В итоге рецепт из чата и рецепт из replace_slot (Plan) попадают в пул с одинаковой структурой и всегда с заполненным `meal_type` и тегами; при replace_slot используется тип слота (`contextMealType`), а не fallback «snack».

---

## 4. Почему могли оставаться пустыми 3 слота (завтрак, обед, полдник)

Возможные причины до правок:

1. **План «Семья», а рецепты с контекстом ребёнка:** раньше в пул для «Семья» попадали только рецепты с `member_id IS NULL`. Если единственный сохранённый рецепт из чата был создан при выбранном ребёнке, у него `member_id = child`, и он не попадал в пул для семейного плана. **Сейчас** для «Семья» пул расширен до всех рецептов пользователя.
2. **Мало рецептов с нужным `meal_type`:** если в пуле почти нет рецептов с типом завтрак/обед/полдник (или они отфильтровались по аллергиям/sanity), слоты остаются пустыми. Имеет смысл проверять в БД: `SELECT id, title, meal_type, member_id, source FROM recipes WHERE user_id = '...' AND source IN ('seed','starter','manual','week_ai','chat_ai');`
3. **Отладка:** в запросе к `generate-plan` можно передать `debug_pool: true` и смотреть логи по каждому слоту (rejectReason, candidatesStrict/candidatesLoose, afterMealType и т.д.).

---

## 5. Кратко

| Вопрос | Ответ |
|--------|--------|
| Что такое пул? | Рецепты пользователя из таблицы **`public.recipes`** с `source IN ('seed','starter','manual','week_ai','chat_ai')`. |
| Как для профиля берётся блюдо? | Для «Семья» — все такие рецепты пользователя; для ребёнка — его рецепты + с `member_id IS NULL`. Дальше фильтр по типу приёма, аллергиям, sanity и скоринг. |
| Сохраняются ли блюда из чата в пул? | Да, в **`public.recipes`** через RPC `create_recipe_with_steps`, с **`meal_type`** и **тегами** (`chat`, `chat_<meal_type>`). |
| Аллергии в чате | Pre-check + post-check на тех же токенах, что план (`recipeAllergyMatch`, `allergyAliases`). См. **`docs/dev/CHAT_ALLERGY_GUARD.md`**. |

---

## 6. Infant replace fallback (&lt;12 мес)

- Для infant-flow (`age_months < 12`, не family) автозамена по кнопке ↻ для **Premium/Trial** ограничена: максимум **5 успешных автозамен на один слот в рамках одного дня**.
- Подбор замены на экране плана: **`pickInfantNewRecipe`** / **`pickInfantFamiliarRecipe`** (внутри — `pickRecipeFromPool` + явный **`infantSlotRole`**: `primary` = новый продукт, `secondary` = только `introduced_product_keys`). В **`meal_plans_v2`** строки по-прежнему могут храниться под техническими **`breakfast` / `lunch`**; UI и подбор не трактуют это как «завтрак/обед». Сохранение — **`replaceSlotWithRecipe`** (для спокойного UX после успеха — с **`skipInvalidate`** + `applyReplaceSlotToPlanCache`). Edge **`replace_slot`** для этого UI не вызывается.
- Если задан **`introducing_product_key`**, а новый primary-рецепт вводит **другой** ключ продукта — показывается подтверждение; при «Да» сбрасываются `introducing_product_key` / `introducing_started_at` и применяется выбранный рецепт.
- Лимит считается по ключу `dayKey + mealType` (per-slot-per-day), а не глобально на день.
- После достижения лимита или исчерпания кандидатов показывается **infant-specific** `PoolExhaustedSheet`:
  - без CTA «Подобрать/Сгенерировать в чате»;
  - основной путь: **«Показать подходившие варианты»**;
  - возврат идёт к уже подходившим вариантам для текущего слота/дня.
- Для **Free** поведение не меняется: попытка замены ведёт в paywall.
- Для обычного flow `12+` и взрослых остаётся прежний generic fallback (избранное/чат).

---

## 7. Журнал: прикорм на вкладке «План» (март 2026)

- **Root cause ложного исчерпания пула:** клиентский infant replace/fill использовал те же `exclude`, что и 12+ — **все** `recipe_id` / title за **всю неделю** плюс session. При большом пуле это сужало кандидатов после 2–3 замен. **Исправление:** `infantDayReplaceExcludeRecipeIdsMerged` / `infantDayReplaceExcludeTitleKeysMerged` — только **выбранный день** + session для этой даты (`MealPlanPage`).
- **Дёрганье экрана:** после успешной infant-замены/добора убран лишний **`invalidateQueries(['meal_plans_v2'])`** там, где сразу вызывается **`applyReplaceSlotToPlanCache`**; `replaceSlotWithRecipe` принимает **`{ skipInvalidate: true }`**.
- **Файлы:** `src/pages/MealPlanPage.tsx`, `src/hooks/useReplaceMealSlot.ts`, `src/components/plan/PoolExhaustedSheet.tsx`, `src/utils/recipePool.ts` (комментарии), документ **`docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md`**.
- **Ручная проверка:** 5 замен на один infant-слот за день (Premium); смена варианта без «мигания» всего экрана; пустой новый пользователь — одна карточка primary; с введёнными — две роли; Free — paywall на ↻.
