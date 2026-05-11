# Repair: канон для бытовых единиц (зубчик, веточка, ломтик)

Когда `backfill:ingredient-canonical` не может распарсить строку (`failed_parse_display_text`), часто в `display_text` остаются только бытовые меры без «`= N г`». Для списка покупок и масштаба порций нужны **`canonical_amount` / `canonical_unit`**.

Скрипт **`npm run repair:household-canonical`**:

1. Для каждой строки без полного канона в выбранных рецептах сначала вызывает тот же **`evaluateCanonicalIngredientRow`**, что и canonical backfill.
2. Если не получилось — применяет **эвристики** из `shared/ingredientHouseholdCanonicalHeuristic.ts` (якоря в комментариях в файле).
3. Опционально **`--fix-categories`**: чеснок → `spices`, сельдерей при ошибочном `fish` → `vegetables`.
4. Для эвристик в граммах дописывает к `display_text` суффикс **` = N г`**, если в строке ещё нет `=`.

## Запуск

Требуются **`SUPABASE_URL`** (или `VITE_SUPABASE_URL`) и **`SUPABASE_SERVICE_ROLE_KEY`** в `.env` / `.env.local`.

```bash
# пробный прогон по всему пулу (seed, starter, manual, week_ai, chat_ai)
npm run repair:household-canonical -- --dry-run --pool --verbose

# запись в БД
npm run repair:household-canonical -- --pool

# только chat_ai
npm run repair:household-canonical -- --dry-run --recipe-source=chat_ai

# с правкой категорий
npm run repair:household-canonical -- --pool --fix-categories
```

После успешной записи:

```bash
npm run backfill:ingredient-dual -- --dry-run --pool
npm run backfill:ingredient-dual -- --pool
```

## Ограничения

- Якоря граммов — **оценки** для UX/агрегации, не для медицинских норм.
- Строки с полностью свободным текстом без паттернов (редкие продукты) скрипт **не тронет** — правки вручную или правка `display_text` и повторный прогон.

См. также: `docs/dev/RECIPE_INGREDIENT_DUAL_MEASUREMENT.md`.
