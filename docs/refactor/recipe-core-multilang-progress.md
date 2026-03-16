# Recipe Core & Multilang Refactor Progress

## Current stage
- Stage 2.4.1 — steps leakage guard

## Planned stages
- [x] Stage 1 — locale + trust_level
- [x] Stage 2 — description composer
- [x] Stage 2.1 — composer polishing & token reduction
- [x] Stage 2.2 — chef advice restore + consistency guard
- [x] Stage 2.3 — description path cleanup + anti-context leakage + latency audit
- [x] Stage 2.4 — description rollback (LLM primary)
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

## Stage 2.1 scope (composer polishing & token reduction)
- [x] description templates expanded (more per category, semantic axes: texture, serving, home-style, light, family)
- [x] repetition reduced (more variants, combo-style phrases)
- [x] fallback-only phrases isolated (generic "Спокойный домашний вариант на каждый день" only in COMPOSER_FALLBACK)
- [x] chef_advice limited (max 220 chars, 1–2 sentences; CHEF_ADVICE_MAX_LENGTH 280→220)
- [x] description removed or reduced in prompt (LLM may output ""; prompts shortened)
- [x] token usage reduced (shorter prompt, no long description requirement)
- [x] composerVariant logged (category:index)

## Stage 2.1 key files
- **supabase/functions/_shared/recipeDescriptionComposer.ts** — max 160 chars; ComposeRecipeDescriptionResult { text, variantId }; expanded templates; fallback-only single phrase.
- **supabase/functions/deepseek-chat/prompts.ts** — RECIPE_STRICT_JSON_CONTRACT, RECIPE_SYSTEM_RULES_V3: description optional/empty; chefAdvice max 220, practical tone.
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — CHEF_ADVICE_MAX_LENGTH 220; CHEF_ADVICE_RESTAURANT_PHRASES; hasRestaurantTone → fallback.
- **supabase/functions/deepseek-chat/recipeSchema.ts** — chefAdvice max 220; comment updated.
- **supabase/functions/deepseek-chat/index.ts** — composeRecipeDescription returns { text, variantId }; log composerVariant.

## Stage 2.1: actual result / open questions
- Stage 2.1 дал спорный результат по chef_advice: скорость генерации заметно не выросла; качество chef_advice просело (советы менее живые, иногда не по блюду или механические). Stage 2.2 возвращает качество и добавляет consistency guard.

## Stage 2.2 scope (chef advice restore + consistency guard)
- [x] chef_advice rules softened (max 260, убраны жёсткие запреты «подавайте»/«можно»; RESTAURANT_PHRASES сокращён до явного пафоса)
- [x] chef_advice quality improved (промпт: живой тон, 2–3 предложения, по блюду; anti-garbage только против нерелевантности/пустых шаблонов)
- [x] title/ingredients consistency guard added (high-signal ключи: картофель, цветная капуста, брокколи, кабачок, морковь, яблоко, банан, творог, индейка, курица, треска, лосось, гречка, овсянка, рис, тыква, фасоль, сыр, яйцо, томат/помидор)
- [x] obvious title/ingredients mismatches handled (при отсутствии картофеля в ingredients — безопасная нормализация title, например «картофельное пюре из цветной капусты» → «пюре из цветной капусты»)
- [x] guard logging added (TITLE_INGREDIENT_CONSISTENCY_GUARD: titleIngredientConsistencyGuardTriggered, consistencyMismatchKeys; titleNormalized при применении suggestedTitle; в RECIPE_SANITIZED — titleIngredientConsistencyGuardTriggered, consistencyMismatchKeys)
- [x] docs updated (этот progress-файл)

## Stage 2.2 key files
- **supabase/functions/_shared/titleIngredientConsistencyGuard.ts** — checkTitleIngredientConsistency(title, ingredientNames); high-signal список; suggestTitleFix только для картофеля (убрать прилагательное «картофельное» и т.п.).
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — CHEF_ADVICE_MAX_LENGTH 260; смягчены FORBIDDEN_STARTS и RESTAURANT_PHRASES; quality gate 1–3 предложения.
- **supabase/functions/deepseek-chat/recipeSchema.ts** — chefAdvice max 260.
- **supabase/functions/deepseek-chat/prompts.ts** — chefAdvice 260 симв., 2–3 предложения; живой тон; примеры хорошо/плохо.
- **supabase/functions/deepseek-chat/index.ts** — вызов checkTitleIngredientConsistency после enforceChefAdvice; применение suggestedTitle при наличии; логирование guard и RECIPE_SANITIZED с полями consistency.

## Stage 2.2: уточнение
- Stage 2.2 улучшил chef_advice частично; в pool по-прежнему мог протекать request-specific контекст (в дорогу, с собой и т.д.). Stage 2.3 добавляет anti-leak guard и упрощает description path.

