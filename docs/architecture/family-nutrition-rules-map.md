# Family Nutrition Rules Map

Карта того, где реализованы ограничения по питанию семьи/членов и какой источник истины используется для каждого правила. Основано на коде в `supabase/functions/`, `src/` и существующей документации.

---

## Overview

Правила питания в проекте делятся на: **Allergies** (жёсткий запрет), **Dislikes** (жёсткий запрет в рецепте и при блокировке запроса), **Likes / Preferences**  (мягкий или жёсткий в зависимости от контекста), **Age-based constraints** (младенец/малыш/школьник/взрослый, min/max возраст рецепта), **Infant safety** (без соли/сахара/мёда/цельного молока; запрещённые ключевые слова для ≤12 мес и 12–24 мес), **Family mode** (объединённые ограничения всех членов; младенцы <12 мес исключены из промпта, если есть член ≥12 мес; kid-safety 12–35 мес) и **Meal slot rules** (завтрак без супа, обед только супы при автозаполнении, проверки слотов). Реализация разнесена по **client** (пре-проверка чата, подбор из пула, validateRecipe), **Edge** (политики и промпты deepseek-chat, фильтрация пула generate-plan), **database** (members, allergy_items vs allergies, recipes.min/max_age_months, is_soup) и **dosc** (ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH, MEAL_TYPE_AND_LUNCH_SOUP, chat_recipe_generation, domain-map).

---

## Rules by Category

### Allergies

- **Rule:** Аллергены — абсолютный запрет в рецептах и в запросе пользователя в чате. Блокировка запроса: если сообщение содержит токен аллергена (кроме контекста «без X»), модель не вызывается, возвращается блокирующий ответ. Фильтрация рецептов: исключать рецепты, в названии/описании/ингредиентах которых есть заблокированные токены. Токены строятся из меток аллергий и алиасов (напр. BKM → milk/yogurt; см. allergyAliases).



### Dislikes

- **Rule:** Обрабатываются как жёсткий запрет: рецепт не должен содержать токены антипатий; запрос в чате с таким токеном блокируется (то же исключение «без X», что и для аллергий).
- **Where:** Edge: тот же пайплайн blockedTokens (dislikes передаются отдельным списком в buildBlockedTokenSet); checkRequestBlocked; generate-plan preferenceRules (passesPreferenceFilters, buildDislikeTokens). Client: chatBlockedCheck (dislikes в buildBlockedTokens/containsAnyToken), recipePool (getDislikeTokens, passesProfileFilter), validateRecipe (проверка подстроки для dislike). DB: `members.dislikes` (text[]).
- **Docs:** ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH, chat_recipe_generation.

### Likes / preferences

- **Rule:** Симпатии: мягкий сигнал в промптах («LIKES (soft)») и при скоринге пула плана (усиление/избегание по токенам симпатий). Предпочтения: семантические ограничения в промптах (напр. вегетарианское → без мяса/рыбы); в пуле и validateRecipe вегетарианство и предпочтения вида «без X» применяются как запреты.
- **Where:** Edge: `_shared/likesFavoring.ts` (buildLikesLine, shouldFavorLikes); buildPrompt / index (likes добавляются в системный промпт); generate-plan preferenceRules (buildLikeTokens, scoreLikeSignal, hasLikeMatch); prompts STRICT_RULES (предпочтения как ограничения). Client: buildPrompt/derivePayloadFromContext (likes в контексте); validateRecipe (VEGETARIAN_BANNED, “не”/“без” preferences). DB: `members.likes`, `members.preferences`.
- **Docs:** ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH (§7), chat_recipe_generation, docs/decisions/PREFERENCES_*.

### Age-based constraints

