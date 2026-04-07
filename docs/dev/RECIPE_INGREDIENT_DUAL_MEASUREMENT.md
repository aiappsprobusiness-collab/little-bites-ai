# Двойной формат ингредиентов (dual measurement)

## Назначение

Показывать бытовую меру **рядом** с каноническими граммами/мл **только** когда household-представление **надёжное, читаемое и улучшает UX**. Если нет — честный `canonical_only` (например, «150 г» для крупных овощей без явного «шт» в рецепте). Решение **не** строится на whitelist названий продуктов (тыква/морковь/…).

## Source of truth

- **Порции, агрегация, список покупок, масштаб:** опираются на `canonical_amount` + `canonical_unit`. Порции **не** считаются по `display_text`. В БД (CHECK после миграций) для канона допустимы **`g`, `ml`, `pcs`, `tsp`, `tbsp`** и промежуточные **`kg`/`l`** при записи через RPC с нормализацией в `g`/`ml`; dual measurement engine для граммовых путей ожидает прежде всего **`g`/`ml`**.
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
| `shared/ingredientDualBackfill.ts` | `evaluateDualMeasurementBackfill`, `maybeUpgradeIngredientMeasurement` — **тот же** enrich/engine/gate, без дублирования правил; для backfill и точечного lazy-upgrade |
| `shared/ingredientCanonicalResolve.ts` | Нормализация единиц и расчёт канона как SQL `normalize_ingredient_unit` + `ingredient_canonical` (без whitelist продуктов) |
| `shared/ingredientCanonicalForEnrich.ts` | **До enrich:** приведение строки количества / `amount`+`unit` к **`g`/`ml`**, чтобы `enrichIngredientMeasurementForSave` и движок dual не получали пустой канон, пока SQL ещё не отработал (`buildOneIngredient`, `canonicalizeRecipePayload` на клиенте и Edge) |
| `shared/ingredientCanonicalBackfill.ts` | `evaluateCanonicalIngredientRow` — решение safe canonical backfill (только канон, не dual) |

- **Категория по тексту (как в БД):** `shared/dbProductCategoryFromText.ts`.
- **Сохранение в RPC:** `src/utils/recipeCanonical.ts` и `supabase/functions/_shared/recipeCanonical.ts` — enrich перед `create_recipe_with_steps`.
- **UI:** `src/types/recipe.ts` (`ingredientDisplayLabel`, `scaleIngredientDisplay`) → `formatIngredientMeasurement`; оверрайды — `src/types/ingredientOverrides.ts`.

### Ограничения без whitelist продуктов

Допустимы: словари **типов** бытовых единиц (зубчик, ложка), узкие **стемы** для объектной семантики (чеснок → зубчик, яйцо → шт.), **regex-блок** инференса «шт» из граммов для мяса/рыбы/молочки/круп по **категории + типичным подстрокам** (фарш, филе, крупы…), чтобы не выводить dual для весовых форм. Это не каталог «тыква/кабачок».

## Canonical backfill (перед dual)

**Зачем:** dual backfill и enrich требуют **заполненного канона**, если из него считается математика. Исторические **seed**-строки часто имели только `amount`/`unit`/`display_text` без `canonical_*`.

**Принцип:** отдельный этап — `scripts/backfill-recipe-ingredient-canonical.ts` + `evaluateCanonicalIngredientRow`. Правила совпадают с PostgreSQL **`ingredient_canonical`** (миграция `20260220120000_...`). Парсинг: сначала **`amount` + `unit`**, иначе хвост **`display_text`** после «—» (как `parse_ingredient_display_text`). Без угадывания веса «1 моркови»; неоднозначные единицы → skip.

**Команды:**

```bash
npm run backfill:ingredient-canonical -- --diagnose-only --recipe-source=seed
npm run backfill:ingredient-canonical -- --dry-run --recipe-source=seed --limit=500
npm run backfill:ingredient-canonical -- --recipe-source=seed --limit=500
# только строки, где оба канона NULL:
npm run backfill:ingredient-canonical -- --dry-run --only-missing-canonical --recipe-source=seed
# фильтр по trust_level (опционально):
npm run backfill:ingredient-canonical -- --diagnose-only --recipe-source=seed --trust-level=core
```

**Рекомендуемый порядок rollout:** `canonical --diagnose-only` → `canonical --dry-run` → ограниченная запись → `canonical` полный при необходимости → затем **`backfill:ingredient-dual`** (dry-run → write).

**Импорт сида:** `scripts/import-infant-seed.ts` (tsx) вызывает **`fillCanonicalForSeedIngredient`**: новые вставки получают канон из JSON или из `amount`/`unit`/`display_text`, если в JSON канон не задан.

---

## Backfill dual (безопасный, консервативный)

**Принцип:** backfill **не** вводит отдельных product-whitelist правил. Решение = `evaluateDualMeasurementBackfill` → внутри **`enrichIngredientMeasurementForSave`** (engine + quality gate), как при сохранении рецепта. Математика по-прежнему только из `canonical_*`; для пересчёта порций `display_text` не парсится.

### Что обрабатывается

