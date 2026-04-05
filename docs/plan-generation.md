# Генерация плана из пула (Edge + клиент)

Кратко: как устроены **ранжирование**, **случайность между перезапусками** и **участие candidate**, без дублирования полной архитектуры (см. также `docs/architecture/PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md`).

## Rank salt (`buildAlignedRankSalt`)

Строка вида:

- `userId|mealType|pool|dayKey` (и опционально `|variant` для прикорма)
- для замены слота: `userId|mealType|replace|dayKey` (+ `variant`)

В конец добавляется **`|rankEntropy`**, если он задан:

- **Edge `generate-plan`**, run с job: `rankEntropy = requestId`, где `requestId` — **`plan_generation_jobs.id`** (стабилен на весь один запуск `run`).
- **Edge** без job (например `mode=upgrade`): `requestId` = новый UUID на запрос.
- **`replace_slot`**: один **`crypto.randomUUID()`** на HTTP-запрос замены.
- **Клиент** `useGenerateWeeklyPlan`: один UUID на всю операцию «неделя» (`weekRankEntropy`), прокидывается во все `pickRecipeFromPool` этой сессии.
- **Клиент** `useReplaceMealSlot`: один UUID на вызов `pickReplacementFromPool`.

Если `rankEntropy` **не** передан, соль совпадает со **старым** форматом (обратная совместимость, детерминизм при тех же входных данных).

От соли зависят:

- `explorationPickActive(rankSalt)` — попадает ли слот в «exploration»;
- `rankJitterFromSeed(rankSalt, recipeId)` — псевдослучайный jitter для каждого рецепта.

Итого: **внутри одного job** соль постоянна → стабильный порядок; **новый job / новая сессия** → другая соль → другой jitter и другой набор exploration-слотов → **другой план** при том же пуле.

## Exploration

- Константа **`EXPLORATION_PICK_THRESHOLD_PCT`** в `shared/planRankTrustShared.ts` (сейчас **25%**): `simpleRankSaltHash(rankSalt) % 100 < threshold`.
- В exploration-слоте для `trust_level` **candidate** или **null** добавляется **`EXPLORATION_CANDIDATE_BOOST`** к composite (см. `explainRankingTail` / `computeCompositeScore`).

## Candidate: приоритет core

- **`trustRankingBonus`**: core/trusted/starter всё ещё существенно выше candidate.
- Дополнительно: **`CANDIDATE_COMPOSITE_NUDGE`** (малая константа, только для `trust_level === 'candidate'`) — не перебивает core при типичном slot-fit, но чуть чаще вытаскивает candidate в спорных ситуациях.

## Дедуп по заголовку и `norm_title`

Для исключения уже выбранных блюд по названию используется ключ **`recipeTitleDedupeKey`**: при наличии в строке рецепта **`norm_title`** берётся он, иначе **`title`**, затем **`normalizeTitleKey`** (как на Edge, так и в `recipePool.ts`).

## Файлы

| Область | Файл |
|---------|------|
| Соль, composite, exploration, nudge | `shared/planRankTrustShared.ts` |
| Run недели/дня, replace_slot | `supabase/functions/generate-plan/index.ts` |
| Клиентский пул | `src/utils/recipePool.ts`, `src/utils/poolRankLite.ts` |
| Неделя (pool + AI) | `src/hooks/useGenerateWeeklyPlan.ts` |
| Замена слота | `src/hooks/useReplaceMealSlot.ts` |
