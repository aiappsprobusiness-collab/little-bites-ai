# Прогресс: ingredient diversity для плана (день / неделя)

## 1. Как сейчас работает weekly selection (до расширения)

- **Edge `generate-plan`:** `fetchPoolCandidates` → merge seed/starter + manual/week_ai/chat_ai → для каждого слота дня `pickFromPoolInMemory` (фильтры: exclude id/title, возраст, тип приёма, обед=суп, sanity, аллергии/dislikes, семейный ужин) → скоринг `scoreRecipeForSlot` (recency, **variety по словам title**, **primary base** за неделю, культурный/возрастной бонус) → `computeCompositeScore` (trust, score, exploration, jitter).
- **Клиент** (`recipePool` + `poolRankLite`): те же фильтры и composite, slot-fit — lite через `computeSlotFitForPoolRow`.
- **Likes** в подбор плана не входят (политика без изменений).

## 2. Почему возможен кейс «треть блюд с яблоком»

- **Нет учёта повторов по продукту/ингредиенту:** только `inferPrimaryBase` (творог, курица, `other`…) и слабый overlap по словам в **title**.
- Яблочные блюда часто попадают в **`other`** по primary base → недельный cap по базе их почти не разводит.
- **Срез пула** (лимиты 120/280, trust/score) может обогащать кластером детских перекусов с яблоком — это усиливает эффект, но корневая причина — **отсутствие сигнала ingredient diversity**.

## 3. Что изменилось в логике (v1 → калибровка)

- Общий модуль **`shared/keyIngredientSignals.ts`:** нормализация продуктов, `deriveKeyIngredientSignals`, **`computeWeeklyKeyIngredientPenaltyCalibrated`** — ступенчатая шкала по prior (`rawPenaltyUnitsFromPrior`), вес **primary** выше **secondary**, отдельные потолки на части и общий **`CAP_TOTAL_INGREDIENT`**, дополнительный мягкий слой для **breakfast/snack** по **`MEAL_DIVERSITY_STAPLE_KEYS`** и счётчикам **`usedKeyIngredientCountsByMealType`**. Обёртка **`computeWeeklyKeyIngredientPenalty(keys, used)`** сохранена для простых вызовов (primary = первый ключ).
- **Edge:** начальное заполнение счётчиков — **`fetchKeyIngredientSlotEntriesForDateKeys`** + **`fetchAndMergeKeyIngredientCountsForSlotEntries`** (каждый занятый слот отдельно, корректно при повторе одного `recipe_id`). **`replace_slot`:** **`collectRecipeSlotsFromMealPlansExcludingSlot`** + тот же merge. После каждого выбора — **`addKeyIngredientKeysToCounts`** с `mealKey` и `byMealType`.
- **Клиент:** `WeekContextAccumulated` — **`usedKeyIngredientCounts`** + **`usedKeyIngredientCountsByMealType`**; **`mergeKeyIngredientCountsFromPlanSlots`** при инициализации недели / skip дня; **`collectRecipeSlotsFromPlansExcludingSlotClient`** при замене слота; **`pickRecipeFromPool`** инкрементирует оба слоя.
- **Наблюдаемость:** **`DEBUG_PLAN_KEY_INGREDIENTS=true`** → **`PLAN_KEY_INGREDIENT_RANK_DEBUG`**: primary/secondary/meal subtotals, `vs_next` у победителя.

## 4. По свежим логам `PLAN_KEY_INGREDIENT_RANK_DEBUG` (проблема старой формулы)

- Штраф **работал**, но при порогах «≥2 → 6, ≥3 → 12» и **общем cap 20** к концу недели у многих кандидатов значение **упиралось в 20 одинаково** → diversity почти не разделял топ, победитель снова определялся **composite** (trust / score / exploration / jitter).
- Особенно заметно в **breakfast/snack** (яблоко, банан, рис, овсянка) и в системных повторах **rice, potato, carrot, chicken, pumpkin** за неделю.

## 5. Почему одинаковый cap на поздних слотах вредил

- При суммировании по 2–3 ключам с высоким prior все быстро достигали **одного потолка** → **информация о том, кто «менее повторный»**, терялась до уровня tie по ingredient-слою.

## 6. Что сделано в калибровке (без hard-ban)

- **Шкала:** `rawPenaltyUnitsFromPrior` (2→3, 3→6, 4→10, …, далее рост) — **различаются** prior=2 / 4 / 7.
- **Primary vs secondary:** полный вес на primary, ~0.48 на secondary; **отдельные cap** на части + **общий** на ингредиентный итог.
- **Meal-aware:** только **breakfast** и **snack**, только ключи из **`MEAL_DIVERSITY_STAPLE_KEYS`**, счётчики **по слоту приёма** в окне.
- **Hard-ban / skip кандидатов** на этом этапе **намеренно не вводили** — узкий пул и редкие профили не должны оставаться с пустыми слотами из-за жёсткого исключения по ключу.

## 7. Инварианты (нельзя ломать)

- Обед = только суп; sanity по слотам; аллергии/dislikes — **жёсткие фильтры**.
- Семья: возраст не сужает пул; объединённые аллергии/dislikes.
- Прикорм &lt;12 мес: **без** weekly ingredient penalty (ни run, ни replace infant-ветка).
- Likes не влияют на план.
- `inferPrimaryBase` и недельные штрафы по базе **сохранены**; ingredient diversity — **отдельный** сигнал.

## 8. Лимиты пула (POOL_LIMIT_*, seed overweight)

- **Не увеличивали** лимиты «на глаз»: доминирование одного продукта устраняется **штрафом**, а не обязательно большим срезом БД.
- Если позже понадобится двухступенчатая выборка (universe → assembler), задел: `_shared/plan/planIngredientCounts.ts` + чистый модуль `shared/keyIngredientSignals.ts`.

## 9. Тесты

- Vitest: `src/utils/keyIngredientSignals.test.ts` (шкала prior, primary vs secondary, meal snack/breakfast vs lunch, cap, slot-fit, byMeal snack).
- Deno (в `npm run test:edge`): `generate-plan/keyIngredientDiversity.test.ts`.

## 10. Когда следующим этапом смотреть hard-guard или two-phase planner

- Если после калибровки по реальным логам **всё ещё** доминируют одни и те же ключи в breakfast/snack при **широком** пуле (много кандидатов после фильтров), а `PLAN_KEY_INGREDIENT_RANK_DEBUG` показывает, что победитель **не** выигрывает за счёт ingredient-слоя — имеет смысл обсуждать **hard-guard** (мягкий пол с fallback) или **two-phase** планировщик.
- Если план часто **пустеет** в слотах при узком пуле — сначала **не** усиливать запреты, а смотреть данные пула и лимиты (отдельное решение, вне текущего scope).
