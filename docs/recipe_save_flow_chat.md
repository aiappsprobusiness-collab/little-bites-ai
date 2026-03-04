# Как сохраняются данные рецепта из чата в БД

## Общая схема

1. **LLM** возвращает JSON рецепта (DeepSeek).
2. **Парсинг/валидация** (`recipeSchema.ts`): `parseAndValidateRecipeJsonFromString` или при неудаче `getRecipeOrFallback` → объект `RecipeJson` (в т.ч. `nutrition`, `ingredients` с `canonical`).
3. **Санация** (`domain/recipe_io`): подмена/усиление `description`, `chefAdvice` при необходимости; эвристика по ингредиентам (`applyIngredientsFallbackHeuristic`).
4. **Формирование payload для БД** в `deepseek-chat/index.ts` и `_shared/recipeCanonical.ts`.
5. **RPC** `create_recipe_with_steps(payload)` пишет в `recipes`, `recipe_steps`, `recipe_ingredients`.

---

## Откуда берутся поля

### Возраст (min_age_months, max_age_months)

- **Источник:** возраст выбранного профиля (или самого младшего в семье).
- **В коде:** `ageMonthsForCategory = getAgeMonths(primaryForAge)` (≈ стр. 499), затем `ageCategoryForLog = getAgeCategory(ageMonthsForCategory)` → одна из категорий: `infant` (≤12 мес), `toddler` (≤60), `school` (≤216), `adult` (>216).
- **Диапазон:** `AGE_RANGE_BY_CATEGORY[ageCategoryForLog]`:
  - infant: 6–12
  - toddler: 12–60
  - school: 60–216
  - adult: 216–1200
- **В payload:** в `index.ts` считаются `minAge`, `maxAge` из этого диапазона и передаются в `canonicalizeRecipePayload({ min_age_months: minAge, max_age_months: maxAge })`. В `recipeCanonical.ts` они возвращаются как `rawMinAge ?? null`, `rawMaxAge ?? null`.
- **В БД:** RPC читает `(payload->>'min_age_months')::integer`, `(payload->>'max_age_months')::integer`.

Если в логах нет `memberData`/профиля или возраст 0, используется `getAgeCategory(0)` → `infant` → диапазон 6–12. В payload возраст всегда должен быть числом (не null), если только не сломан вызов.

---

### Нутриенты (calories, proteins, fats, carbs)

- **Источник:** поле `nutrition` в JSON от LLM.
- **Нормализация** (`recipeSchema.ts`): `normalizeNutrition(p.nutrition)` принимает варианты ключей: `kcal_per_serving`/`calories`/`kcal`, `protein_g_per_serving`/`protein`, `fat_g_per_serving`/`fat`, `carbs_g_per_serving`/`carbs`. Если значения вне допустимых диапазонов — возвращается `null`.
- **Если парсинг рецепта падает:** используется `getRecipeOrFallback` → минимальный рецепт с **`nutrition: null`**.
- **В payload:** в `index.ts` берётся `n = validatedRecipe.nutrition ?? null` и передаётся в `canonicalizeRecipePayload({ nutrition: n })`. В `recipeCanonical.ts`: `calories = rawNutrition != null ? Math.round(rawNutrition.kcal_per_serving) : null` и аналогично proteins/fats/carbs.
- **В БД:** RPC подставляет `(payload->>'calories')::integer`, `(payload->>'proteins')::numeric`, и т.д.

Итог: если в БД калории/БЖУ пустые, значит в payload ушло `nutrition: null` — либо LLM не вернул/вернул невалидный блок, либо сработал fallback-рецепт после ошибки валидации.

---

### Ингредиенты (канонические amount/unit и т.д.)

- **В index.ts:** из `validatedRecipe.ingredients` собирается `ingredientsPayload`: для каждого ингредиента вызывается `buildOneIngredient` — берётся `ing.canonical` от LLM или локально считается `parseAmountToCanonical(amountStr)`, в объект попадают `name`, `amount`, `display_text`, `canonical_amount`, `canonical_unit`.
- **В recipeCanonical.ts:** массив передаётся как есть (уже с `canonical_amount`, `canonical_unit`), плюс добавляются `unit`, `substitute`, `order_index`, `category`.
- **В БД:** RPC в цикле по `payload->'ingredients'` пишет в `recipe_ingredients` (name, amount, unit, display_text, canonical_amount, canonical_unit, category и т.д.). Каноникал при необходимости дополняется функцией `ingredient_canonical` в БД.

Если каноникал в БД пустой — либо в ответе LLM нет `canonical`/amount, либо `parseAmountToCanonical` не смог распарсить строку.

---

## Логи для диагностики

- **RECIPE_SAVE_PAYLOAD_DEBUG** — в лог уходит то, что реально попадает в payload (в т.ч. `min_age_months`, `max_age_months`, `calories`, `proteins`, `fats`, `carbs` и первый ингредиент). По нему видно, уходят ли числа или null.
- **RECIPE_SAVE_NULL_FIELDS** — список полей payload, которые оказались null перед вызовом RPC.
- **DEBUG: Final age category determined** — категория возраста и `ageMonthsForCategory`.

Если в RECIPE_SAVE_PAYLOAD_DEBUG уже null — проблема до RPC (payload). Если там числа, а в таблице NULL — смотреть RPC/сериализацию.

---

## Что могло «сломаться» недавно

- Изменения в коде за последний деплой: только логика **chef_advice** (сохранение для free и fallback в `recipeCanonical`). Поля возраста, нутриентов и ингредиентов в `recipeCanonical` не переименовывались и не удалялись.
- Возможные причины пустых колонок при неизменном коде:
  1. Чаще срабатывает **fallback-рецепт** (`getRecipeOrFallback`) из-за ошибок валидации/парсинга → `nutrition: null`.
  2. LLM стал возвращать **другой формат** (другие ключи/типы для nutrition или ингредиентов) → `normalizeNutrition` даёт null или каноникал не парсится.
  3. В запросе не приходит **профиль/возраст** (или приходит 0) → возраст по умолчанию infant 6–12; если бы где-то терялась переменная `ageCategoryForLog`, мог бы использоваться не тот диапазон, но в текущем коде она в области видимости и всегда задаётся.

Рекомендация: по логам RECIPE_SAVE_PAYLOAD_DEBUG и RECIPE_SAVE_NULL_FIELDS проверить один-два запроса, где в БД сохранились пустые возраст/калории/белки — и по ним уже смотреть, на каком шаге теряются данные.
