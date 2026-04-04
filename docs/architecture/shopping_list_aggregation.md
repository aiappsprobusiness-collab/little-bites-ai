# Агрегация списка покупок и нормализация ингредиентов

Документ описывает логику сбора списка продуктов из плана питания (today/week) и слой нормализации имён/единиц, чтобы одинаковые продукты не дублировались из-за разных формулировок в рецептах.

**Где используется:** сбор ингредиентов по выбранному диапазону (сегодня/неделя) и профилю (семья/член семьи) при **явной сборке** списка из меню. Продуктовая модель и точки входа в UI — **shopping_list_product_model.md**.

---

## Обзор потока

1. **usePlanShoppingIngredients** (хук) запрашивает слоты плана из `meal_plans_v2` за диапазон и подгружает ингредиенты из `recipe_ingredients` по рецептам этих слотов.
2. Для каждого ингредиента строится **ключ агрегации** (**канонический сегмент имени** после нормализации + алиасов + **нормализованная единица**; для части овощей г и шт. приводятся к **г** — см. ниже и `canonicalShoppingIngredient.ts`).
3. Строки с одинаковым ключом **объединяются**: суммы складываются, имена собираются для выбора отображаемого, категория и source_recipes объединяются.
4. Результат передаётся в **replaceItems** (`useShoppingList`) при явной сборке (sheet на Плане, кнопка «Собрать из меню» в пустом состоянии, «Собрать заново» при расхождении с планом) и записывается в `shopping_list_items`.

Нормализация применяется **только при агрегации** списка покупок. Данные в `recipe_ingredients`, карточки рецептов и путь генерации рецепта в чате не меняются.

---

## Модуль нормализации

**Маппинг категорий БД → секции списка:** `src/utils/shopping/mapDbProductCategoryToShoppingAisle.ts` — в Postgres `product_category` включает **fish**, **fats**, **spices**; в UI шесть проходов: **fish → meat**, fats/spices → **other**. Используется внутри `resolveProductCategoryForShoppingIngredient` (`inferShoppingCategoryFromIngredient.ts`).

**Fallback по названию:** если в `recipe_ingredients` или в строке списка `category` = `other` или `NULL`, категория для полки выводится эвристикой по **name + display_text** (нормализация ё→е, порядок правил как в RPC `infer_ingredient_category`). Так позиции вроде свёклы, авокадо, тунца/стейка тунца, тофу не оседают в «Прочее», когда в БД не заполнена категория. При чтении `shopping_list_items` то же правило по полю `name` подтягивает отображение без обязательной пересборки списка.

**Файлы:** `src/utils/shopping/normalizeIngredientForShopping.ts`, **`src/utils/shopping/canonicalShoppingIngredient.ts`** (алиасы, PCS→г для allowlist-овощей, предпочитаемые display-имена).

### Функции