- **Rule:** Рецепт должен подходить по возрасту члена: recipe.min_age_months / max_age_months против age_months члена. Взрослый (≥216 мес) или тип adult/family: без возрастного фильтра по пулу; опционально исключать рецепты только для младенцев. Категории: infant ≤12, toddler 13–60, school 61–216, adult >216 (ageCategory).
- **Where:** Edge: `_shared/memberAgeContext.ts` (getMemberAgeContext, isAdultContext); generate-plan (recipeFitsAgeRange, recipeBlockedByInfantKeywords, passesProfileFilter для age <36); deepseek-chat ageCategory.ts и buildPrompt (AGE_CONTEXTS_SHORT, getAgeCategoryRules). Client: buildPrompt/derivePayloadFromContext (ageMonths в payload); recipePool passesProfileFilter (age_months < 36 → AGE_RESTRICTED_TOKENS). DB: `members.age_months`, `recipes.min_age_months`, `recipes.max_age_months`.
- **Docs:** chat_recipe_generation, MEAL_TYPE_AND_LUNCH_SOUP (возраст в payload), domain-map.

### Infant safety rules

- **Rule:** Возраст <12 мес: без соли, сахара, мёда, цельного молока; мягкие текстуры; правила в промпте. 12–24 мес: без стейка, жареного, копчёного, твёрдых кусочков (INFANT_FORBIDDEN_12, TODDLER_UNDER_24_FORBIDDEN в generate-plan). 12–35 мес: блок kid-safety в промпте (KID_SAFETY_1_3_INSTRUCTION): минимум соли/сахара, без фритюра/острого/копчёного, избегать риска подавиться.
- **Where:** Edge: промпты deepseek-chat (SAFETY_RULES, RECIPE_SYSTEM_RULES_V3, AGE_CONTEXTS_SHORT.infant, getAgeCategoryRules); KID_SAFETY_1_3_INSTRUCTION при applyKidFilter (familyMode.getFamilyPromptMembers); generate-plan recipeBlockedByInfantKeywords (AGE_RESTRICTED, INFANT_FORBIDDEN_12, TODDLER_UNDER_24_FORBIDDEN). Client: отдельного фильтра по ключевым словам для младенцев нет; возраст передаётся на Edge.
- **Docs:** chat_recipe_generation, system-prompts-map (guardrails).

### Family mode rules

- **Rule:** При цели «семья»: объединять аллергии, антипатии, симпатии, предпочтения всех членов; в промпте чата исключать младенцев <12 мес, если есть член ≥12 мес; использовать контекстный блок семьи, собранный на сервере (без «Children:», без «safe for ALL children»); применять kid-safety, если есть член 12–35 мес. План: при member_id = null используется buildFamilyMemberDataForPlan; фильтрация пула по объединённому member_data.
- **Where:** Edge: `_shared/familyMode.ts` (getFamilyPromptMembers, buildFamilyMemberDataForPlan, buildFamilyConstraints); `_shared/familyContextBlock.ts` (buildFamilyGenerationContextBlock); deepseek-chat index (переопределение effectiveGenerationContextBlock); generate-plan (effectiveMemberId null → buildFamilyMemberDataForPlan). Client: buildGenerationContext (mode family, targets), derivePayloadFromContext (allMembers), FamilyContext.
- **Docs:** chat_recipe_generation, ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH, domain-map.

### Meal slot rules

- **Rule:** Завтрак: без супа/борщ/рагу/плов (slotSanityCheck). Обед: только суповые рецепты при автозаполнении (resolved meal_type = lunch через SOUP_TOKENS); в слоте обеда не допускаются сырник/оладьи/каша/гранола/тост. Полдник: без суп/борщ/рагу/плов/каша/сырник. Ужин: без йогурт/творог/печенье/батончик/смузи. assign_recipe_to_plan_slot не меняет recipes.meal_type и recipes.is_soup.
- **Where:** Edge: generate-plan (slotSanityCheck, getResolvedMealType, inferMealTypeFromTitle, SOUP_TOKENS; фильтр по resolved === slot); _shared/recipeCanonical (resolveMealType, is_soup для обеда). Client: recipePool (isSoupLikeTitle, getSanityBlockedReasons) для «Подобрать рецепты»; UI плана и assign_recipe_to_plan_slot RPC. DB: `recipes.meal_type`, `recipes.is_soup`; RPC assign_recipe_to_plan_slot только обновляет meal_plans_v2.meals.
- **Docs:** docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md, domain-map, change-safety-checklist.

