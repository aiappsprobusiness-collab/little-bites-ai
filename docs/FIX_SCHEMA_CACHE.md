# Исправление ошибки schema cache PostgREST

Ошибка: `Could not find the 'recipe_id' column of 'favorites_v2' in the schema cache`

## Причина

PostgREST кэширует схему БД. После применения миграций кэш может быть устаревшим.

## Шаги исправления

### 1. Проверить, что миграция применена

1. Открой [Supabase Dashboard](https://supabase.com/dashboard) → твой проект
2. Project URL должен совпадать с `VITE_SUPABASE_URL` в `.env`
3. **Database** → **Migrations** — убедись, что `20260212110000_favorites_v2_recipe_id_and_is_favorite_from_v2.sql` помечена как применённая
4. Если нет — выполни: `supabase db push` или примени миграции вручную

### 2. Диагностика: есть ли колонка в БД

**SQL Editor** → New query → выполни:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'favorites_v2';
```

Если `recipe_id` в списке — колонка есть, проблема в кэше.

### 3. Обновить schema cache PostgREST

**SQL Editor** → New query → выполни:

```sql
NOTIFY pgrst, 'reload schema';
```

Это заставит PostgREST перечитать схему.

### 4. Альтернатива: перезапуск API

Если `NOTIFY` не помог:
- **Settings** → **API** → **Restart project** (если доступно)
- Или подождать несколько минут — Supabase периодически обновляет кэш

### 5. Скрипт целиком

Используй `supabase/scripts/reload-schema-cache.sql` — выполни в SQL Editor.