| Функция | Назначение |
|--------|------------|
| **normalizeIngredientNameForShopping(name)** | Имя для ключа агрегации: lowercase, trim, **ё→е**, удаление скобок и содержимого, процентов (10%, 20%, 3.2%), описательных суффиксов из конфига (спелый, свежий, репчатый и т.д.). |
| **resolveCanonicalShoppingNameSegment** (`canonicalShoppingIngredient.ts`) | После нормализации имени: словарь **безопасных** синонимов (яйца/гречка/масло растительное/лимонный сок и т.д.) → один сегмент ключа. |
| **buildShoppingAggregationKey** | Учитывает `display_text` для парсинга `(N г)` при переводе шт.→г у овощей из allowlist; итоговый ключ: `canonicalSegment|aggregationUnit`. |
| **shoppingListDisplayNameFromAggregationKey** | Имя строки: `CANONICAL_DISPLAY_NAME` при наличии + display-нормализация. |
| **normalizeIngredientUnitForShopping(unit?, canonicalUnit?)** | Единица для ключа: приоритет `canonical_unit` (g/ml); иначе маппинг г/гр/g→g, мл/ml→ml, шт./шт→pcs, ст.л.→tbsp, ч.л.→tsp, кг→kg, л→l. |
| **buildShoppingAggregationKey(input, multiplier)** | Строит ключ и возвращает `{ key, aggregationUnit, amountToSum, originalName }`. Для tbsp/tsp: только у жидкостей (dairy, other) переводит в мл; у твёрдых/сыпучих (grains, vegetables, fruits, meat) оставляет ст.л./ч.л., чтобы не получать «30 мл» у овсянки/муки. |
| **chooseShoppingDisplayName(names)** | Для UI: из массива собранных имён выбирает самое короткое после «мягкой» очистки (скобки, проценты). |
| **normalizeIngredientDisplayName(name)** | Display-нормализация имени только для отображения: убирает скобки, проценты, слова из DISPLAY_STRIP_WORDS и фразы из DISPLAY_STRIP_PHRASES (по целым словам). Результат с заглавной буквы (Яблоко, Йогурт). Не влияет на ключи агрегации и БД. |
| **toShoppingDisplayUnitAndAmount(aggregationUnit, amount)** | Для UI: количество и единица. Мл: при amount >= 30 показываются миллилитры; при меньших — ст.л./ч.л. (15→1 ст.л., 5→1 ч.л. и т.д.). Остальные единицы — г, кг, л, шт., ст.л., ч.л. как есть. |
| **formatAmountForDisplay(amount, unit)** | Дроби для шт.: 0.5→«1/2», 0.25→«1/4», 0.75→«3/4». Используется в ShoppingListView при выводе строки. |

### Конфиг

- **STRIP_SUFFIXES** — слова, убираемые из имени при построении ключа: спелый, свежая, свежий, свежие, репчатый, репчатая.
- **DISPLAY_STRIP_WORDS** — слова, убираемые только при отображении имени (сладкое, спелый, детский, натуральный, обогащённый и т.д.). Удаление по целым словам.
- **DISPLAY_STRIP_PHRASES** — фразы для display (например «с кальцием»).
- **SPOON_TO_ML** — 1 tbsp = 15 ml, 1 tsp = 5 ml (только для жидкостей при агрегации).
- **SOLID_CATEGORIES** — vegetables, fruits, meat, grains, **fish**: для этих категорий ложки не конвертируются в мл (в списке остаются ст.л./ч.л.); `fish` в БД учитывается до маппинга в секцию meat.

### Ключ агрегации

Формат: **`canonicalSegment|aggregationUnit`**, где **canonicalSegment** — результат `normalizeIngredientNameForShopping` + **resolveCanonicalShoppingNameSegment** (алиасы).

- **canonicalSegment** — например «Банан спелый» → «банан»; «Яйцо» и «Яйца куриные» → «яйца»; «Сливки 10%» → «сливки».
- **aggregationUnit** — g, ml, kg, l, pcs или (для ложек у жидкостей) ml после пересчёта; для неизвестных единиц — сырая строка unit.

Примеры склейки:

- Вода 350 мл + Вода 300 ml → один ключ `вода|ml`, сумма 650 мл.
- Банан + Банан спелый (одинаковая единица) → один ключ `банан|pcs`.
- Сливки 10% + Сливки 20% → один ключ `сливки|ml` (или g, если по массе).
- Лук репчатый 50 г + 20 г → один ключ `лук|g`, 70 г.
- 1 ст.л. + 2 ч.л. одного продукта (жидкость) → оба в ml, один ключ, 15 + 10 = 25 мл.
- Картофель 200 г и Картофель 1 шт. → **один ключ `картофель|g`** (PCS→г для allowlist-овощей; см. `SHOPPING_PCS_TO_GRAMS` и парсинг `display_text`).

Подробности и список алиасов / осознанных non-merge кейсов: **`docs/dev/shopping-list-canonical-pipeline-2026-03.md`**.

**Purchase-friendly отображение** (штуки ≈ граммы для части овощей, зубчики чеснока, яйца без «≈»): только текст в UI и при копировании — **`formatShoppingListPurchaseLine`** в `src/utils/shopping/shoppingListPurchaseDisplay.ts`; агрегация и `merge_key` не меняются.

---

## Хук usePlanShoppingIngredients и loadPlanShoppingIngredients

**Файл:** `src/hooks/usePlanShoppingIngredients.ts`

