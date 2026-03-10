# Очистка «кривых» AI-рецептов (Mom Recipes)

Миграции безопасно удаляют некачественные рецепты из `public.recipes`: сначала данные переносятся в таблицы trash, затем удаляются батчами. Рецепты, которые используются в плане (`meal_plans_v2.meals`) или в избранном (`favorites_v2`), **не удаляются**.

**Anti-duplicate guard при создании рецептов НЕ внедряем до фикса генерации недели.** Дедупликация в этом PR — **только cleanup-инструмент** (preview + merge по вызову функции); вставка рецептов (create_recipe_with_steps, генерация плана) не меняется.

## Критерии «кривого» рецепта (удаляем при выполнении ЛЮБОГО)

- **A)** Нет ни `chef_advice`, ни `advice` (оба NULL или пустые после trim).
- **B)** Шагов приготовления < 2 (в `recipe_steps` по `recipe_id`).
- **C)** Ингредиентов < 3 (в `recipe_ingredients` по `recipe_id`).
- **D)** В `recipe_ingredients` не менее 2 строк с «пустотами»: `(canonical_amount IS NULL OR canonical_unit IS NULL)` и при этом `display_text` пустой/NULL.
- **E)** В `recipes` нет обязательных базовых полей: `title` пустой/NULL или нет связей со `recipe_steps`/`recipe_ingredients`.

Учитываются только рецепты с `source IN ('chat_ai', 'week_ai')`.

### Приоритет причин (delete_reason)

При совпадении нескольких критериев в отчёт и в trash записывается **одна** причина — по приоритету (от «самого мусорного» к «мягкому»):

1. **missing_title** — пустой/NULL title  
2. **no_links** — нет шагов или нет ингредиентов вообще  
3. **low_ingredients** — ингредиентов < 3  
4. **low_steps** — шагов < 2  
5. **bad_canonical** — ≥2 ингредиентов без canonical и без display_text  
6. **no_advice** — нет ни chef_advice, ни advice  

Эту же последовательность использует view `recipes_quality_report` и бэкфилл в `recipes_trash` (миграция 20260220220020).

## Почему раньше было только no_advice

В первой версии миграции причина в temp-таблице кандидатов выбиралась **первой сработавшей** проверкой в `CASE`, и условие **no_advice** шло первым. Почти у всех «кривых» AI-рецептов не было ни совета шефа, ни мини-совета, поэтому они все получали `delete_reason = 'no_advice'`, даже если у них не было шагов, ингредиентов или title. Более информативные причины (missing_title, no_links, low_steps, low_ingredients, bad_canonical) не применялись. В миграции 20260220220020 приоритет изменён: сначала проверяются «мусорные» признаки (пустой title, нет связей, мало ингредиентов/шагов, плохие canonical), и только в конце — отсутствие совета. Для уже удалённых записей в `recipes_trash` выполнен backfill: `delete_reason` пересчитан по тем же правилам по данным из `recipe_steps_trash` и `recipe_ingredients_trash` (поле `deleted_at` не менялось).

## Как запустить миграции

Из корня проекта:

```bash
npx supabase db push
```

или при работе с удалённым проектом:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Миграции выполняются по порядку:

1. **20260220220000_recipes_cleanup_trash.sql** — создаёт таблицы trash, строит кандидатов (приоритет причин: missing_title → no_links → low_ingredients → low_steps → bad_canonical → no_advice), исключает рецепты из плана и избранного, копирует в trash и удаляет батчами по 500.
2. **20260220220010_recipes_cleanup_report_view.sql** — создаёт view `recipes_quality_report`.
3. **20260220220020_cleanup_reason_priority_and_backfill.sql** — пересчитывает `delete_reason` в `recipes_trash` по приоритету, обновляет view под тот же приоритет.
4. **20260221100000_recipes_dedupe_preview.sql** — view `recipes_dedupe_candidates_preview` (кандидаты на дедуп по title и fingerprint).
5. **20260221100001_run_recipes_dedupe_merge.sql** — функция `run_recipes_dedupe_merge(p_dry_run)` для слияния дублей (редирект в плане/избранном/чате → архив в trash → удаление).

В логах миграции (или в NOTICE) будет что-то вроде:

```
recipes_cleanup_trash: total_candidates=N, skipped_in_plan=P, skipped_favorites=F, trashed=T, deleted=D
```

## Как проверить результат

- Количество оставшихся рецептов и качество по ним:

```sql
SELECT count(*) FROM public.recipes WHERE source IN ('chat_ai', 'week_ai');
```

