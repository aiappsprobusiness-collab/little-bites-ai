# Infant curated seed-пул (4–6 и 7–8 мес)

## Что в репозитории

- **Исходные наборы (source of truth):**  
  - `data/infant-seed/infant_4_6_months_stage1.json`  
  - `data/infant-seed/infant_7_8_months_stage2.json`  
  Curated тексты, ингредиенты, шаги, КБЖУ, теги — не из программного генератора «заглушек».

- **Сборка:** `scripts/infant-seed/buildInfantSeedRecipes.mjs` — читает оба JSON, нормализует шаги (строки → `{ step_number, instruction }`), добавляет batch-тег, валидирует поля.

- **Снимок для импорта:** `data/infant-seed-recipes.json` — пересборка: `npm run seed:infant:json` (≈86 рецептов: 45 + 41).

- **Импорт:** `scripts/import-infant-seed.mjs` — **service role**, не `create_recipe_with_steps` (там `user_id` = `auth.uid()`).

- **Поля пула:** `source = seed`, `locale = ru`, `trust_level = trusted`, `nutrition_goals = []` (отбор в плане для младенцев — по `min_age_months` / `max_age_months` и правилам generate-plan, не по целям). Текст «подсказки для мамы» хранится в `chef_advice`. На клиенте для infant-рецептов этот контент подписывается как **«Подсказка для мамы»**, а `description` берётся напрямую из `recipes.description` (про текстуру/этап прикорма).

- **Идемпотентность:** повторный запуск ищет строку по `(user_id, source, locale, norm_title, min_age_months, max_age_months)` и делает **UPDATE** + замену ингредиентов/шагов, иначе **INSERT**. В БД: частичный уникальный индекс `recipes_seed_catalog_identity_v1` (миграция `20260325130000_recipes_seed_catalog_unique.sql`).

Тег батча в `tags`: **`infant_curated_v2`** (удаление импортированного батча: `--purge`). Старый тег **`infant_curated_batch1`** (программная генерация 180 рецептов) при необходимости чистите отдельно: `INFANT_SEED_BATCH_TAG=infant_curated_batch1 node scripts/import-infant-seed.mjs --purge-only`.

## Импорт в БД

1. В Supabase выберите пользователя-«владельца» строк пула (`auth.users.id`).
2. В `.env` (без префикса `VITE_`):

   - `SUPABASE_URL`
   - **`SUPABASE_SERVICE_ROLE_KEY`** — только **service_role** (Dashboard → Settings → API). Не `anon` / `VITE_SUPABASE_ANON_KEY`.
   - `INFANT_SEED_CATALOG_USER_ID=<uuid>`

3. Применить миграции (в т.ч. индекс): `supabase db push` или свой CI-пайплайн.
4. Пересборка JSON при изменении исходных файлов: `npm run seed:infant:json`
5. Пробный прогон: `node scripts/import-infant-seed.mjs --dry-run`
6. Импорт с очисткой текущего батча `infant_curated_v2`: `node scripts/import-infant-seed.mjs --purge`  
   или только вставка/upsert: `npm run seed:infant:import`

### Удалить весь импортированный батч (без повторной вставки)

```bash
node scripts/import-infant-seed.mjs --purge-only
```

Просмотр объёма удаления: `--purge-only --dry-run`.  
Свой тег: `INFANT_SEED_BATCH_TAG`.

**Деплой:** только данные в Postgres; Edge и фронт не обязательны.

## Что проверить после импорта

- В Table Editor / SQL: `source = seed`, `trust_level = trusted`, тег `infant_curated_v2`, ожидаемые `min_age_months` / `max_age_months` / `meal_type`.
- Повторный запуск импорта не плодит дубликаты (счётчики «вставлено» / «обновлено» в логе).

## Ограничения (runtime)

- Узкая выборка по возрасту в клиентском `passesProfileFilter` — см. актуальный код; для плана используется edge `generate-plan` и поля возраста рецепта.
