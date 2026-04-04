# Двойной формат ингредиентов (dual measurement)

## Назначение

Показывать пользователю бытовую меру **рядом** с каноническими граммами/мл там, где голые «г» плохо читаются (овощи, чеснок, ложки масла), **без** фейковой точности и без dual для фарша/круп/мяса по весу.

## Source of truth

- **Порции, агрегация, список покупок:** только `canonical_amount` + `canonical_unit` (g/ml).
- **UX:** `measurement_mode`, `display_amount`, `display_unit`, `display_quantity_text`, плюс `display_text` как fallback и для переводов.

## Код

- **Общая логика:** `shared/ingredientMeasurementDisplay.ts` — `shouldUseDualMeasurement`, `enrichIngredientMeasurementForSave`, `formatIngredientMeasurement`, разбор бытовой меры из текста.
- **Категория по тексту (как в БД):** `shared/dbProductCategoryFromText.ts` (клиент + Edge + скрипты).
- **Сохранение в RPC:** `src/utils/recipeCanonical.ts` и `supabase/functions/_shared/recipeCanonical.ts` вызывают enrich перед `create_recipe_with_steps`.
- **UI:** `src/types/recipe.ts` (`ingredientDisplayLabel`, `scaleIngredientDisplay`) делегируют в `formatIngredientMeasurement`; масштаб порций в плане — `src/types/ingredientOverrides.ts`.

## Backfill (этап 3)

Идемпотентный скрипт (service role):

```bash
npm run backfill:ingredient-dual -- --dry-run
npm run backfill:ingredient-dual
```

Обновляет только строки с `measurement_mode = canonical_only`, если enrich возвращает `dual`.

## Деплой

1. Применить миграцию `20260404120000_recipe_ingredients_dual_measurement.sql` (Supabase).
2. Задеплоить Edge `deepseek-chat`, если сохранение рецепта идёт с Edge (`npm run supabase:deploy:chat` или аналог).
3. Фронт — коммит и push на GitHub Pages.

Переводы ML-7: по-прежнему `recipe_ingredient_translations.display_text`; для нерусских локалей можно переводить целую строку отображения.
