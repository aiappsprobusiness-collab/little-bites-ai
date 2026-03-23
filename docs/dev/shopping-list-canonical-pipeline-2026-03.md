# Shopping list: canonical ingredient pipeline (2026-03)

## Root cause

- Ключ агрегации строился как `normalizeIngredientNameForShopping(name) | unit` без **ё→е**, без **словаря синонимов** и без **перевода шт.→г** для частых овощей.
- В результате дублировались строки с разными формулировками (`перец чёрный` / `перец черный`), синонимами (`яйцо` / `яйца куриные`), порядком слов (`масло растительное` / `растительное масло`) и разными единицами для одного продукта (`картофель` в г и в шт.).

## Решение

1. **`src/utils/shopping/canonicalShoppingIngredient.ts`** — канонический слой:
   - `CANONICAL_NAME_ALIASES` — безопасные синонимы → один сегмент ключа.
   - `CANONICAL_DISPLAY_NAME` — предпочитаемое имя для UI.
   - `SHOPPING_PCS_TO_GRAMS` + `parseGramsPerPieceFromDisplayText` — high-confidence **PCS→г** для лук / морковь / картофель / свёкла (приоритет парсинга `(N г)` из `display_text`, иначе таблица).
2. **`normalizeIngredientNameForShopping`** — добавлено **ё→е** в цепочку имени для ключа.
3. **`buildShoppingAggregationKey`** — в ключе используется **канонический сегмент** имени; для allowlist-овощей **г** и **шт.** суммируются в **г** с одним ключом `…|g`.
4. **`shoppingListDisplayNameFromAggregationKey`** — итоговое имя: словарь display + `normalizeIngredientDisplayName`.
5. **`toShoppingDisplayUnitAndAmount`** — при `aggregationUnit === "g"` и сумме **≥ 1000** — вывод в **кг** (1.1 кг).
6. **`inferDbProductCategoryFromText`** — томатная паста не попадает в **grains** из-за слова «паста».

### Purchase-friendly display layer (отдельно от canonical math)

**Файл:** `src/utils/shopping/shoppingListPurchaseDisplay.ts`

- **Внутри** по-прежнему: `amount` / `unit` в строке БД, `meta.merge_key`, `meta.aggregation_unit`, вклады для фильтра — **не меняются** этим слоем.
- **Снаружи** (карточка списка и **копирование**): `formatShoppingListPurchaseLine` строит текст по `merge_key` + правилам из `PURCHASE_RULES_BY_SEGMENT`.
- **Режимы:**
  - `pcs_approx_grams` — лук, морковь, картофель, свёкла (г/шт. из `SHOPPING_PCS_TO_GRAMS`), шампиньоны (**32 г/шт.** — только для покупки).
  - `cloves_approx_grams` — чеснок (**5 г/зубчик** — только для покупки).
  - `count_only` — яйца при `яйца|pcs` / `aggregation_unit: pcs` — только «N шт.», без `≈`.
  - иначе **weight_only / default** — как раньше (`200 г`, `1.1 кг` и т.д.).
- **Округление штук:** `Math.round(totalGrams / gramsPerPiece)`; при ненулевой массе минимум **1** шт.
- **Dual display** только если есть `merge_key` с нужным сегментом и отображаемые единицы — **г** или **кг** (перевод в сумму г для расчёта штук).
- **Не делается:** сливки «мл ≈ г», произвольные жидкости — нет надёжной плотности в слое.

**Интеграция:** `ShoppingListView` (`formatItemShort`), `shoppingListTextFormatter` (копирование; разделитель ` — `). Копирование использует **видимый** список (`filteredItems`) и **effective** количество при активном фильтре по рецептам.

## Canonical key

- Формат merge_key не изменился: **`canonicalSegment|aggregationUnit`** (например `яйца|pcs`, `лук|g`).
- `canonicalSegment` = `normalizeIngredientNameForShopping` → **ё→е** → `resolveCanonicalShoppingNameSegment` (алиасы).

## Alias-правила (high confidence)

| Варианты | Канонический сегмент |
|----------|----------------------|
| яйцо, яйца, яйцо куриное, яйца куриные | яйца |
| гречка, гречневая крупа | гречка |
| растительное масло, масло растительное | масло растительное |
| сок лимона, лимонный сок | лимонный сок |
| перец чёрный / перец черный | один ключ (ё→е) |

## Preferred units

- Овощи из allowlist при агрегации в shopping list: **г** (после PCS→г при необходимости).
- Яйца: **шт.** (без перевода в граммы в этой задаче).
- Жидкости / ложки: прежняя логика (мл для жидкостей и т.д.).

## Conversion rules (PCS→г)

- **лук, морковь, картофель:** 100 г за 1 шт. по умолчанию, если в `display_text` нет `(N г)` с иным соотношением.
- **свёкла:** 150 г за 1 шт.
- Парсинг: `(... г)` в `display_text` → грамм на штуку = `grams_in_paren / amount_шт`.
- **Чеснок** и прочие не в allowlist — **не** переводим в граммы здесь.

## Safe merge / no-merge

**Объединяем (явные правила):** см. алиасы и ё→е; лук/морковь/картофель/свёкла в г + шт. → одна строка в г.

**Сознательно не объединяем:** мягкий тофу vs твёрдый; помидор vs черри; соль vs морская соль; оливковое vs растительное масло — отдельные названия/ключи, без fuzzy.

## Файлы

- `src/utils/shopping/canonicalShoppingIngredient.ts` (+ тест)
- `src/utils/shopping/normalizeIngredientForShopping.ts`
- `src/utils/shopping/shoppingListPurchaseDisplay.ts` (+ тест)
- `src/hooks/usePlanShoppingIngredients.ts` (передаёт `display_text`)
- `src/utils/shopping/shoppingListMerge.ts`
- `src/utils/shopping/inferShoppingCategoryFromIngredient.ts`
- `src/components/favorites/ShoppingListView.tsx`
- `src/utils/shoppingListTextFormatter.ts`

## Что проверить вручную

1. Собрать список из плана (день/неделя): лук/морковь/картофель в г и в шт. дают **одну** строку в г/кг.
2. «Добавить в покупки» из рецепта: merge по `merge_key` с новой сборкой.
3. Фильтр по рецептам и пересчёт количества (source_contributions + aggregation_unit).
4. Старые строки без пересборки: легаси merge по имени+unit как раньше; полное обновление ключей — после «Собрать заново».
5. Строки с dual display (лук, морковь и т.д.) при наличии `merge_key`; без ключа — прежний формат «N г».
6. Копирование: совпадает с видимым списком (фильтры категории/поиска/рецептов/«только не купленные») и effective-количеством.

## Что не трогалось

- Схема БД, Edge Functions, запись `recipe_ingredients`.
- Общий движок категорий RPC в Postgres (кроме клиентской эвристики томатной пасты).
