# Recipe Core & Multilang Refactor Progress

## Current stage
- Stage 2 — description composer

## Planned stages
- [x] Stage 1 — locale + trust_level
- [x] Stage 2 — description composer
- [ ] Stage 3 — recipe_translations
- [ ] Stage 4 — nutrition_traits + goals
- [ ] Stage 5 — plan page refactor

## Stage 1 scope
- [x] migration added
- [x] recipes.locale added
- [x] recipes.source_lang added
- [x] recipes.trust_level added
- [x] trust_level backfill added
- [x] locale backfill added
- [x] create_recipe_with_steps updated
- [x] deepseek-chat passes locale/trust metadata
- [x] generate-plan: pool excludes blocked (generate-plan не создаёт рецепты; только фильтрация пула при выборке)
- [x] docs updated

## Key files
- **supabase/migrations/20260316120000_recipe_locale_trust_level_stage1.sql** — миграция: колонки locale, source_lang, trust_level; CHECK; backfill; новая версия create_recipe_with_steps.
- **supabase/migrations/** — RPC create_recipe_with_steps определён в миграции выше (полная замена функции).
- **supabase/functions/deepseek-chat/index.ts** — передача locale, source_lang, trust_level в canonicalizeRecipePayload при сохранении chat recipe.
- **supabase/functions/_shared/recipeCanonical.ts** — опциональные поля locale, source_lang, trust_level в CanonicalizeRecipePayloadInput и в возвращаемом payload.
- **supabase/functions/generate-plan/index.ts** — fetchPoolCandidates: фильтр .or("trust_level.is.null,trust_level.neq.blocked").
- **docs/database/DATABASE_SCHEMA.md** — описание колонок recipes.locale, source_lang, trust_level и контракта create_recipe_with_steps.

## What was actually changed
1. **Миграция 20260316120000:** добавлены колонки `recipes.locale` (NOT NULL DEFAULT 'ru'), `recipes.source_lang`, `recipes.trust_level`; CHECK для trust_level; backfill trust_level по source (seed/starter → одноимённый, manual → trusted, chat_ai/week_ai → candidate, user_custom → trusted, иначе → candidate); backfill locale = 'ru'; RPC create_recipe_with_steps расширен приёмом опциональных locale (default 'ru'), source_lang (null), trust_level (по source).
2. **deepseek-chat:** в вызов canonicalizeRecipePayload добавлены locale: 'ru', source_lang: null, trust_level: 'candidate'.
3. **_shared/recipeCanonical.ts:** в интерфейс и возврат canonicalizeRecipePayload добавлены опциональные locale, source_lang, trust_level (проброс в payload только если заданы).
4. **generate-plan:** в fetchPoolCandidates добавлен фильтр .or("trust_level.is.null,trust_level.neq.blocked") — рецепты с trust_level = 'blocked' не попадают в пул; старые записи с trust_level IS NULL продолжают участвовать.
5. **DATABASE_SCHEMA.md:** описание новых колонок и обновлённый контракт create_recipe_with_steps.

## Review / Where to look if something breaks
- **Создание chat recipe** — deepseek-chat → create_recipe_with_steps с locale/trust_level; ответ API без изменений.
- **Week/day generation** — generate-plan только читает пул; фильтр по trust_level не должен убирать старые записи (NULL допускается).
- **Replace slot** — использует тот же fetchPoolCandidates, логика единая.
- **Pool selection** — единственная выборка пула в generate-plan: fetchPoolCandidates; проверить, что рецепты с trust_level = blocked не возвращаются.
- **Recipe read flow** — get_recipe_full / get_recipe_previews не менялись; UI читает title/description как раньше.
- **Regressions in recipe save** — вызовы create_recipe_with_steps без новых полей остаются валидными (RPC подставляет дефолты).

## Stage 2 scope
- [x] description composer module added
- [x] deterministic description generation implemented
- [x] key ingredient selection implemented (pickKeyIngredients; used for category inference, templates do not repeat title)
- [x] fallback description implemented (COMPOSER_FALLBACK + category default)
- [x] deepseek-chat uses composer for final description
- [x] prompt dependence on full description reduced (LLM description overwritten by composer; repair/buildRecipe/buildDescriptionFallback in validated path replaced by composer)
- [x] docs updated (this progress file)

## Stage 2 key files
- **supabase/functions/_shared/recipeDescriptionComposer.ts** — модуль composer: pickKeyIngredients, inferDishCategory, composeRecipeDescription; шаблоны по категориям (soup, porridge, pancake, casserole, stew, pasta, meatballs, salad, drink, default).
- **supabase/functions/deepseek-chat/index.ts** — импорт composeRecipeDescription; в блоке validated при отсутствии/плохом description подстановка через composer (вместо repair/buildRecipe/buildDescriptionFallback); при провале quality gate — подстановка через composer; финальная подстановка description для response recipe через composer; assistantMessage обновляется после мутации recipe; лог RECIPE_SANITIZED с descriptionSource: "composer".

## Stage 2: what was actually changed
1. **recipeDescriptionComposer.ts:** новый модуль. pickKeyIngredients — исключает воду, соль, масло, специи и т.п.; возвращает до 2 ключевых. inferDishCategory — по title, mealType, is_soup, ingredientNames. composeRecipeDescription — выбор шаблона по категории, seed из title+ingredients+mealType, возврат ≤210 символов; fallback при пустоте.
2. **deepseek-chat/index.ts:** при отсутствии/неполном/плохом description в validated path — description задаётся через composeRecipeDescription (убраны вызовы repairDescriptionOnly, buildRecipeDescription, buildDescriptionFallback из этого пути). При провале quality gate — подстановка через composer вместо repair/buildDescriptionFallback. После санитизации response recipe: description = composeRecipeDescription(recipe); assistantMessage = JSON.stringify(recipe). Удалены импорты buildRecipeDescription, buildDescriptionFallback. В лог RECIPE_SANITIZED добавлено descriptionSource: "composer".
3. **Промпт LLM:** не менялся. Description по-прежнему запрашивается в ответе модели; финальное значение всегда перезаписывается composer'ом (минимальный риск, без изменения контракта ответа).

## Stage 2: review / where to look if something breaks
- **Генерация рецепта в чате** — description в ответе и в БД от composer; короткий, не дублирует title.
- **Сохранение рецепта** — payload.description берётся из validatedRecipe.description (уже от composer).
- **RecipePage / избранное / план** — чтение description без изменений; контракт поля сохранён.
- **Replace slot / пул** — без изменений.
- **Quality-gate path** — при провале gate по description всё ещё вызывается repairDescriptionOnly в одном месте (до полного retry); затем финальный description перезаписывается composer'ом в блоке response.

## Stage 2: open questions
- **Промпт:** description из ответа LLM не удалялся; финальное значение всегда от composer. При желании в следующем этапе можно сократить промпт (убрать требование 2 предложений о пользе) и зафиксировать экономию токенов.
- **Ключевые ингредиенты:** в текущих шаблонах composer не вставляет названия ингредиентов в текст (описание дополняет title, не повторяет его); pickKeyIngredients экспортирован для возможного использования в шаблонах позже.

## Open questions (Stage 1)
- **Индекс по trust_level:** на Stage 1 не добавлен. Выборка пула фильтрует по source (существующий idx_recipes_pool_user_created) и по trust_level в приложении; при росте объёма можно добавить частичный индекс WHERE source IN (...) AND (trust_level IS NULL OR trust_level <> 'blocked').
- **source_lang в deepseek-chat:** передаётся null — надёжного источника языка запроса на Stage 1 нет; при появлении заголовка/контекста локали можно передавать его в source_lang.
- **user_custom в backfill:** для существующих рецептов с source = 'user_custom' выставлен trust_level = 'trusted' (рецепт пользователя).