- Отчёт по качеству (первые 50 строк):

```sql
SELECT * FROM public.recipes_quality_report LIMIT 50;
```

- Сколько осталось с непустым `delete_reason` (потенциально «кривые», но не удалённые, т.к. в плане или в избранном):

```sql
SELECT delete_reason, count(*)
FROM public.recipes_quality_report
WHERE delete_reason IS NOT NULL
GROUP BY delete_reason
ORDER BY count(*) DESC;
```

- Распределение причин в trash (после миграции 20260220220020 — с правильным приоритетом):

```sql
SELECT delete_reason, count(*)
FROM public.recipes_trash
GROUP BY delete_reason
ORDER BY count(*) DESC;
```

- Распределение причин среди оставшихся «кривых» рецептов (по view):

```sql
SELECT delete_reason, count(*)
FROM public.recipes_quality_report
WHERE delete_reason IS NOT NULL
GROUP BY delete_reason
ORDER BY count(*) DESC;
```

### Проверка после миграции 20260220220020 (приоритет причин)

Убедиться, что в trash и в отчёте причины распределены по типам, а не только `no_advice`:

```sql
-- Trash: сколько записей по каждой причине
SELECT delete_reason, count(*)
FROM public.recipes_trash
GROUP BY delete_reason
ORDER BY count(*) DESC;

-- Оставшиеся рецепты с непустым delete_reason (по view)
SELECT delete_reason, count(*)
FROM public.recipes_quality_report
WHERE delete_reason IS NOT NULL
GROUP BY delete_reason
ORDER BY count(*) DESC;
```

## Как откатить (восстановить из trash)

Миграции **не выполняют** восстановление автоматически. Если нужно вернуть удалённые рецепты:

1. Восстановить строки в `public.recipes` из `public.recipes_trash` (все колонки кроме `deleted_at` и `delete_reason`).
2. Восстановить `public.recipe_steps` из `public.recipe_steps_trash` (по `recipe_id` из восстановленных рецептов).
3. Восстановить `public.recipe_ingredients` из `public.recipe_ingredients_trash` (по `recipe_id`).

Пример только для рецептов (подставьте нужный список id или условие по `deleted_at`/`delete_reason`):

```sql
-- Пример: восстановить всё, что удалили с причиной 'no_advice'
INSERT INTO public.recipes (
  id, user_id, child_id, member_id, title, description, image_url, cooking_time_minutes,
  min_age_months, max_age_months, calories, proteins, fats, carbs, is_favorite, rating,
  times_cooked, tags, source_products, created_at, updated_at, source, meal_type,
  chef_advice, advice
)
SELECT id, user_id, child_id, member_id, title, description, image_url, cooking_time_minutes,
  min_age_months, max_age_months, calories, proteins, fats, carbs, is_favorite, rating,
  times_cooked, tags, source_products, created_at, updated_at, source, meal_type,
  chef_advice, advice
FROM public.recipes_trash
WHERE delete_reason = 'no_advice';
-- Затем аналогично recipe_steps_trash -> recipe_steps, recipe_ingredients_trash -> recipe_ingredients
```

Перед восстановлением убедитесь, что в `recipes` нет конфликтующих `id` (дубликатов).

## Как повторно запустить дедупликацию

Дедупликация делается не миграцией, а функцией **`run_recipes_dedupe_merge(p_dry_run)`**. Сначала посмотрите кандидатов и сухой прогон, затем выполните слияние.

- **Сухой прогон** (ничего не меняет, только NOTICE с цифрами):

```sql
SELECT public.run_recipes_dedupe_merge(true);
```

В NOTICE будет: `duplicates_total`, `will_update_favorites`, `will_update_plans`, `will_delete_recipes`.

- **Применить слияние** (редирект избранного и планов на winner, архив losers в trash, удаление losers):

```sql
SELECT public.run_recipes_dedupe_merge(false);
```

Функция по умолчанию вызывается с **dry_run=true**; реальное удаление и обновление ссылок выполняется только при явном вызове `run_recipes_dedupe_merge(false)`. Идемпотентна: повторный запуск не ломает данные, winner не удаляется, дубликаты в избранном не создаются (при конфликте строка с loser удаляется). Перед удалением losers все ссылки в `favorites_v2`, `meal_plans_v2.meals` и `chat_history.recipe_id` переписываются на winner. После apply в NOTICE выводятся **broken_plan_links_count** и **broken_favorites_links_count** (должны быть 0).
