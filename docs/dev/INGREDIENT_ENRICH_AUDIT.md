# Аудит: ингредиенты до `create_recipe_with_steps` и `display_unit`

Дата аудита: 2026-04-04. Цель: понять, почему у новых рецептов часто `display_unit = NULL`, без внедрения новой нормализации.

---

## 1. Где формируется ingredient payload

### 1.1 Путь чата (Edge): `supabase/functions/deepseek-chat/index.ts`

После валидации JSON рецепта (`recipeSchema.ts` / `parseAndValidateRecipeJsonFromString`):

- **От модели (Zod `IngredientSchema`):** `name`, опционально `amount` (строка), `displayText`, опционально `canonical: { amount, unit }` где `unit` только **`g` | `ml`**, `substitute`.
- **Нет в контракте AI:** отдельных полей `display_unit`, `display_amount`, `measurement_mode`, плоских `canonical_amount` / `canonical_unit` (они появляются только после сборки на Edge).

Сборка перед `canonicalizeRecipePayload`: функция **`buildOneIngredient`** (внутри `index.ts`):

- `display_text` ← `displayText` или «`name` — `amount`».
- `amount` в payload — **только чисто числовая строка** (`/^\d+\.?\d*$/`), иначе `null` (например «100 г» не попадёт в `amount` как число).
- `canonical_amount` / `canonical_unit` ← либо объект `canonical` от LLM, либо результат **`parseAmountToCanonical(amountStr)`** (тот же файл).

**Важно:** `parseAmountToCanonical` возвращает только **`g` или `ml`**. Для строк вида «2 шт.», «1 яйцо» без явных г/мл он возвращает **`null`** → в `ingredientsPayload` канон до RPC часто пустой, хотя в БД RPC потом сможет вычислить канон из `amount`/`unit` через `ingredient_canonical`.

### 1.2 Путь клиента: `src/hooks/useRecipes.tsx`

`createRecipe` передаёт в `canonicalizeRecipePayload` объекты с полями из уже нормализованного рецепта:

- `name`, `amount`, `unit`, `display_text`, `substitute`, `canonical_amount`, `canonical_unit`, `order_index`, `category`.
- Явных `display_*` / `measurement_mode` в маппинге **нет** — они полагаются на enrich внутри `canonicalizeRecipePayload`.

### 1.3 Общий слой перед RPC: `canonicalizeRecipePayload`

Используется в двух местах:

| Место | Файл |
|--------|------|
| Клиент | `src/utils/recipeCanonical.ts` |
| Edge | `supabase/functions/_shared/recipeCanonical.ts` |

На выходе каждый элемент `ingredients[]` содержит: `name`, `display_text`, `amount`, `unit`, `substitute`, `canonical_amount`, `canonical_unit`, `order_index`, `category`, **`display_amount`**, **`display_unit`**, **`display_quantity_text`**, **`measurement_mode`**.

---

## 2. Enrich / normalize слой

### 2.1 Основная функция сохранения

- **`enrichIngredientMeasurementForSave`** — `shared/ingredientMeasurementDisplay.ts`  
  Вызывается **из обоих** `canonicalizeRecipePayload` (клиент и Edge) для каждого ингредиента.

### 2.2 Зависимости enrich

- **`resolveHouseholdCandidateForSave`**, **`parseExplicitHouseholdFromText`**, **`validatePersistedDualMeasurement`** — `shared/ingredientMeasurementEngine.ts`
- Quality gate: **`scaledHouseholdStaysReadableForDual`** и др. — `shared/ingredientMeasurementQuality.ts`

### 2.3 Другие «normalize*» (другой контекст)

- **`normalizeIngredientsFallback`**, **`normalizeIngredientsFallbackOnlySpices`**, **`buildIngredientPayloadItem`** — `supabase/functions/_shared/planValidation.ts` — используются в **плане / валидации плана**, не в цепочке `deepseek-chat` → `create_recipe_with_steps`.
- **`normalizeIngredients`** в `src/components/favorites/FavoriteRecipeSheet.tsx` — только UI разбора избранного, не сохранение в пул.

