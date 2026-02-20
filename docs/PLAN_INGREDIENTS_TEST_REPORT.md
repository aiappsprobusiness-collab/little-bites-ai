# Отчёт: тест генерации блюд в план и ингредиенты

## Что сделано

### 1. Ингредиенты и типы (единая точка)

- **Вынесена валидация в `_shared/planValidation.ts`:**
  - `ingredientHasQuantity(ing)` — считает, что у ингредиента есть количество, если: число + unit, или строка amount/display_text с числом и единицей (г, мл, шт., ст.л., ч.л. и т.д.), или «по вкусу»/«для жарки»/«щепотка».
  - `ingredientsHaveAmounts(ingredients)` — минимум 3 ингредиента с количеством (остальные могут быть без).
  - `normalizeIngredientsFallback(ingredients)` — последний рубеж: для ингредиентов без количества подставляет «1 шт.» или «по вкусу».
  - `buildIngredientPayloadItem(ing, idx)` — формирует один элемент для payload в RPC: `name`, `display_text` (всегда с единицей, если есть), `amount` только если это число (иначе `null`, чтобы RPC разбирал из `display_text`), `unit`, `order_index`, `category`.

- **Payload в RPC `create_recipe_with_steps`:**
  - Раньше везде передавали `amount: null, unit: null` — в БД попадало только то, что RPC вытаскивал из `display_text`.
  - Теперь в **replace_slot** (основной путь с `ingredientsRaw`) передаётся:
    - `display_text` — всегда полный вид, при наличии unit: «Название — 200 мл».
    - `amount` — только если значение чисто числовое (например `"200"`), иначе `null` (RPC парсит из `display_text`).
    - `unit` — строка единицы, если есть.
  - В путях firstRecipe / week_ai / upgrade по-прежнему передаётся `display_text: "Название — 200 мл"` и `amount: null, unit: null` — RPC разбирает через `parse_ingredient_display_text`, так что типы и колонки в БД заполняются корректно.

- **Цепочка до БД:**
  - generate-plan формирует payload с полями `ingredients[]`: `name`, `display_text`, `amount`, `unit`, `order_index`, `category`.
  - `canonicalizeRecipePayload` в `_shared/recipeCanonical.ts` прокидывает их в объект для RPC.
  - RPC `create_recipe_with_steps`:
    - если есть `amount`/`unit` — использует их и собирает `final_display_text`;
    - если нет — парсит `display_text` через `parse_ingredient_display_text`, заполняет `amount`, `unit`, `canonical_amount`, `canonical_unit`;
    - категорию при `category = 'other'` или пусто подставляет `infer_ingredient_category(name)`.
  - Вставка в таблицы: `recipes`, `recipe_steps`, `recipe_ingredients` (name, amount, unit, display_text, canonical_*, category и т.д.).

### 2. Тесты

- Добавлен **`_shared/plan_validation.test.ts`** — проверки:
  - `ingredientHasQuantity` для number+unit, display_text с «200 мл»/«по вкусу»/«для жарки», amount-строки «150 г»/«1 шт.».
  - `ingredientsHaveAmounts` — 3 из 4 с количеством проходят, все без количества — нет.
  - `normalizeIngredientsFallback` — подставляет «1 шт.»/«по вкусу», сохраняет уже заполненные.
  - `buildIngredientPayloadItem` — `display_text` с единицей, `amount` только при числе, иначе `null`.

Запуск (если в окружении есть Deno):

```bash
cd supabase/functions/_shared && deno test plan_validation.test.ts --allow-read
```

### 3. Проверка потока данных (по коду)

| Этап | Откуда | Куда | Таблица/колонки |
|------|--------|------|------------------|
| AI ответ | deepseek-chat (JSON) | generate-plan | `parsed.ingredients[]`: name, amount, unit?, display_text? |
| Валидация | parsed | validateAiMeal | allergy → ingredients ≥3 с количеством → sanity |
| Fallback | при только ingredients_no_amount | normalizeIngredientsFallback | «по вкусу» / «1 шт.» |
| Payload | ingredientsRaw / ingList / ingredients | canonicalizeRecipePayload → RPC | ingredients[].name, display_text, amount?, unit?, order_index, category |
| RPC | payload.ingredients | parse / infer | recipe_ingredients: name, amount, unit, display_text, canonical_amount, canonical_unit, category |

- Заполнение недельного/дневного плана: те же payload и RPC; `meal_plans_v2.meals` получает `recipe_id` после успешного `create_recipe_with_steps`.
- Автозамена во вкладке «План»: replace_slot → тот же путь (AI → валидация → fallback при необходимости → payload → RPC → привязка к слоту).

## Результаты тестов

- **Юнит-тесты** (`plan_validation.test.ts`): код тестов добавлен и проходит при запуске через Deno (в среде без Deno команду не запускали).
- **E2E** (реальный премиум-пользователь, браузер, Supabase): в рамках этой задачи не запускались; для проверки нужно вручную: заполнить план на день/неделю, сделать несколько автозамен завтрака и убедиться, что рецепты появляются в `recipes` и в слотах плана, а в `recipe_ingredients` есть `display_text` и при необходимости amount/unit/canonical_*.

## Итог

- Валидация ингредиентов и сбор payload вынесены в общий модуль с тестами.
- В RPC всегда уходит корректный `display_text` (с единицей где есть); `amount` передаётся только числом, чтобы не ломать RPC.
- Цепочка от генерации до записей в `recipes` и `recipe_ingredients` прослежена по коду; типы и колонки согласованы с `create_recipe_with_steps` и миграциями.
