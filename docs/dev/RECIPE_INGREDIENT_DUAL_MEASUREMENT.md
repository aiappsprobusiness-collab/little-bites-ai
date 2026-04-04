# Двойной формат ингредиентов (dual measurement)

## Назначение

Показывать бытовую меру **рядом** с каноническими граммами/мл **только** когда household-представление **надёжное, читаемое и улучшает UX**. Если нет — честный `canonical_only` (например, «150 г» для крупных овощей без явного «шт» в рецепте). Решение **не** строится на whitelist названий продуктов (тыква/морковь/…).

## Source of truth

- **Порции, агрегация, список покупок, масштаб:** только `canonical_amount` + `canonical_unit` (g/ml). Порции **не** считаются по `display_text`.
- **UX:** `measurement_mode`, `display_amount`, `display_unit`, `display_quantity_text`, плюс `display_text` как fallback и для переводов.

## Канонический decision flow

1. **Канон** — единственная база для математики.
2. **Кандидат бытовой меры** — `shared/ingredientMeasurementEngine.ts`: приоритет **явный household** из текста (`parseExplicitHouseholdFromText`: зубчик, ч. л., ст. л., шт., стакан, ломтик, яйцо, банка/упаковка, щепотка), затем **инференс по классу** (категория + узкие семантики: чеснок → зубчик, яйцо → шт., специи → ч. л., жиры → ст. л., овощи/фрукты → «шт» только при устойчивом совпадении с лестницей якорных масс).
3. **Согласование с каноном** — `verifyExplicitAgainstCanonical` / якоря для «шт».
4. **Quality gate** — `shared/ingredientMeasurementQuality.ts`: `passesDualMeasurementQualityGate` (читаемость дроби, минимальная надёжность, правила для `piece` без явного ввода).
5. **Итог:** `dual` или `canonical_only`. Отсутствие dual — норма, не ошибка.

### Масштаб порций (render-time)

`formatIngredientMeasurement` в `shared/ingredientMeasurementDisplay.ts`: если `measurement_mode === dual`, но `display_amount × servingMultiplier` перестаёт быть «читаемой» бытовой дробью, показывается **временный** fallback только на канон (без «= … household»), без смены записи в БД. См. `scaledHouseholdStaysReadableForDual`.

### Уже сохранённый dual

Перед принятием входящего `measurement_mode: dual` из payload вызывается **`validatePersistedDualMeasurement`** (engine): снова проверка согласованности с каноном + quality gate. Невалидное dual понижается при enrich до пересчёта или `canonical_only`.

## Код (модули)

| Модуль | Роль |
|--------|------|
| `shared/ingredientMeasurementQuality.ts` | `isHumanReadableHouseholdQuantity`, `passesDualMeasurementQualityGate`, `scaledHouseholdStaysReadableForDual` |
| `shared/ingredientMeasurementEngine.ts` | Парсинг explicit household, инференс, `resolveHouseholdCandidateForSave`, `validatePersistedDualMeasurement`, `shouldUseDualMeasurement` (по `IngredientProbeInput`) |
| `shared/ingredientMeasurementDisplay.ts` | `enrichIngredientMeasurementForSave`, `formatIngredientMeasurement`, `shouldUseDualMeasurement` (обёртка под `IngredientMeasurementInput`), склонение «зубчик», локализация чисел |

- **Категория по тексту (как в БД):** `shared/dbProductCategoryFromText.ts`.
- **Сохранение в RPC:** `src/utils/recipeCanonical.ts` и `supabase/functions/_shared/recipeCanonical.ts` — enrich перед `create_recipe_with_steps`.
- **UI:** `src/types/recipe.ts` (`ingredientDisplayLabel`, `scaleIngredientDisplay`) → `formatIngredientMeasurement`; оверрайды — `src/types/ingredientOverrides.ts`.

### Ограничения без whitelist продуктов

Допустимы: словари **типов** бытовых единиц (зубчик, ложка), узкие **стемы** для объектной семантики (чеснок → зубчик, яйцо → шт.), **regex-блок** инференса «шт» из граммов для мяса/рыбы/молочки/круп по **категории + типичным подстрокам** (фарш, филе, крупы…), чтобы не выводить dual для весовых форм. Это не каталог «тыква/кабачок».

## Backfill (этап 3)

Идемпотентный скрипт (service role):

```bash
npm run backfill:ingredient-dual -- --dry-run
npm run backfill:ingredient-dual
```

Обновляет только строки с `measurement_mode = canonical_only`, если enrich возвращает `dual`. После смены правил enrich имеет смысл прогнать backfill снова (без обязательного повторного деплоя Edge, если менялся только фронт/общий shared — скрипт локальный).

## Деплой

1. Миграции БД под dual уже применены (`20260404120000_recipe_ingredients_dual_measurement.sql`); при **только** правках TS логики новая миграция не требуется.
2. Если затронут Edge (общий `shared/` подтягивается в bundle) — задеплоить функцию чата / recipe path: `npm run supabase:deploy:chat` или аналог.
3. Фронт — коммит и push (GitHub Pages).

Переводы ML-7: по-прежнему `recipe_ingredient_translations.display_text`; для нерусских локалей можно переводить целую строку отображения.
