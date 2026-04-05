# Формат рецепта: порции и отображение ингредиентов

## Канон и порции

- **`recipe_ingredients.canonical_amount` / `canonical_unit`** (при наличии) задают количество **на одну порцию** в смысле масштаба рецепта: при `recipes.servings_base = 1` это количество на одну «базовую» порцию блюда.
- **`recipes.servings_recommended`** — рекомендуемое число порций для UX (степпер на карточке, подпись «Порции: N») и для начального масштаба списка ингредиентов. После миграции `20260406150100_recipes_servings_recommended_default_4.sql` дефолт в БД и в RPC **`create_recipe_with_steps`** при отсутствии поля в payload — **4** (существующие строки с `1` или `NULL` в рамках миграции подняты до 4).
- **`recipes.servings_base`** — делитель при масштабировании: множитель отображения и списка покупок с карточки: `servingsSelected / servings_base`.

## UI

- Масштаб чисел в карточке рецепта: **`shared/formatIngredientForUI.ts`** с опцией `servingMultiplier` (обычно `servingsSelected / servings_base`). Канонические **g/ml** и бытовой слой **dual** (`display_amount`) умножаются на этот множитель; сырой `display_text` без разбора чисел масштабируется только если выбран fallback без изменения строки.
- Список покупок из плана и **`buildShoppingIngredientPayloadsFromRecipe`** уже используют свой множитель порций **отдельно** — при добавлении из карточки рецепта не дублировать масштаб поверх уже переданного `multiplier`.

## Что не менялось

- Значения в БД (`canonical_amount` и т.д.) не пересчитываются миграциями под новые порции.
- Агрегация списка покупок по плану (`usePlanShoppingIngredients`, `normalizeIngredientForShopping`) не менялась.
