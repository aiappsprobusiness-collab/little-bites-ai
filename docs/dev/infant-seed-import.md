# Infant curated seed-пул (6–11 мес)

## Что сделано в репозитории

- **Генератор:** `scripts/infant-seed/buildInfantSeedRecipes.mjs` — правила возрастов, `meal_type`, заголовки без «пюре» для lunch/dinner, обеды со словом «суп» и `is_soup: true` (совместимость с `generate-plan`).
- **JSON:** `data/infant-seed-recipes.json` — снимок пула (пересобрать: `npm run seed:infant:json`).
- **Импорт:** `scripts/import-infant-seed.mjs` — вставка через **service role** (не через `create_recipe_with_steps`, т.к. там `user_id` должен совпадать с `auth.uid()`).

Тег батча в `tags`: `infant_curated_batch1` (удаление предыдущего батча: флаг `--purge`).

## Как получить 140–200 рецептов

Сейчас в генераторе **180** рецептов. Чтобы сдвинуть объём:

1. Откройте `scripts/infant-seed/buildInfantSeedRecipes.mjs`, блок `AGE_PLAN` (`perMeal` по возрастам).
2. Запустите `npm run seed:infant:json` и при необходимости закоммитьте обновлённый JSON.

## Импорт в БД

1. В Supabase создайте или выберите пользователя-«владельца» строк пула (любой существующий `auth.users.id`, например служебный аккаунт команды).
2. В `.env` (без префикса `VITE_`):

   - `SUPABASE_URL`
   - **`SUPABASE_SERVICE_ROLE_KEY`** — только **service_role** из Supabase Dashboard → **Settings → API → service_role** (секретный JWT).  
     **Не подходит:** `anon`, `VITE_SUPABASE_ANON_KEY`, publishable key. Иначе сработает RLS (`recipes_insert_own`: `user_id = auth.uid()`), и вставка упадёт с `42501`.
   - `INFANT_SEED_CATALOG_USER_ID=<uuid>`

3. Пересборка JSON (если меняли генератор):  
   `npm run seed:infant:json`
4. Пробный прогон без записи:  
   `node scripts/import-infant-seed.mjs --dry-run`
5. Повторный импорт с очисткой старого батча:  
   `node scripts/import-infant-seed.mjs --purge`  
   или только вставка:  
   `npm run seed:infant:import`

### Удалить весь импортированный батч (без повторной вставки)

С теми же `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INFANT_SEED_CATALOG_USER_ID`:

```bash
node scripts/import-infant-seed.mjs --purge-only
```

Просмотр, сколько строк удалится: `--purge-only --dry-run`.  
Тег батча по умолчанию `infant_curated_batch1`; свой — через `INFANT_SEED_BATCH_TAG`.

Ингредиенты и шаги удалятся каскадно вместе с `recipes`.

**Деплой:** Edge Functions и фронт для этого не нужны; меняется только данные в Postgres.

## Что проверить после импорта

- В SQL Editor или Table Editor: `source = seed`, тег `infant_curated_batch1`, корректные `min_age_months` / `max_age_months` / `meal_type`.
- В приложении (Premium): подбор из пула по слотам; при аллергиях — что названия ингредиентов не конфликтуют с `allergenTokens` (при необходимости подправить вручную точечные строки).

## Ограничения (без смены runtime)

- Клиентский пул **не** фильтрует по `min_age_months` / `max_age_months` в `passesProfileFilter` — возраст на строках нужен для консистентности и для edge; узкую выборку по возрасту при необходимости делают отдельной задачей в коде.
- Фильтры аллергий — по подстрокам в тексте; диверсификация баз в генераторе снижает риск «пустого» пула после отсечений.
