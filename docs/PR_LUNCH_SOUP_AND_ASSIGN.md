# PR: Обед только супы + назначение в слот не меняет рецепт

## Причина регрессии (1–2 абзаца)

Слот «обед» по умолчанию должен заполняться только супами. Раньше в `pickFromPool` для lunch использовалась только **скоринговая** логика (`categoryKey === "soup"` давал +4, иначе −2), но не жёсткий фильтр, поэтому в обед могли попадать каши, гарниры и тяжёлые блюда. Регрессия — ослабление или отсутствие строгого правила «lunch = только супы» при выборе из пула и при AI-fallback.

Назначение рецепта в слот плана (assign) уже было корректным: RPC `assign_recipe_to_plan_slot` только обновляет `meal_plans_v2.meals`, не выполняет UPDATE по `recipes`, поэтому `recipes.meal_type` и `recipes.is_soup` при ручном назначении не меняются. В этом PR явно зафиксированы контракт и тесты/документация.

## Что сделано

- **Миграции**: колонка `recipes.is_soup` (boolean, default false), бэкфилл по title/description/tags; RPC `create_recipe_with_steps` принимает `is_soup` из payload и пишет в `recipes`.
- **generate-plan**: в пул добавлено поле `is_soup`; для слота **lunch** после фильтра по meal_type добавлен строгий фильтр «только супы» (`is_soup === true` или эвристика `inferDishCategoryKey === "soup"`). При AI-fallback для lunch payload собирается через `canonicalizeRecipePayload` с `contextMealType: "lunch"` → в payload попадает `is_soup: true`.
- **recipeCanonical** (Edge + клиент): для слота lunch в payload всегда выставляется `is_soup: true` (при создании рецепта для обеда).
- **Документация**: `docs/MEAL_TYPE_AND_LUNCH_SOUP.md` — источник истины по meal_type/is_soup, пул, assign; сценарии проверки регрессии.
- **Тесты**: `recipeCanonical.test.ts` — lunch ⇒ `is_soup: true`, dinner ⇒ `is_soup: false`, assign не меняет рецепт (описан сценарий в доке; RPC не трогает `recipes`).

## Важно

- Ручное назначение в слот «обед» по-прежнему разрешено для любого рецепта; при этом у рецепта не меняются `meal_type` и `is_soup`.
- Никаких ручных правок БД вне миграций.