- **Хук — вход:** range (`today` | `week`), memberId (согласовать с планом через `mealPlanMemberIdForShoppingSync`, см. **shopping_list_product_model.md**).
- **Экспорт `loadPlanShoppingIngredients(userId, range, memberId)`:** та же агрегация без React Query (sheet на Плане, единая логика с хуком).
- **Выход:** массив `AggregatedIngredient[]` (name, amount, unit, displayAmount, displayUnit, category, source_recipes, **source_contributions** — вклад каждого `recipe_id` в сумму в единицах `aggregation_unit`, **aggregation_unit** — та же единица, что у `buildShoppingAggregationKey`, **merge_key** — сохраняется в `shopping_list_items.meta` при сборке из меню и при добавлении из карточки рецепта для корректного слияния без дублей и для пересчёта количества при фильтре по рецептам в UI).

Внутри:

1. Загрузка слотов плана и рецептов/ингредиентов из Supabase.
2. Для каждого слота (recipe_id, servings) для каждого ингредиента вызывается **buildShoppingAggregationKey** с множителем порций.
3. Одна карта по ключу: при совпадении ключа суммируется amountToSum, по каждому recipe_id ведётся отдельная сумма вкладов (`contributionsByRecipe`), в массив names добавляется originalName, категория берётся первая не other, объединяются sourceRecipeIds.
4. Результат: для каждой группы ключа — одна строка с name = **shoppingListDisplayNameFromAggregationKey(merge_key, names)**, displayAmount/displayUnit = toShoppingDisplayUnitAndAmount (при сумме в г ≥ 1000 — отображение в **кг**). В UI списка и при Copy используется display-нормализованное имя. Публичный шаринг списка продуктов отключён; доступно только копирование для личного использования.

Категории (vegetables, fruits, dairy, meat, grains, other) не меняются: при слиянии сохраняется первая непустая/не other.

---

## Связь с другими частями

- **Сбор в БД** только по явному действию пользователя; `shopping_lists.meta` хранит подпись последней сборки для сравнения с планом (без автоперезаписи). См. **shopping_list_product_model.md**.
- **replaceItems:** при сборке из меню в каждую строку пишется `meta.merge_key` (ключ агрегации), `meta.source_recipes`, при агрегации из плана — также `meta.source_contributions` и `meta.aggregation_unit` (для `computeEffectiveShoppingItemView` при фильтре по рецептам).
- **addRecipeIngredients** (`useShoppingList`): добавление ингредиентов **из карточки рецепта** (`RecipePage`, кнопка «Добавить в покупки») строит те же ключи и display-поля, что и план, через `buildShoppingIngredientPayloadsFromRecipe` в `src/utils/shopping/shoppingListMerge.ts` (внутри — `buildShoppingAggregationKey` + `toShoppingDisplayUnitAndAmount`). Слияние с существующими строками: совпадение по `meta.merge_key`, иначе легаси `trim().toLowerCase(name)|unit` как в первой версии. Ручное добавление продукта без `merge_key` по-прежнему только легаси-ключом. Несовпадение единиц на одном ключе не конвертируется: разные ключи агрегации → разные строки.
- **recipe_ingredients:** добавлены поля dual display (`measurement_mode`, `display_*`); **агрегация списка покупок по-прежнему опирается на canonical g/ml**, не на `display_text`. Подробнее: `docs/dev/RECIPE_INGREDIENT_DUAL_MEASUREMENT.md`.

---

## Тесты

**Файлы:** `src/utils/shopping/normalizeIngredientForShopping.test.ts`, `src/utils/shopping/canonicalShoppingIngredient.test.ts`

Покрыты: нормализация имени для ключа (суффиксы, проценты, скобки, ё→е), display-нормализация имени, нормализация единиц, построение ключа (вода мл+ml, яйца+яйца куриные, картофель г+шт. → один ключ, перец чёрный/черный), toShoppingDisplayUnitAndAmount (г → кг от 1000), ложки, SPOON_TO_ML.

Запуск: `npx vitest run src/utils/shopping/normalizeIngredientForShopping.test.ts src/utils/shopping/canonicalShoppingIngredient.test.ts`
