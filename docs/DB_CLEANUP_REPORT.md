# Отчёт и очистка «мусора» в БД Mom Recipes

Всё выполняется через миграции/SQL в репозитории. Ручные правки в Supabase UI не используются.

**Ограничения:** не трогаем рецепты `source = 'manual'` (и другие пользовательские). Чистим только `chat_ai` / `week_ai`.

---

## 1. Как запускать проверки

### Локально (Supabase CLI)

```bash
# Применить миграции (в т.ч. audit — только SELECT, ничего не меняет)
npx supabase db push

# Запустить SQL из миграции вручную (если нужно только посмотреть результат)
npx supabase db execute --file supabase/migrations/20260222000000_audit_garbage.sql
```

В миграции `20260222000000_audit_garbage.sql` только **SELECT** — никаких INSERT/UPDATE/DELETE. Она создаёт **VIEW** для удобного запуска проверок. После применения миграции можно в Supabase SQL Editor или через `db execute` выполнять запросы к этим представлениям.

### Что означают проверки

| Проверка | Описание |
|----------|----------|
| **A) Broken meal_plans_v2** | Строки плана, у которых `meals` не пустой объект, но после «нормализации» не остаётся ни одного валидного слота: у всех слотов либо нет валидного `recipe_id` (NULL/пусто/не UUID), либо рецепт с таким id не существует в `public.recipes`. Такие строки приводят к `normalized_meals_empty` при weekly fill. |
| **B1) Рецепты без ингредиентов** | `source IN ('chat_ai','week_ai')` и 0 записей в `recipe_ingredients`. |
| **B2) Рецепты с steps < 2** | Мало шагов — кандидаты на неполноценный рецепт. |
| **B3) Рецепты без советов** | Нет ни `chef_advice`, ни `advice` (оба NULL или пустые). |
| **B4) Ингредиенты с display_text, но без amount/unit** | Строки «по вкусу» или неразобранные — считаем количество таких на рецепт. |
| **Garbage score** | Сумма: (нет ингредиентов? 1 : 0) + (steps < 2? 1 : 0) + (нет советов? 1 : 0). Top 200 по убыванию score и даты. |

---

## 2. Файлы

| Файл | Назначение |
|------|------------|
| `supabase/migrations/20260222000000_audit_garbage.sql` | Только SELECT и создание VIEW для отчётов. Не удаляет и не меняет данные. |
| `supabase/migrations/20260222000001_cleanup_garbage_safe.sql` | Удаление подтверждённого мусора. **По умолчанию отключено** (переменная `run_cleanup = false`). Включить вручную при необходимости. |

---

## 3. Проверка до/после

До и после очистки можно сравнить счётчики.

```sql
-- Количество «сломанных» строк плана (meals с ключами, но без валидных recipe_id)
SELECT count(*) FROM audit.meal_plans_broken_meals;

-- Рецепты-мусор (top по garbage_score) — до очистки
SELECT count(*) FROM audit.recipes_garbage_top200;

-- Общее число рецептов chat_ai/week_ai
SELECT source, count(*) FROM public.recipes WHERE source IN ('chat_ai','week_ai') GROUP BY source;

-- После очистки: те же запросы — числа должны уменьшиться там, где удаляли.
```

---

## 4. Деплой

- **Применить миграции (в т.ч. audit):** `npx supabase db push`
- Edge / frontend не трогаем — меняется только БД.

Очистка (delete) выполняется только после явного включения в миграции `20260222000001_cleanup_garbage_safe.sql` и повторного применения миграций (или ручного запуска блока с `run_cleanup = true`).

---

## 5. Итог: созданные файлы и проверка

**Созданные файлы:**

- `docs/DB_CLEANUP_REPORT.md` — этот отчёт (как запускать, что значат проверки, проверка до/после).
- `supabase/migrations/20260222000000_audit_garbage.sql` — только VIEW в схеме `audit` (никаких удалений).
- `supabase/migrations/20260222000001_cleanup_garbage_safe.sql` — удаление мусора, по умолчанию выключено (`run_cleanup = false`).

**Деплой:** только БД — `npx supabase db push`. Edge Functions и frontend не трогаем.

**Проверка до/после (SELECT count по каждому списку):**

| Что смотрим | Запрос |
|-------------|--------|
| Сломанные строки meal_plans_v2 | `SELECT count(*) FROM audit.meal_plans_broken_meals;` |
| Рецепты без ингредиентов (B1) | `SELECT count(*) FROM audit.recipes_no_ingredients;` |
| Рецепты с steps < 2 (B2) | `SELECT count(*) FROM audit.recipes_low_steps;` |
| Рецепты без советов (B3) | `SELECT count(*) FROM audit.recipes_no_advice;` |
| Рецепты с «плохими» ингредиентами (B4) | `SELECT count(*) FROM audit.recipes_bad_ingredients_display_only;` |
| Top-200 по garbage_score | `SELECT count(*) FROM audit.recipes_garbage_top200;` |
| Всего рецептов chat_ai/week_ai | `SELECT source, count(*) FROM public.recipes WHERE source IN ('chat_ai','week_ai') GROUP BY source;` |

После включения и выполнения очистки: повторить те же запросы — числа по сломанным планам и мусорным рецептам должны уменьшиться.