---

## Where Each Rule Is Applied

| Rule category      | Client | Edge | Database | Docs |
|---------------------|--------|------|----------|------|
| **Allergies**       | chatBlockedCheck, allergenTokens, recipePool passesProfileFilter, validateRecipe | checkRequestBlocked, blockedTokens, allergyAliases, allergens; preferenceRules passesPreferenceFilters; prompt {{allergies}} | members.allergy_items, members.allergies | ALLERGIES_AND_PLAN, chat_recipe_generation |
| **Dislikes**        | chatBlockedCheck, recipePool, validateRecipe | checkRequestBlocked, blockedTokens; preferenceRules passesPreferenceFilters, buildDislikeTokens; prompt | members.dislikes | ALLERGIES_AND_PLAN, chat_recipe_generation |
| **Likes**           | buildPrompt/derivePayloadFromContext | likesFavoring (buildLikesLine, shouldFavorLikes); prompt; preferenceRules scoreLikeSignal, hasLikeMatch | members.likes | ALLERGIES_AND_PLAN §7, PREFERENCES_* |
| **Preferences**     | validateRecipe (VEGETARIAN_BANNED, “не”/“без”) | STRICT_RULES, preferenceRules passesPreferenceFilters (allergy tokens from preferences where applicable) | members.preferences | ALLERGIES_AND_PLAN, prompts |
| **Age-based**       | recipePool passesProfileFilter (age <36), payload ageMonths | memberAgeContext; generate-plan recipeFitsAgeRange, recipeBlockedByInfantKeywords, passesProfileFilter; buildPrompt ageRule, getAgeCategoryRules | members.age_months, recipes.min/max_age_months | chat_recipe_generation, domain-map |
| **Infant safety**   | — | prompts SAFETY_RULES, RECIPE_SYSTEM_RULES_V3, KID_SAFETY_1_3; generate-plan recipeBlockedByInfantKeywords; getFamilyPromptMembers applyKidFilter | — | chat_recipe_generation, system-prompts-map |
| **Family mode**     | buildGenerationContext, derivePayloadFromContext, FamilyContext | familyMode, familyContextBlock; index effectiveGenerationContextBlock; generate-plan buildFamilyMemberDataForPlan | members (all) | chat_recipe_generation, ALLERGIES_AND_PLAN |
| **Meal slot**       | recipePool (isSoupLikeTitle, getSanityBlockedReasons), assign RPC | generate-plan slotSanityCheck, getResolvedMealType, filter by slot; recipeCanonical resolveMealType, is_soup | recipes.meal_type, recipes.is_soup, meal_plans_v2.meals | MEAL_TYPE_AND_LUNCH_SOUP, domain-map |

---

## Source of Truth

