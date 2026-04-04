# Toddler curated seed (12–36 мес)

## Источник

- Файл с **несколькими подряд JSON-объектами** (без запятых между ними), каждый вида `{ "seedSet": "…", "recipes": [ … ] }`.
- Пример имени: `toddler_12_36_months_snack_stage1.txt` на рабочем столе (может содержать breakfast/lunch/dinner/snack в одном файле).
- Каноническая копия в репозитории: `data/toddler-seed/toddler_12_36_months_multimeal.source.txt` (обновляйте при смене исходника; при необходимости скопировать с OneDrive Desktop: `node scripts/copy-toddler-source.mjs`).

## Сборка snapshot для импорта

```bash
npm run seed:toddler:json
```

Пишет `data/toddler-seed/toddler-catalog-recipes.json`: нормализованные шаги, теги `toddler`, **`toddler_curated_v1`**, плюс тег из `seedSet` каждого батча.

## Импорт в Supabase

Тот же механизм, что у infant seed: **service role**, переменные `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INFANT_SEED_CATALOG_USER_ID` (владелец строк каталога).

1. Применить миграции (в т.ч. индекс `recipes_seed_catalog_identity_v2` с полем `meal_type`).
2. `npm run seed:toddler:json`
3. Пробный прогон: `npm run seed:toddler:import -- --dry-run`
4. Импорт: `npm run seed:toddler:import`

Очистка только этого батча по тегу (осторожно в проде):

```bash
set SEED_CATALOG_BATCH_TAG=toddler_curated_v1
npm run seed:toddler:import -- --purge-only
```

## Идемпотентность

Поиск существующей строки: `(user_id, source, locale, norm_title, min_age_months, max_age_months, meal_type)`.  
Один и тот же **title** при **разных** `meal_type` (например завтрак и перекус) — **разные** строки; для этого в индекс включён `meal_type` (миграция `20260328120000_recipes_seed_catalog_identity_meal_type.sql`).

## Поля

Как у infant curated: `source = seed`, `locale = ru`, `trust_level = core` (curated каталог), КБЖУ, `nutrition_goals` (whitelist в `src/utils/nutritionGoals.ts`), `min_age_months` / `max_age_months` в диапазоне **12–36**.

**Деплой фронта / Edge не требуется** — только Postgres и при необходимости пуш репозитория с данными/скриптами.

---

## Child curated seed (37–96 мес)

Тот же формат файла и тот же импортёр `import-infant-seed.ts`, отдельный батч-тег **`child_37_96_curated_v1`**.

### Источник

- Пример имени: `child_37_96_months_snack_stage1.txt` на рабочем столе (четыре блока breakfast/lunch/dinner/snack).
- Копия в репо: `data/toddler-seed/child_37_96_months_multimeal.source.txt` — `npm run seed:child:copy` (скрипт `scripts/copy-child-37-96-source.mjs`, путь к OneDrive Desktop как у toddler).

### Сборка snapshot

```bash
npm run seed:child:json
```

Пишет `data/toddler-seed/child-37-96-catalog-recipes.json`: теги **`child`**, **`child_37_96_curated_v1`**, плюс `seedSet` каждого батча (`child_37_96_months_*_stage1`).

### Импорт

1. `npm run seed:child:json`
2. Пробный прогон: `npm run seed:child:import -- --dry-run`
3. Импорт: `npm run seed:child:import`

Purge только этого батча:

```bash
set SEED_CATALOG_BATCH_TAG=child_37_96_curated_v1
npm run seed:child:import -- --purge-only
```

Поля в БД: `min_age_months` / `max_age_months` в диапазоне **37–96** (как в JSON).

Билдер: `scripts/toddler-seed/buildToddlerCatalogRecipes.mjs` — профили `toddler`, `child_37_96`, `child_97_216` (`buildCuratedSeedCatalogFromFileContent`); взрослый набор — `buildAdult2161200CatalogFromFileContent`.

---

## Child curated seed (97–216 мес, ~8–18 лет)

Тот же формат файла и импортёр `import-infant-seed.ts`, батч-тег **`child_97_216_curated_v1`**.

### Источник

- Пример имени: `child_97_216_months_snack_stage1.txt` на рабочем столе.
- Копия в репо: `data/toddler-seed/child_97_216_months_multimeal.source.txt` — `npm run seed:child:teen:copy` (`scripts/copy-child-97-216-source.mjs`).

### Сборка snapshot

```bash
npm run seed:child:teen:json
```

Пишет `data/toddler-seed/child-97-216-catalog-recipes.json`: теги **`child`**, **`child_97_216_curated_v1`**, плюс `seedSet` (`child_97_216_months_*_stage1`).

### Импорт

1. `npm run seed:child:teen:json`
2. Пробный прогон: `npm run seed:child:teen:import -- --dry-run`
3. Импорт: `npm run seed:child:teen:import`

Purge только этого батча:

```bash
set SEED_CATALOG_BATCH_TAG=child_97_216_curated_v1
npm run seed:child:teen:import -- --purge-only
```

Поля в БД: `min_age_months` / `max_age_months` в диапазоне **97–216** (как в JSON).

---

## Adult curated seed (216–1200 мес)

Тот же импортёр `import-infant-seed.ts`, батч-тег **`adult_216_1200_curated_v1`**. Формат исходника **отличается** от toddler/child: несколько подряд **JSON-массивов** `[ {...}, ... ]` (без обёртки `{ seedSet, recipes }`).

### Источник

- Пример имени: `adult_216_1200_months_snack_stage1.txt` на рабочем столе.
- Копия в репо: `data/toddler-seed/adult_216_1200_months_multimeal.source.txt` — `npm run seed:adult:copy` (`scripts/copy-adult-216-1200-source.mjs`).

### Сборка snapshot

```bash
npm run seed:adult:json
```

Пишет `data/toddler-seed/adult-216-1200-catalog-recipes.json`: теги **`adult`**, **`adult_216_1200_curated_v1`**, плюс синтетический тег батча `adult_216_1200_months_{meal_type}_stage1`. Ингредиенты с `amount` в виде строки (например «50 г») попадают в `display_text`; при наличии объекта `nutrition` поля КБЖУ маппятся с `kcal_per_serving` / `protein` / `fat` / `carbs`. Для обеда `is_soup: true` выставляется по подстрокам в названии (суп, борщ и т.п.), если в JSON не задано явно. Поле `nutrition_goals` в сиде может содержать короткие алиасы (`energy`, `satiety`, `protein`, `lightness` и т.д.) — при сборке JSON они приводятся к whitelist БД (`scripts/toddler-seed/nutritionGoalsDb.mjs`), иначе нарушается `recipes_nutrition_goals_check`.

### Импорт

1. `npm run seed:adult:json`
2. Пробный прогон: `npm run seed:adult:import -- --dry-run`
3. Импорт: `npm run seed:adult:import`

Purge только этого батча:

```bash
set SEED_CATALOG_BATCH_TAG=adult_216_1200_curated_v1
npm run seed:adult:import -- --purge-only
```

Поля в БД: `min_age_months` / `max_age_months` в диапазоне **216–1200** (как в JSON).

Билдер: `scripts/toddler-seed/buildToddlerCatalogRecipes.mjs` — `buildAdult2161200CatalogFromFileContent`, парсер массивов `parseMultiJsonTopLevelArrays` в `scripts/toddler-seed/parseMultiJsonObjects.mjs`.
