# Effective view списка покупок при фильтре по рецептам (2026-03)

## Root cause

- Фильтр по рецептам применялся только как **post-filter строк**: оставались позиции с пересечением `source_recipes` и выбранных id.
- У строки в БД хранились **полные** `amount` / `unit` и полный список источников; пересчёта вклада по выбранным рецептам не было.
- В результате количество и «в N рецептах» соответствовали **полной** агрегации, а не подмножеству рецептов — UI вводил в заблуждение.

## Почему фильтр был «только визуальным»

- В `meta` не было **поминутного разложения** суммы по `recipe_id`, только список источников и итоговое количество.

## Новая модель данных (meta)

- **`source_contributions`:** `{ recipe_id, amount_sum }[]` — вклад рецепта в сумму в единицах **`aggregation_unit`** (те же, что у `buildShoppingAggregationKey` / `amountToSum`).
- **`aggregation_unit`:** строка для `toShoppingDisplayUnitAndAmount` при суммировании вкладов (и полного, и частичного набора).
- **`dual_display_amount_sum` / `dual_display_unit`:** для ингредиентов с `measurement_mode = dual` — сумма «домашних» единиц (например шт., ч. л.) по всем вкладам; правая часть строки покупки по-прежнему из канона (`amount`/`unit` строки). При фильтре по рецептам левая часть масштабируется пропорционально вкладу канона (`computeEffectiveShoppingItemView`).

Заполняется при:

- агрегации из плана (`loadPlanShoppingIngredients` → `replaceItems`);
- `buildShoppingIngredientPayloadsFromRecipe` при добавлении из карточки рецепта;
- `addRecipeIngredients` — слияние вкладов при merge строк.

## Как считается effective amount

- `computeEffectiveShoppingItemView(row, selectedRecipeIds)` в `src/utils/shopping/shoppingListEffectiveView.ts`.
- Если фильтр не активен (`selectedRecipeIds` пуст или не передан) — показываются `amount` / `unit` строки и полные источники; при наличии dual в meta — также полная `dual_display_amount_sum` для подписи «N шт. ≈ M г».
- Если активен: `partialSum = sum(amount_sum)` по вкладам с `recipe_id ∈ selectedRecipeIds`; затем `toShoppingDisplayUnitAndAmount(aggregation_unit, partialSum)`; левая часть dual: `dual_display_amount_sum * (partialSum / totalSum)` при ненулевом `totalSum`.
- **Легаси** без вкладов: `amount * (число отфильтрованных источников / число всех источников)`; для dual — то же пропорционально для `dual_display_amount_sum`.

## Подпись «в N рецептах» и раскрытие

- N и список под стрелкой берутся из **effective** источников (пересечение с фильтром), не из полного `source_recipes`.
- Подпись только при `effectiveRecipeCount > 1`.

## Файлы

- `src/hooks/usePlanShoppingIngredients.ts` — `contributionsByRecipe`, поля в `AggregatedIngredient`.
- `src/utils/shopping/shoppingListMerge.ts` — типы meta/payload, вклады в `buildShoppingIngredientPayloadsFromRecipe`, `mergeContributionMaps`, расширенный `mergeShoppingItemMeta`.
- `src/hooks/useShoppingList.ts` — `replaceItems` meta, `addRecipeIngredients` пересчёт amount/unit из суммы вкладов.
- `src/utils/shopping/shoppingListEffectiveView.ts` — **новый** расчёт effective view.
- `src/components/favorites/ShoppingListView.tsx`, `src/components/plan/BuildShoppingListFromPlanSheet.tsx` — передача вкладов при сборке.
- `docs/architecture/shopping_list_aggregation.md`, `docs/architecture/shopping_list_product_model.md`, `docs/database/DATABASE_SCHEMA.md`.

## Что проверить руками

1. Собрать список из меню с пересечением ингредиентов по нескольким рецептам → фильтр 1–2 рецепта → количества и «в N рецептах» согласованы с раскрытием.
2. Добавить из карточки рецепта → merge → фильтр по этому рецепту — количество не показывает полный список без других рецептов.
3. Старый список без вкладов в meta — фильтр даёт пропорциональную оценку, без падений.

## Сознательно не трогалось

- Схема Postgres (только jsonb meta, без миграции колонок).

## Обновление 2026-04

- Копирование списка учитывает effective view (в т.ч. dual с фильтром по рецептам), как и строки на экране.