| Rule category | Current source of truth |
|---------------|-------------------------|
| **Allergies** | **Набор токенов:** Edge `_shared/allergyAliases.ts` + `_shared/allergens.ts` (buildBlockedTokensFromAllergies). Клиент должен быть в синхронизации через `src/utils/allergyAliases.ts` и `src/utils/allergenTokens.ts`. **Данные:** `members.allergy_items` (предпочтительно), запасной вариант `members.allergies`. |
| **Dislikes**  | **Набор токенов:** тот же пайплайн, что и для аллергий (blockedTokens), для блокировки запроса; для фильтрации рецептов Edge использует getBlockedTokensFromAllergies(dislikes), клиент — tokenize(dislikes) в recipePool. **Данные:** `members.dislikes`. |
| **Likes**     | **Данные:** `members.likes`. **Текст промпта:** _shared/likesFavoring. **Скоринг:** generate-plan preferenceRules (buildLikeTokens, scoreLikeSignal). Единого «словаря» для симпатий нет. |
| **Preferences** | **Данные:** `members.preferences`. **Семантика:** deepseek-chat STRICT_RULES (prompts.ts); клиент validateRecipe (VEGETARIAN_BANNED, «не»/«без»). Edge preferenceRules использует токены в стиле аллергий для предпочтений, связанных с аллергиями. |
| **Age-based** | **Данные:** `members.age_months`; `recipes.min_age_months`, `recipes.max_age_months`. **Категории:** deepseek-chat ageCategory.ts (getAgeCategory, getAgeCategoryRules). **Фильтр плана:** _shared/memberAgeContext (getMemberAgeContext, isAdultContext); generate-plan recipeFitsAgeRange. |
| **Infant safety** | **Текст промпта:** промпты deepseek-chat (SAFETY_RULES, AGE_CONTEXTS_SHORT, KID_SAFETY_1_3_INSTRUCTION). **Ключевые слова пула:** generate-plan index (AGE_RESTRICTED, INFANT_FORBIDDEN_12, TODDLER_UNDER_24_FORBIDDEN). Колонки в БД нет; логика только в коде и промптах. |
| **Family mode** | **Логика:** _shared/familyMode.ts (getFamilyPromptMembers, buildFamilyMemberDataForPlan), _shared/familyContextBlock.ts. **Данные:** все члены семьи пользователя. **Документация:** ALLERGIES_AND_PLAN (как объединять аллергии для плана). |
| **Meal slot**  | **Канонический документ:** docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md. **Применение:** generate-plan slotSanityCheck + getResolvedMealType + фильтр по слоту; _shared/recipeCanonical resolveMealType, is_soup. **Данные:** recipes.meal_type, recipes.is_soup. |

---

## Duplicate / Split Logic Risks

- **Allergy/dislike tokens:** Implemented in **three** places: (1) Edge `_shared/blockedTokens.ts` + `allergyAliases` + `allergens` for request blocking and recipe checks; (2) Edge generate-plan `preferenceRules.ts` (getBlockedTokensFromAllergies for passesPreferenceFilters); (3) Client `allergenTokens.ts` + `allergyAliases.ts` + `chatBlockedCheck.ts` and `recipePool.ts`. If aliases or token rules change, all three must be updated. **Risk:** Client uses buildBlockedTokens (allergyAliases) but recipePool also uses tokenize(dislikes) for dislikes; Edge uses same allergy pipeline for both. Doc ALLERGIES_AND_PLAN notes the “разрыв” (e.g. “курица” vs “курицей”) and recommends one shared token dictionary.
- **Age / infant keywords:** **generate-plan** задаёт свои AGE_RESTRICTED, INFANT_FORBIDDEN_12, TODDLER_UNDER_24_FORBIDDEN и recipeBlockedByInfantKeywords. **deepseek-chat** использует текст промптов (SAFETY_RULES, AGE_CONTEXTS_SHORT, KID_SAFETY_1_3) и getAgeCategoryRules. Изменение правил для младенцев/малышей в одном месте без второго может рассинхронизировать вывод модели и пул.
- **Likes:** **Prompt:** _shared/likesFavoring (buildLikesLine). **Scoring:** generate-plan preferenceRules (buildLikeTokens, tokenizeList with stem). Client does not score likes for pool (only Edge does for plan). No duplicate for “which likes” data (members.likes), but two different tokenization strategies (prompt line vs tokenizeList).
- **Preferences / vegetarian:** **Prompt:** STRICT_RULES (semantic “вегетарианское” → no meat/fish). **Client validateRecipe:** VEGETARIAN_BANNED list. **Edge pool:** preferenceRules passesPreferenceFilters uses allergy tokens only (allergies + dislikes), not a separate vegetarian check. So vegetarian is enforced in prompt and in client post-parse validation, but plan pool filtering does not explicitly add vegetarian bans beyond allergies/dislikes.
- **Meal type / lunch = soup:** **generate-plan** infers meal type from title/description/ingredients (SOUP_TOKENS, inferMealTypeFromTitle, getResolvedMealType) and filters by slot; it does not read `recipes.is_soup` in the current pool type (RecipeRowPool). **recipeCanonical** and DB have `is_soup`. So “lunch = soup” in plan is effectively “resolved === lunch” where lunch is inferred from soup-like tokens; if is_soup were used in pool select, it would need to be added to the query and type.
- **Family context block:** Собирается только на Edge (buildFamilyGenerationContextBlock). Клиент отправляет generationContextBlock, но Edge перезаписывает его в режиме семьи. Дублирования логики нет; единственный источник на Edge.

