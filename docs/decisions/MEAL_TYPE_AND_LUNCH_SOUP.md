# Источник истины: meal_type, is_soup, слот обед

## Где задаётся recipes.meal_type при создании рецепта

- **RPC `create_recipe_with_steps`**: принимает payload, пишет `meal_type = NULLIF(payload->>'meal_type', '')`. Источник — тот, кто собирает payload.
- **Чат (deepseek-chat)**: при сохранении рецепта из чата payload собирается через `canonicalizeRecipePayload` (Edge: `recipeCanonical.ts`). `meal_type` берётся из `resolveMealType(mealType, tags, contextMealType, sourceTag)` и попадает в payload.
- **План на день/неделю (generate-plan)**: при AI-fallback вызывается `canonicalizeRecipePayload` с `contextMealType: mealKey` (breakfast/lunch/snack/dinner). Итоговый `meal_type` в payload = слот, для которого генерировали.
- **Итог**: при создании рецепта `meal_type` задаётся один раз из контекста (чат/план) и не должен меняться при последующем назначении в другой слот.

## Где выбираются кандидаты из пула для слота

- **Edge `generate-plan`**:
  - `fetchPoolCandidates()` — один общий запрос по пулу (в т.ч. поле `is_soup`).
  - `pickFromPoolInMemory(..., mealType, ...)` — для каждого слота фильтрует кандидатов:
    - по `meal_type` (resolved: из БД или infer из title/description/ingredients);
    - для **lunch** — только рецепты с `is_soup = true` или категорией soup по эвристике (inferDishCategoryKey: суп, борщ, щи, солянка, рассольник, окрошка, гаспачо). Если подходящего нет — слот остаётся пустым;
    - для **breakfast** и **snack** — супы отсекаются (sanity);
    - для **dinner** — супоподобные блюда отсекаются (sanity: суп, борщ, щи, солянка, рассольник, окрошка, гаспачо);
    - остальные sanity-правила по слотам (сырники/каша не в lunch и т.д.).
  - Используется при: fill day, fill week, replace_slot (один приём пищи).
- **Клиент**: не выбирает кандидатов из пула; только вызывает Edge (fill/replace) или вручную назначает рецепт в слот через `assign_recipe_to_plan_slot`.

## Важно: назначение в слот НЕ меняет рецепт

- **RPC `assign_recipe_to_plan_slot`**: только обновляет `meal_plans_v2.meals` (upsert слота с `recipe_id`, `title`, `servings`). **Не выполняет UPDATE по таблице `recipes`** — в том числе не трогает `recipes.meal_type` и `recipes.is_soup`.
- **Миграция `20260216120000_backfill_recipes_meal_type_from_plans`**: один раз заполняла `meal_type` только там, где он был NULL (`AND r.meal_type IS NULL`). Повторный запуск не перезаписывает уже заданный `meal_type`. Новых триггеров/backfill’ов, которые бы меняли `recipes.meal_type` при изменении плана, не добавлять.
- **Правило**: при ручном назначении ужинного рецепта в слот «обед» слот в плане указывает на этот `recipe_id`, но в `recipes` у этой строки `meal_type` и `is_soup` остаются прежними (например, `dinner` и `false`).

## Правило «обед = только суп», «суп = только обед»

- **Суп всегда обед и никогда ужин/завтрак/перекус.** Это соблюдается при генерации в чате и при автозаполнении плана.
- **Автозаполнение плана (день/неделя):**
  - Слот lunch заполняется только супами (и аналогами: окрошка, солянка, рассольник, гаспачо — по эвристике категории soup). В пуле учитываются только рецепты с `is_soup = true` или категорией soup по эвристике (inferDishCategoryKey). Если подходящего блюда нет — слот обеда остаётся пустым (не подставляем не-суп).
  - В слот dinner (и breakfast/snack) супоподобные блюда не ставятся (sanity: суп, борщ, щи, солянка, рассольник, окрошка, гаспачо).
- **Чат (генерация рецептов):** в промпте задано правило MEAL_SOUP_RULES: супы только для lunch; для dinner/breakfast/snack супы не предлагать; для запроса на обед — только супы и аналоги. mealType в JSON должен соответствовать: суп → только lunch.
- **Ручное назначение в слот lunch** не ограничено: пользователь может поставить в слот обеда любое блюдо (в т.ч. не суп); при этом рецепт в БД не меняется (см. выше).

## Проверки регрессии

1. **Lunch = суп (автозаполнение / replace_slot)**  
   При генерации дня/недели или замене слота «обед» в слот попадает только рецепт с `is_soup = true` или с категорией soup по эвристике. Unit: `recipeCanonical.test.ts` — payload для lunch содержит `is_soup: true`.

2. **replace_slot на lunch**  
   Edge replace_slot для meal_type=lunch вызывает `pickFromPool(..., "lunch", ...)`, где действует фильтр «только супы»; при отсутствии супов в пуле — AI-fallback с `contextMealType: "lunch"` и payload с `is_soup: true`.

3. **Ручное назначение не меняет рецепт**  
   Сценарий: создать/взять рецепт с `meal_type = 'dinner'` и `is_soup = false`. Вызвать `assign_recipe_to_plan_slot(member_id, day_key, 'lunch', recipe_id, title)`. Проверить: в `meal_plans_v2` слот `lunch` указывает на этот `recipe_id`; в `recipes` у этой строки `meal_type` и `is_soup` не изменились. RPC не выполняет UPDATE по `recipes` — регрессия была бы только при появлении такого UPDATE в коде RPC или триггера.