Отдельного глобального **`normalizeIngredients`** для чата нет; нормализация для сохранения — это **`canonicalizeRecipePayload` + enrich**.

---

## 3. Что enrich реально заполняет

Логика **`enrichIngredientMeasurementForSave`** (упрощённо):

1. Если пришёл валидный режим **`dual`** с уже заданными `display_amount` / `display_unit` и они проходят **`validatePersistedDualMeasurement`** при каноне **`g`/`ml`** → возвращает эти display-поля и пересобирает `display_text`.
2. Иначе, если **нет** валидного канона: `canonical_amount > 0` и **`canonical_unit` ∈ {`g`,`ml`}** (строго, в нижнем регистре после trim) → иначе сразу  
   `display_amount/display_unit/display_quantity_text = null`, `measurement_mode = 'canonical_only'`.
3. При валидном `g`/`ml` вызывается **`resolveHouseholdCandidateForSave`**. Если кандидат **есть** → `dual`, заполняются `display_amount`, `display_unit`, `display_quantity_text`, обновляется `display_text`. Если кандидата **нет** → снова `canonical_only` и **все display_* = null**.

Итог: **`display_unit` заполняется только в режиме `dual`**, и только при выполнении условий по канону `g`/`ml` и кандидату (или явному валидному dual из payload).

---

## 4. Потеря данных по цепочке до БД

### 4.1 Приходит ли `display_unit` из enrich

Да, **когда** enrich выбирает `dual`. Во всех остальных случаях enrich **намеренно** возвращает `display_unit: null`.

### 4.2 Передаётся ли в `create_recipe_with_steps`

Да: поля попадают в `payload.ingredients[]` из результата `canonicalizeRecipePayload` и читаются в RPC из JSON (`ing->>'display_unit'` и т.д., см. миграцию `20260404120000_recipe_ingredients_dual_measurement.sql`).

### 4.3 Сохраняется ли в `recipe_ingredients`

Да: `INSERT` пишет `display_amount`, `display_unit`, `display_quantity_text`, `measurement_mode` из финальных переменных; если в payload они пустые, в БД остаётся **NULL** / `canonical_only`.

### 4.4 Критический разрыв: RPC vs enrich

В RPC, если в элементе payload **нет** валидной пары `canonical_amount` + `canonical_unit`, но есть `final_amount` / `final_unit`, вызывается **`ingredient_canonical(final_amount, final_unit)`** — канон в строке таблицы может появиться **после** того, как на TS/Edge enrich уже отработал с **`canonical_* = null`**.

Enrich **не видит** результат `ingredient_canonical` и **не заполняет** display-слой за SQL. Поэтому возможна ситуация: в БД **`canonical_amount` / `canonical_unit` заполнены**, а **`display_unit` остаётся NULL**.

---

## 5. Схема БД (кратко)

Таблица **`public.recipe_ingredients`** (см. `docs/database/DATABASE_SCHEMA.md`, миграция `20260404120000_recipe_ingredients_dual_measurement.sql`):

| Поле | Назначение |
|------|------------|
| `canonical_amount`, `canonical_unit` | Канон для математики (g/ml/pcs/tsp/tbsp после нормализации в RPC) |
| `display_amount`, `display_unit`, `display_quantity_text` | UX-слой, NULL если не dual / не передано |
| `measurement_mode` | `canonical_only` \| `dual` \| `display_only`, NOT NULL, default `canonical_only` |

Ограничения: CHECK на `measurement_mode`. Отдельного DEFAULT для `display_unit` нет (NULL допустим). Триггеров, которые бы вычисляли `display_unit` при INSERT, в указанной миграции нет — только логика внутри тела `create_recipe_with_steps`.

---

## 6. Вывод (диагноз)

**Ответ: в основном E (комбинация), с элементами C и D.**