## Stage 2.3 scope (description path cleanup + anti-context leakage + latency audit)
- [x] description removed from critical repair path (descOk не запускает repairDescriptionOnly и не входит в needFullRetry; retry только по adviceOk)
- [x] description-only repair eliminated (вызов repairDescriptionOnly удалён; при плохом description — только composer в блоке validated)
- [x] request-context leakage guard added (title, description, chef_advice; фразы: в дорогу, с собой, в контейнер, в школу, в поездку, для дороги и др.)
- [x] pool-unsafe phrases blocked from saved recipe text (при срабатывании: title — мягкое удаление фразы; description — пересбор composer; chef_advice — fallback)
- [x] title lexicon guard added (соте → тушёные овощи / тушёное; только безопасные замены)
- [x] latency audit instrumentation added (backend: validation_done, LATENCY_AUDIT с total_ms и latencyPhase; frontend: performance.mark chat_request_start, chat_request_sent, chat_response_received, chat_recipe_ready; measure chat_tap_to_recipe_ms)
- [x] docs updated (этот progress-файл)

## Stage 2.3 key files
- **supabase/functions/deepseek-chat/index.ts** — убран repairDescriptionOnly из горячего пути; quality gate retry только по chef_advice; один блок composer для description в validated; импорт и вызов checkRequestContextLeak, checkTitleLexicon; логи DESCRIPTION_QUALITY_GATE_BYPASSED, REQUEST_CONTEXT_LEAK_GUARD, TITLE_LEXICON_GUARD, RECIPE_SANITIZED (leak/lexicon), logPerf validation_done, LATENCY_AUDIT.
- **supabase/functions/_shared/requestContextLeakGuard.ts** — checkRequestContextLeak(title, description, chefAdvice); список REQUEST_CONTEXT_PHRASES; suggestedTitle, descriptionUseComposer, chefAdviceUseFallback.
- **supabase/functions/_shared/titleLexiconGuard.ts** — checkTitleLexicon(title); замены «овощное соте» → «тушёные овощи», «соте» → «тушёное».
- **src/hooks/useDeepSeekAPI.tsx** — performance.mark: chat_request_start, chat_request_sent, chat_response_received, chat_recipe_ready; performance.measure chat_tap_to_recipe; safeLog LATENCY_AUDIT с chat_tap_to_recipe_ms.

## Stage 2.4 scope (description rollback — LLM primary)
- [x] LLM description restored as primary source
- [x] composer used only as fallback (when isDescriptionInvalid)
- [x] description validation added (isDescriptionInvalid: пусто, <20, >180, повтор title, запреты, request-context leakage)
- [x] prompt rules updated (1–2 предложения, макс. 160 симв., не повторять название, не «в дорогу»/«для ребёнка»/«для всей семьи», без мед. обещаний)
- [x] latency/guards from Stage 2.3 preserved

## Stage 2.4 key files
- **supabase/functions/deepseek-chat/index.ts** — в validated: только при isDescriptionInvalid(desc) подстановка composer; в response-блоке: descriptionInvalid ? composer : descRaw.slice(0,160); descriptionSource "llm" | "composer_fallback"; при leak.descriptionUseComposer перезапись description и descriptionSource.
- **supabase/functions/deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts** — isDescriptionInvalid(desc, { title }); импорт textContainsRequestContextLeak из _shared.
- **supabase/functions/deepseek-chat/domain/recipe_io/index.ts** — экспорт isDescriptionInvalid.
- **supabase/functions/_shared/requestContextLeakGuard.ts** — textContainsRequestContextLeak(text); фразы «для ребёнка», «для всей семьи» добавлены в REQUEST_CONTEXT_PHRASES.
- **supabase/functions/deepseek-chat/prompts.ts** — RECIPE_STRICT_JSON_CONTRACT и RECIPE_SYSTEM_RULES_V3: description 1–2 предложения, макс. 160, не повторять title, запреты по контексту и мед. обещаниям.

## Stage 2.4.1 scope (steps leakage guard)
- [x] request-context leakage guard extended to steps
- [x] steps cleaned locally without LLM retry (cleanStepFromRequestContextLeak: удаление фраз, fallback «Готово к подаче.» при пустом результате)
- [x] pool-safe recipe text ensured for steps
- [x] logs added (REQUEST_CONTEXT_LEAK_GUARD: stepsLeakDetected, stepsLeakCleaned, stepsLeakCount)

## Stage 2.4.1 key files
- **supabase/functions/_shared/requestContextLeakGuard.ts** — cleanStepFromRequestContextLeak(step); экспорт для использования в index.
- **supabase/functions/deepseek-chat/index.ts** — после обработки title/description/chefAdvice по leak: итерация по recipe.steps, проверка textContainsRequestContextLeak(step), замена на cleanStepFromRequestContextLeak(step); лог REQUEST_CONTEXT_LEAK_GUARD с stepsLeakDetected, stepsLeakCleaned, stepsLeakCount.

## Open questions (Stage 1)
- **Индекс по trust_level:** на Stage 1 не добавлен. Выборка пула фильтрует по source (существующий idx_recipes_pool_user_created) и по trust_level в приложении; при росте объёма можно добавить частичный индекс WHERE source IN (...) AND (trust_level IS NULL OR trust_level <> 'blocked').
- **source_lang в deepseek-chat:** передаётся null — надёжного источника языка запроса на Stage 1 нет; при появлении заголовка/контекста локали можно передавать его в source_lang.
- **user_custom в backfill:** для существующих рецептов с source = 'user_custom' выставлен trust_level = 'trusted' (рецепт пользователя).
