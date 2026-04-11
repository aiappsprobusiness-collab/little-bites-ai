# Infant curated seed-пул (4–6, 7–8 и 9–11 мес)

## Что в репозитории

- **Исходные наборы (source of truth):**  
  - `data/infant-seed/infant_4_6_months_stage1.json`  
  - `data/infant-seed/infant_7_8_months_stage2.json`  
  - `data/infant-seed/infant_9_11_months_stage3.json`  
  Curated тексты, ингредиенты, шаги, КБЖУ, теги — не из программного генератора «заглушек».

- **Сборка:** `scripts/infant-seed/buildInfantSeedRecipes.mjs` — читает три JSON (4–6, 7–8, 9–11), нормализует шаги (строки → `{ step_number, instruction }`), добавляет batch-тег, валидирует поля.

- **Снимок для импорта:** `data/infant-seed-recipes.json` — пересборка: `npm run seed:infant:json` (сводный curated набор 4–6, 7–8, 9–11).

- **Импорт:** `scripts/import-infant-seed.ts` (запуск через `npm run seed:infant:import` или `npx tsx --tsconfig tsconfig.scripts.json scripts/import-infant-seed.ts`) — **service role**, не `create_recipe_with_steps` (там `user_id` = `auth.uid()`). Шаги в JSON могут быть **строками** (как в `data/infant-seed-recipes.json`) или объектами `{ step_number, instruction }`: импортёр нормализует оба варианта в `recipe_steps.instruction`. При вставке ингредиентов заполняется канон (`canonical_amount` / `canonical_unit`), если его можно вывести из JSON или из `amount`/`unit`/`display_text` (см. `shared/ingredientCanonicalResolve.ts`).

- **Поля пула:** `source = seed`, `locale = ru`, `trust_level = core` (вручную curated каталог; отдельно от **trusted**, которое означает поведенчески подтверждённый рецепт), `nutrition_goals = []` (отбор в плане для младенцев — по `min_age_months` / `max_age_months` и правилам generate-plan, не по целям). Текст «подсказки для мамы» хранится в `chef_advice`. На клиенте для infant-рецептов этот контент подписывается как **«Подсказка для мамы»**, а `description` берётся напрямую из `recipes.description` (про текстуру/этап прикорма). Группа 9–11 мес остаётся в infant UX-path (<12), но допускает более плотные текстуры, мягкие кусочки и finger food в curated-пуле.

- **Идемпотентность:** повторный запуск ищет строку по `(user_id, source, locale, norm_title, min_age_months, max_age_months, meal_type)` и делает **UPDATE** + замену ингредиентов/шагов, иначе **INSERT**. В БД: частичный уникальный индекс `recipes_seed_catalog_identity_v2` (миграция `20260328120000_recipes_seed_catalog_identity_meal_type.sql`; v1 заменён).
- **Другой JSON-файл:** `npx tsx --tsconfig tsconfig.scripts.json scripts/import-infant-seed.ts --file=path/to/bundle.json` или `SEED_CATALOG_JSON=data/...`. Для toddler, child 37–96 / 97–216 и adult 216–1200 мес: **`docs/dev/toddler-seed-import.md`**, `npm run seed:toddler:import` / `seed:child:import` / `seed:child:teen:import` / `seed:adult:import`.

Тег батча в `tags`: **`infant_curated_v2`** (удаление импортированного батча: `--purge`). Старый тег **`infant_curated_batch1`** (программная генерация 180 рецептов) при необходимости чистите отдельно: `INFANT_SEED_BATCH_TAG=infant_curated_batch1 npx tsx --tsconfig tsconfig.scripts.json scripts/import-infant-seed.ts --purge-only` (Windows: `set INFANT_SEED_BATCH_TAG=infant_curated_batch1` и та же команда `tsx`).

## Импорт в БД

1. В Supabase выберите пользователя-«владельца» строк пула (`auth.users.id`).
2. В `.env` (без префикса `VITE_`):

   - `SUPABASE_URL`
   - **`SUPABASE_SERVICE_ROLE_KEY`** — только **service_role** (Dashboard → Settings → API). Не `anon` / `VITE_SUPABASE_ANON_KEY`.
   - `INFANT_SEED_CATALOG_USER_ID=<uuid>`

3. Применить миграции (в т.ч. индекс): `supabase db push` или свой CI-пайплайн.
4. Пересборка JSON при изменении исходных файлов: `npm run seed:infant:json`
5. Пробный прогон: `npm run seed:infant:import -- --dry-run`
6. Импорт с очисткой текущего батча `infant_curated_v2`: `npm run seed:infant:import -- --purge`  
   или только вставка/upsert: `npm run seed:infant:import`

### Удалить весь импортированный батч (без повторной вставки)

```bash
npm run seed:infant:import -- --purge-only
```

Просмотр объёма удаления: `--purge-only --dry-run`.  
Свой тег: `INFANT_SEED_BATCH_TAG`.

**Деплой:** только данные в Postgres; Edge и фронт не обязательны.

## Что проверить после импорта

- В Table Editor / SQL: `source = seed`, `trust_level = trusted`, тег `infant_curated_v2`, ожидаемые `min_age_months` / `max_age_months` / `meal_type`.
- Повторный запуск импорта не плодит дубликаты (счётчики «вставлено» / «обновлено» в логе).

## Ограничения (runtime)

- Узкая выборка по возрасту в клиентском `passesProfileFilter` — см. актуальный код; для плана используется edge `generate-plan` и поля возраста рецепта.