- Строки с **заполненным валидным** каноном (`canonical_amount` / `canonical_unit` по правилам скрипта dual backfill: не NULL, режим `measurement_mode` и т.д.), выборка по `recipe_id` из `recipes` при фильтре по `source`.
- По умолчанию: `measurement_mode` ∈ {`canonical_only`, `dual`}. Для **`dual`**: если **`validatePersistedDualMeasurement`** проходит и household читаемый — строка **не меняется** (`already_valid_dual`). Если dual **битый** — скрипт может **перезаписать** display-слой, если enrich снова даёт качественный dual (repair).
- **`display_only`** не трогаем.
- **`canonical_only`** + `display_text`, похожий на **свободную инструкцию** (длинный текст без «— N г/мл» и т.п.) — **пропуск** (`skipped_likely_custom_display_text`), чтобы не затирать осознанные подписи.
- «По вкусу» / «для подачи» — пропуск (`skipped_special_display`).

### Что остаётся `canonical_only` (норма)

- Нет кандидата или enrich не выдаёт dual (`no_dual_from_engine` — сюда же относится отсев quality gate в engine).
- Кастомный `display_text` (см. выше).
- Нет имени, битый канон, не g/ml.

### Идемпотентность

Повторный прогон: уже валидный dual не обновляется; строки без кандидата снова пропускаются.

### Команды (service role: `SUPABASE_SERVICE_ROLE_KEY`; URL: `SUPABASE_URL` или `VITE_SUPABASE_URL`)

Скрипт сам подгружает корневые **`.env`** и **`.env.local`** (если переменные ещё не заданы в shell).

**`--pool`:** то же, что `--recipe-source=seed,starter,manual,week_ai,chat_ai` — полный набор источников **общего пула** (раздаётся всем авторизованным пользователям при подборе меню). Для универсального каталога это предпочтительный режим.

**`--recipe-source`:** сначала читаются `recipes.id` с нужным `source`, затем ингредиенты по `recipe_id` (два шага, без ненадёжного фильтра по вложенной таблице в одном запросе). Если **`scanned_rows=0`**, смотрите предупреждения и блок **`[diag]`** в консоли. Типичный случай для **seed**: рецепты есть, но у ингредиентов **не заполнены `canonical_amount` / `canonical_unit`** (в JSON сида или при импорте) — тогда dual backfill нечего обрабатывать, пока канон не появится (обновление сид-файлов + импорт или отдельная нормализация).

```bash
# 1) Весь общий пул (универсальные рецепты для всех пользователей: seed, starter, manual, week_ai, chat_ai — как RLS и generate-plan)
npm run backfill:ingredient-dual -- --dry-run --pool
npm run backfill:ingredient-dual -- --pool

# 2) Dry-run по всем строкам ингредиентов в БД (в т.ч. user_custom и прочие source) — шире, чем пул
npm run backfill:ingredient-dual -- --dry-run
npm run backfill:ingredient-dual -- --dry-run --verbose --limit=100

# 3) Порциями (с --pool — только в пределах пула)
npm run backfill:ingredient-dual -- --dry-run --pool --offset=0 --limit=500
npm run backfill:ingredient-dual -- --pool --offset=0 --limit=500

# 4) Узко по source (эквивалент части пула, если нужен только каталог)
npm run backfill:ingredient-dual -- --dry-run --recipe-source=seed
npm run backfill:ingredient-dual -- --dry-run --recipe-source=seed,manual

# 5) Один рецепт
npm run backfill:ingredient-dual -- --dry-run --recipe-id=<uuid>

# 6) Опционально: только рецепты одного user_id в БД (каталог обычно на системном владельце — для пула удобнее --pool)
npm run backfill:ingredient-dual -- --dry-run --user-id=<uuid>

# 7) Не чинить битый dual — только canonical_only
npm run backfill:ingredient-dual -- --dry-run --only-canonical
```

**Рекомендованный rollout:** dry-run → небольшие `--limit` → разбор summary → полный прогон без лимита только после проверки.

**Переводы ML-7:** скрипт меняет базовые поля `recipe_ingredients` (в т.ч. `display_text` на ru). Оверлей `recipe_ingredient_translations.display_text` для других локалей может разойтись до следующего прогона translate-recipe / ручного обновления — учитывать при QA.

### Lazy-upgrade (опционально)

`maybeUpgradeIngredientMeasurement(row)` / `evaluateDualMeasurementBackfill` можно вызывать при **сохранении** пользовательского рецепта, **импорте** или **нормализации** payload: если сейчас `canonical_only`, а engine даёт безопасный dual — применить тот же patch, что и backfill. Не подключать автоматически на каждый GET; достаточно точек «запись / нормализация». Скрипт: `scripts/backfill-recipe-ingredient-dual-display.ts`.

## Деплой

1. Миграции БД под dual уже применены (`20260404120000_recipe_ingredients_dual_measurement.sql`); при **только** правках TS логики новая миграция не требуется.
2. Если затронут Edge (общий `shared/` подтягивается в bundle) — задеплоить функцию чата / recipe path: `npm run supabase:deploy:chat` или аналог.
3. Фронт — коммит и push (GitHub Pages).

Переводы ML-7: по-прежнему `recipe_ingredient_translations.display_text`; для нерусских локалей можно переводить целую строку отображения.
