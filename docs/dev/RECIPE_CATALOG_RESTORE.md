# Восстановление каталога рецептов (seed/core) в Supabase

Кратко: в репозитории лежат **исходники** curated-рецептов и скрипты, которые собирают JSON и делают **upsert** в таблицу `public.recipes` под фиксированным `user_id` каталога. Восстановление = пересобрать JSON из Git и прогнать импорт с **service role**.

Подробности форматов: `infant-seed-import.md`, `toddler-seed-import.md`, схема — `docs/database/DATABASE_SCHEMA.md` (таблица `recipes`, индекс `recipes_seed_catalog_identity_v2`).

---

## 1. Что можно восстановить из этого репозитория

| Возраст / каталог | Файл после сборки | npm-скрипт импорта | Тег батча в `tags` (типичный) |
|-------------------|-------------------|--------------------|-------------------------------|
| Прикорм 4–11 мес (curated) | `data/infant-seed-recipes.json` | `seed:infant:import` | `infant_curated_v2` |
| 12–36 мес | `data/toddler-seed/toddler-catalog-recipes.json` | `seed:toddler:import` | `toddler_curated_v1` |
| 37–96 мес | `data/toddler-seed/child-37-96-catalog-recipes.json` | `seed:child:import` | `child_37_96_curated_v1` |
| 97–216 мес | `data/toddler-seed/child-97-216-catalog-recipes.json` | `seed:child:teen:import` | `child_97_216_curated_v1` |
| 216–1200 мес (взрослый) | `data/toddler-seed/adult-216-1200-catalog-recipes.json` | `seed:adult:import` | `adult_216_1200_curated_v1` |

Идемпотентность: один и тот же рецепт определяется по `(user_id каталога, source=seed, locale, norm_title, min_age_months, max_age_months, meal_type)`. Повторный запуск обновляет строку и заново пишет ингредиенты/шаги.

**Не восстанавливается этим путём:** рецепты, которые вы правили **только в БД** и не сохранили в файлы в Git; для них нужен бэкап/PITR Supabase или ручной повтор правок.

---

## 2. Переменные окружения

В корне проекта файл **`.env`** (не коммитить; без префикса `VITE_`):

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role из Dashboard → Settings → API>
INFANT_SEED_CATALOG_USER_ID=<uuid пользователя-владельца строк каталога в auth.users>
```

Правила:

- **`SUPABASE_SERVICE_ROLE_KEY`** — только ключ с ролью **service_role** (обходит RLS). Не `anon`, не `VITE_SUPABASE_ANON_KEY`.
- **`INFANT_SEED_CATALOG_USER_ID`** — должен быть **тот же UUID**, что использовался при прошлых импортах; иначе получатся **дубликаты** тех же блюд под другим `user_id`. Если старый UUID неизвестен: в SQL посмотрите `SELECT user_id, count(*) FROM recipes WHERE source = 'seed' GROUP BY 1 ORDER BY 2 DESC;` — обычно один доминирующий uuid для seed-пула. Либо создайте отдельного технического пользователя в Auth и используйте его id **один раз навсегда** для всех импортов каталога.

---

## 3. Порядок действий (Windows PowerShell)

Из каталога репозитория:

### Шаг A — пересобрать все JSON из исходников в Git

```powershell
Set-Location c:\Projects\little-bites-ai

npm run seed:infant:json
npm run seed:toddler:json
npm run seed:child:json
npm run seed:child:teen:json
npm run seed:adult:json
```

При ошибках сборки сначала исправьте исходники в `data/infant-seed/` или `data/toddler-seed/*.source.txt` (см. `toddler-seed-import.md`).

### Шаг B — пробный прогон импорта (без записи в БД)

```powershell
npm run seed:infant:import -- --dry-run
npm run seed:toddler:import -- --dry-run
npm run seed:child:import -- --dry-run
npm run seed:child:teen:import -- --dry-run
npm run seed:adult:import -- --dry-run
```

Ожидается вывод с числом рецептов из файла и строка про пропуск вставки.

### Шаг C — реальный импорт (upsert)

Выполняйте **по очереди** (можно всё подряд в один день):

```powershell
npm run seed:infant:import
npm run seed:toddler:import
npm run seed:child:import
npm run seed:child:teen:import
npm run seed:adult:import
```

Деплой Edge Functions и фронта **не требуется** — меняется только Postgres.

### Шаг D — не использовать при восстановлении

- **`--purge`** и **`--purge-only`** — удаляют рецепты каталога по тегу батча у `INFANT_SEED_CATALOG_USER_ID`. Для «наполнить снова» нужен обычный импорт **без** purge. Purge только если осознанно чистите старый батч перед заменой файла.

---

## 4. Проверка в Supabase (SQL Editor)

Подставьте uuid каталога:

```sql
SELECT source, trust_level, count(*) AS n
FROM public.recipes
WHERE user_id = '<INFANT_SEED_CATALOG_USER_ID>'
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT min_age_months, max_age_months, count(*) AS n
FROM public.recipes
WHERE user_id = '<INFANT_SEED_CATALOG_USER_ID>' AND source = 'seed'
GROUP BY 1, 2
ORDER BY 1, 2;
```

Ожидается `source = seed`, для curated каталога — `trust_level = core` (см. актуальную схему в `DATABASE_SCHEMA.md`).

---

## 5. Ожидаемые объёмы (snapshot после `seed:*:json` из репозитория)

Числа могут меняться после правок исходников; ориентир по последней пересборке — сумма по всем каталогам порядка **400+** строк `seed` для одного `INFANT_SEED_CATALOG_USER_ID`.

---

## 6. Частые причины ошибок импорта

### 6.A `foreign key` / `violates foreign key constraint` на `recipes.user_id`

UUID из **`INFANT_SEED_CATALOG_USER_ID`** должен **существовать** в **Authentication → Users**. Пустой или выдуманный uuid без пользователя в Auth импорт не примет.

Создайте пользователя (можно с фейковым email, без подтверждения — по настройкам проекта), скопируйте его **User UID** в `.env`.

### 6.B В `.env` новый uuid, а скрипт всё равно «как будто со старым»

Раньше скрипт **не переопределял** переменные, уже заданные в системе (Windows: «Переменные среды»). Сейчас значения из **файла `.env` имеют приоритет** при запуске `import-infant-seed.ts`.

Если ошибка сохраняется: в том же терминале выполните `echo $Env:INFANT_SEED_CATALOG_USER_ID` (PowerShell) и убедитесь, что выводится ожидаемый uuid.

### 6.C Уникальный индекс каталога

Убедитесь, что применены миграции, в т.ч. `20260328120000_recipes_seed_catalog_identity_meal_type.sql`. Конфликт возможен, если в базе уже есть дубликаты с тем же «ключом идентичности» под **тем же** `user_id` — тогда нужна отдельная диагностика дубликатов.

---

## 7. Коммит в Git

После правок исходников и пересборки имеет смысл закоммитить обновлённые `data/*.json`, чтобы команда всегда могла восстановить тот же snapshot.