---

## Safe Change Guidance

- **Allergies:** Перед изменением правил аллергий или алиасов: (1) обновить Edge `_shared/allergyAliases.ts` и/или `_shared/allergens.ts`; (2) синхронизировать клиент `src/utils/allergyAliases.ts` и `src/utils/allergenTokens.ts` (или общий пакет при его появлении); (3) при наличии — запустить скрипт сборки (напр. sync-allergens-dict); (4) обновить docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md при изменении источника истины или потока. Не менять только клиент или только Edge.
- **Dislikes:** Для блокировки запроса — как у аллергий (blockedTokens). Для фильтрации рецептов Edge использует preferenceRules (getBlockedTokensFromAllergies для dislikes); клиент recipePool — getDislikeTokens (tokenize). Если нужен один набор токенов для антипатий — унифицировать по той же стратегии, что и аллергии, или зафиксировать отличие в документации.
- **Likes / preferences:** Changing “likes as soft signal” затрагивает промпты (likesFavoring) и скоринг плана (preferenceRules). Изменение “preferences as strict” affects prompts (STRICT_RULES) and client validateRecipe (VEGETARIAN_BANNED, “не”/“без”). Обновлять и текст промпта, и валидацию при добавлении новой семантики предпочтений.
- **Age-based / infant safety:** При изменении возрастных категорий или правил для младенцев/малышей: (1) deepseek-chat ageCategory.ts и промпты (AGE_CONTEXTS_SHORT, getAgeCategoryRules, SAFETY_RULES, KID_SAFETY_1_3); (2) generate-plan recipeFitsAgeRange, recipeBlockedByInfantKeywords и константы (AGE_RESTRICTED, INFANT_FORBIDDEN_12, TODDLER_UNDER_24_FORBIDDEN); (3) _shared/memberAgeContext при изменении границы взрослый/ребёнок. Держать правила в промптах и списки ключевых слов пула согласованными.
- **Family mode:** При изменении состава участников или способа сборки контекста: _shared/familyMode.ts (getFamilyPromptMembers, buildFamilyMemberDataForPlan) и _shared/familyContextBlock.ts; deepseek-chat index (effectiveGenerationContextBlock). Обновить ALLERGIES_AND_PLAN при изменении объединения аллергий для плана или контракта payload плана.
- **Meal slot rules:** Changing “lunch = soup” or slot sanity: generate-plan slotSanityCheck, getResolvedMealType, inferMealTypeFromTitle, SOUP_TOKENS and SANITY_*; _shared/recipeCanonical if payload/DB is_soup is involved. Update docs/decisions/MEAL_TYPE_AND_LUNCH_SOUP.md and change-safety-checklist. Do not add UPDATE to recipes in assign_recipe_to_plan_slot.
- **Database:** members.allergy_items vs allergies: предпочтительно allergy_items; любая новая “active allergies” logic should use allergy_items and normalize_allergies_for_free. recipes.meal_type и is_soup: задаются только при создании (create_recipe_with_steps); не менять в assign_recipe_to_plan_slot.