- **Не A:** слой enrich **есть** — `enrichIngredientMeasurementForSave` в `shared/ingredientMeasurementDisplay.ts`.
- **Не B:** он **вызывается** при каждом сохранении через **`canonicalizeRecipePayload`** (клиент и Edge).
- **C (часто):** enrich **вызывается**, но **`display_unit` остаётся NULL**, если нет условий для `dual`: канон не `g`/`ml`, или кандидат бытовой меры не найден / не прошёл gate, или явный dual невалиден.
- **D (системно для «шт» и части строк):** канон может быть **досчитан только в RPC** (`ingredient_canonical`), тогда как enrich отработал с **пустым `canonical_*` в payload** → **`display_unit` в payload не появляется** и в БД остаётся NULL, хотя `canonical_*` в строке могут быть заполнены.

**Где «ломается» `display_unit`:** не на этапе INSERT и не из‑за отбрасывания поля RPC, а **раньше**: при вычислении payload на TS/Edge enrich **по дизайну** не ставит dual без `g`/`ml` в входных `canonical_*`, плюс **рассинхрон** с SQL-нормализацией канона (`parseAmountToCanonical` / `buildOneIngredient` не покрывают все случаи, которые закрывает `ingredient_canonical`).

### 6.1 Исправление рассинхрона (после аудита)

В **`shared/ingredientCanonicalForEnrich.ts`**: локальный резолв **`g`/`ml`** до `enrichIngredientMeasurementForSave` — порт **`normalize_ingredient_unit`**, разбор «число + хвост» (`parseSimpleNumericQuantity`), конвертация **tsp/tbsp → ml**, **pcs → g** (грубые эвристики: яйцо, банан, зубчик, иначе ~90 g/шт), плюс перенесённый **`parseAmountToCanonical`**.

- **`buildOneIngredient`** (deepseek-chat): после LLM `canonical` вызывает **`resolveCanonicalForEnrichInput`**; числовое поле `amount` в payload — счётчик из той же строки (например `"2"` для «2 шт.»), а не канонические граммы.
- **`canonicalizeRecipePayload`** (клиент и Edge): **`resolveCanonicalForEnrichFromIngredient`** + в payload уходят уже **resolved** `canonical_*`; лог **`CANONICAL_BEFORE_ENRICH`** непосредственно перед enrich.

RPC по-прежнему может нормализовать канон иначе (например хранить `pcs`); цель фикса — **согласовать вход enrich** с тем, что возможно вывести из строки количества **в g/ml**.

---

## 7. Диагностика в рантайме

Перед вызовом RPC в лог пишется:

```text
FINAL_INGREDIENTS_PAYLOAD
```

с массивом **`ingredients` уже после `canonicalizeRecipePayload`** (то, что реально уходит в `create_recipe_with_steps`):

- клиент: `src/hooks/useRecipes.tsx`
- Edge: `supabase/functions/deepseek-chat/index.ts`

По логу видно финальные `display_unit`, `measurement_mode`, `canonical_*` в RPC-payload.

Также **`CANONICAL_BEFORE_ENRICH`** — объект ингредиента с полями `name`, `display_text`, `amount`, `unit`, `canonical_amount`, `canonical_unit` **сразу перед** `enrichIngredientMeasurementForSave` в `recipeCanonical.ts` (клиент и Edge `_shared`).

---

## Ссылки на код

- Сборка ингредиентов чата: `supabase/functions/deepseek-chat/index.ts` (`buildOneIngredient` + `shared/ingredientCanonicalForEnrich.ts`)
- Канонический payload: `src/utils/recipeCanonical.ts`, `supabase/functions/_shared/recipeCanonical.ts`
- Enrich: `shared/ingredientMeasurementDisplay.ts` (`enrichIngredientMeasurementForSave`)
- RPC: `supabase/migrations/20260404120000_recipe_ingredients_dual_measurement.sql` (`create_recipe_with_steps`)
- Контракт AI: `supabase/functions/deepseek-chat/recipeSchema.ts` (`IngredientSchema`)
