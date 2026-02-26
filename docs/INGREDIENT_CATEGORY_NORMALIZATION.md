# Нормализация категорий ингредиентов (recipe_ingredients.category)

## Где выставляется category

1. **Edge / клиент (до RPC)**  
   - `supabase/functions/_shared/recipeCanonical.ts`, `src/utils/recipeCanonical.ts`: при сборке payload для `create_recipe_with_steps` поле `category` берётся из ингредиента как есть, иначе подставляется **`"other"`**:  
     `category: typeof ing.category === "string" ? ing.category : "other"`.  
   - ИИ чаще всего не присылает категории, поэтому в RPC почти всегда приходит `category: "other"`.

2. **Внутри RPC create_recipe_with_steps (и create_user_recipe / update_user_recipe)**  
   - Читается `ing_category := COALESCE(NULLIF(trim(ing->>'category'), ''), 'other')`.  
   - Если `ing_category` пустой или `'other'`, вызывается **`public.infer_ingredient_category(final_name)`**; иначе категория из payload приводится к enum.  
   - Итоговая категория пишется в `recipe_ingredients.category`.

3. **По умолчанию в БД**  
   - В таблице: `category product_category DEFAULT 'other'`.  
   - При INSERT в RPC значение задаётся явно (из infer или из payload).

4. **Неизвестные ингредиенты**  
   - Если infer_ingredient_category не срабатывает ни по одному правилу — возвращается **`other`**.

## Почему «свинина / курица» оказываются в other

- **Источник истины при записи** — один аргумент: **`final_name`**.  
  `final_name` берётся либо из **парсинга display_text** (`parse_ingredient_display_text`), либо из `ing->>'name'` / `ing->>'display_text'`.
- **Парсер display_text**: разбивает строку по `—`/`-`; часть **до последнего** «число + единица» считается именем. Если приходит строка вида **«200 г — Свинина шея»** (сначала количество), то `name_clean` становится **«200 г»** — по такому «имени» infer не матчит мясо → остаётся **other**.
- **Словарь infer_ingredient_category**: матчи по подстрокам в `lower(name)` (регулярки). Для мяса: `говядин|свинин|баранин|индейк|куриц|фарш|котлет`. Если в БД уже записан короткий или искажённый name (например только «шея», или латиница), матча не будет → **other**.
- **Ограничение по одному полю**: infer вызывается только от **final_name**. Не используется `display_text` целиком, поэтому контекст вроде «Свинина шея — 200 г» в полном виде в infer не попадает, если парсер отдал неправильный name_clean.
- **Итог**: основная причина — использование для категории только **одного** поля (name/final_name) при том, что name иногда неправильный (парсер или пустой name в payload); плюс возможные пробелы в покрытии словаря (морфология, синонимы).

## Что сделано в фиксе

- В RPC при вызове infer передаётся **объединённая строка** `final_name || ' ' || COALESCE(ing_display_text, '')`, чтобы даже при ошибочном name_clean по полному тексту («Свинина шея — 200 г») категория определялась верно.
- Расширены правила в **infer_ingredient_category** (больше основ/синонимов для мяса, рыбы, овощей, молочки, круп, жиров, специй).
- Массовое исправление уже сохранённых данных: миграция обновляет `recipe_ingredients.category` по правилам на основе **name** и **display_text** (только где было other или явно неверно), с логированием числа обновлённых строк.

---

## Файлы и миграции

| Что | Файл |
|-----|------|
| Диагностика (счётчики, топ other, meat/veg в other) | `supabase/migrations/20260226140000_ingredients_category_audit.sql` |
| Расширение infer_ingredient_category + вызов по name+display_text в create_recipe_with_steps | `supabase/migrations/20260226150000_infer_ingredient_category_extended_and_use_display_text.sql` |
| create_user_recipe / update_user_recipe: infer по name+display_text | `supabase/migrations/20260226160000_user_recipe_infer_category_from_name_and_display_text.sql` |
| Массовый фикс категорий (UPDATE только other) | `supabase/migrations/20260226170000_fix_recipe_ingredients_categories.sql` |
| Удаление мусорных рецептов (опционально) | `supabase/migrations/20260226180000_delete_bad_recipes.sql` |

## Чеклист проверки

1. Применить миграции, затем сгенерировать 3–5 рецептов (свинина, курица, лосось, овощной суп, каша).
2. В БД проверить: `SELECT name, category FROM recipe_ingredients WHERE recipe_id IN (...) ORDER BY order_index` — мясо/рыба/овощи не должны быть `other`.
3. Посмотреть диагностику до/после: `SELECT * FROM ingredients_category_audit;` и `SELECT * FROM ingredients_category_audit_meat_like_other LIMIT 20;`.
