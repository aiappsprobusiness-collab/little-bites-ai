# Агрегация списка покупок и нормализация ингредиентов

Документ описывает логику сбора списка продуктов из плана питания (today/week) и слой нормализации имён/единиц, чтобы одинаковые продукты не дублировались из-за разных формулировок в рецептах.

**Где используется:** вкладка Shopping List, сбор ингредиентов по выбранному диапазону (сегодня/неделя) и профилю (семья/член семьи).

---

## Обзор потока

1. **usePlanShoppingIngredients** (хук) запрашивает слоты плана из `meal_plans_v2` за диапазон и подгружает ингредиенты из `recipe_ingredients` по рецептам этих слотов.
2. Для каждого ингредиента строится **ключ агрегации** (нормализованное имя + нормализованная единица).
3. Строки с одинаковым ключом **объединяются**: суммы складываются, имена собираются для выбора отображаемого, категория и source_recipes объединяются.
4. Результат отдаётся в **ShoppingListView** и при «Обновить список» записывается в `shopping_list_items` через **replaceItems** (useShoppingList).

Нормализация применяется **только при агрегации** списка покупок. Данные в `recipe_ingredients`, карточки рецептов и путь генерации рецепта в чате не меняются.

---

## Модуль нормализации

**Файл:** `src/utils/shopping/normalizeIngredientForShopping.ts`

### Функции

| Функция | Назначение |
|--------|------------|
| **normalizeIngredientNameForShopping(name)** | Имя для ключа агрегации: lowercase, trim, удаление скобок и содержимого, процентов (10%, 20%, 3.2%), описательных суффиксов из конфига (спелый, свежий, репчатый и т.д.). |
| **normalizeIngredientUnitForShopping(unit?, canonicalUnit?)** | Единица для ключа: приоритет `canonical_unit` (g/ml); иначе маппинг г/гр/g→g, мл/ml→ml, шт./шт→pcs, ст.л.→tbsp, ч.л.→tsp, кг→kg, л→l. |
| **buildShoppingAggregationKey(input, multiplier)** | Строит ключ и возвращает `{ key, aggregationUnit, amountToSum, originalName }`. Для tbsp/tsp переводит количество в мл (1 tbsp = 15 ml, 1 tsp = 5 ml), ключ тогда `name\|ml`. |
| **chooseShoppingDisplayName(names)** | Для UI: из массива собранных имён выбирает самое короткое после «мягкой» очистки (скобки, проценты). |

### Конфиг

- **STRIP_SUFFIXES** — слова, убираемые из имени при построении ключа: спелый, свежая, свежий, свежие, репчатый, репчатая.
- **SPOON_TO_ML** — 1 tbsp = 15 ml, 1 tsp = 5 ml (только для агрегации списка).

### Ключ агрегации

Формат: `normalizedName|normalizedUnit`

- **normalizedName** — результат normalizeIngredientNameForShopping (например: «Банан спелый» → «банан», «Сливки 10%» → «сливки»).
- **normalizedUnit** — g, ml, kg, l, pcs или (для ложек) ml после пересчёта; для неизвестных единиц — сырая строка unit, чтобы не склеивать с другими.

Примеры склейки:

- Вода 350 мл + Вода 300 ml → один ключ `вода|ml`, сумма 650 мл.
- Банан + Банан спелый (одинаковая единица) → один ключ `банан|pcs`.
- Сливки 10% + Сливки 20% → один ключ `сливки|ml` (или g, если по массе).
- Лук репчатый 50 г + 20 г → один ключ `лук|g`, 70 г.
- 1 ст.л. + 2 ч.л. одного продукта → оба в ml, один ключ, 15 + 10 = 25 мл.
- Картофель 200 г и Картофель 1 шт. → разные ключи (`картофель|g` и `картофель|pcs`), две строки.

---

## Хук usePlanShoppingIngredients

**Файл:** `src/hooks/usePlanShoppingIngredients.ts`

- **Вход:** range (`today` | `week`), memberId (null = семья).
- **Выход:** массив `AggregatedIngredient[]` (name, amount, unit, displayAmount, displayUnit, category, source_recipes).

Внутри:

1. Загрузка слотов плана и рецептов/ингредиентов из Supabase.
2. Для каждого слота (recipe_id, servings) для каждого ингредиента вызывается **buildShoppingAggregationKey** с множителем порций.
3. Одна карта по ключу: при совпадении ключа суммируется amountToSum, в массив names добавляется originalName, категория берётся первая не other, объединяются sourceRecipeIds.
4. Результат: для каждой группы ключа — одна строка с name = capitalize(chooseShoppingDisplayName(names)), displayAmount = округлённая сумма, displayUnit = toDisplayUnit(aggregationUnit) (г, мл, шт. и т.д.).

Категории (vegetables, fruits, dairy, meat, grains, other) не меняются: при слиянии сохраняется первая непустая/не other.

---

## Связь с другими частями

- **Сбор списка** вызывается при открытии вкладки Shopping List и при нажатии «Обновить список» (тогда результат передаётся в replaceItems с syncMeta).
- **replaceItems** и **addRecipeIngredients** не используют нормализацию: они работают с уже собранным списком и ручными добавлениями.
- **recipe_ingredients** и RPC **create_recipe_with_steps** не меняются этим слоем; возможная будущая нормализация при записи в БД — отдельный уровень (см. вариант «два уровня» в обсуждении нормализации).

---

## Тесты

**Файл:** `src/utils/shopping/normalizeIngredientForShopping.test.ts`

Покрыты: нормализация имени (суффиксы, проценты, скобки), нормализация единиц (г/мл/шт/ложки), построение ключа и склейка (вода мл+ml, банан+банан спелый, сливки 10%+20%, лук г+г, ложки в мл, картофель г vs шт., canonical ml + unit мл), chooseShoppingDisplayName, SPOON_TO_ML.

Запуск: `npx vitest run src/utils/shopping/normalizeIngredientForShopping.test.ts`
