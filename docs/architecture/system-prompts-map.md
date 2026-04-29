# System Prompts Map

Map of all AI prompts used by Edge Functions. Based on real code in `supabase/functions/`. Use when modifying prompt logic to avoid breaking other systems.

---

## Overview

**Which Edge Functions use AI:** **deepseek-chat** calls an AI model (DeepSeek API at `https://api.deepseek.com/v1/chat/completions`). **vk-preview-plan** uses the same API endpoint for an optional **anonymous** JSON fill of missing meal slots (не пишет в `recipes` / `meal_plans_v2`; только ответ HTTP). **generate-plan** does not call an LLM; it fills meal slots from the recipe pool only (pickFromPoolInMemory). Other Edge Functions (track-usage-event, payment-webhook, create-payment, share-og, share-og-plan) do not use AI.

**How prompts are built:** System prompts are assembled in **deepseek-chat/index.ts** from:
- Template constants in **deepseek-chat/prompts.ts** (FREE_RECIPE_TEMPLATE, PREMIUM_RECIPE_TEMPLATE, SOS_PROMPT_TEMPLATE, BALANCE_CHECK_TEMPLATE, RECIPE_SYSTEM_RULES_V3, etc.)
- **buildPrompt.ts**: `applyPromptTemplate()` (replaces `{{...}}` placeholders), `generateRecipeSystemPromptV3()`, `getSystemPromptForType()`
- **promptByTariff.ts**: `buildPromptByProfileAndTariff()` (tariff appendix, maxTokens, useAllAllergies, familyBalanceNote)
- **ageCategory.ts**: `getAgeCategoryRules()` (infant/toddler/school/adult rules)
- **_shared/familyContextBlock.ts**: `buildFamilyGenerationContextBlock()` (server-truth family context when targetIsFamily)
- **_shared/memberConstraints.ts**: `getFamilyContextPromptLine()` / `getFamilyContextPromptLineEmpty()` for `{{familyContext}}`
- **_shared/likesFavoring.ts**: `shouldFavorLikes()` (~20% deterministic), `buildLikesLine()` / `buildLikesLineForProfile()` (soft wording for **non-recipe** path when favor roll hits).
- **_shared/chatLikesSignal.ts**: `detectRepeatedLikesInRecentTitles()`, `buildRecipeSoftLikesPromptBlock()`, `buildLikesAntiRepeatPromptLine()` — **recipe-path** likes only in `index.ts` (not inside `generateRecipeSystemPromptV3` CONTEXT); anti-repeat vs last 3 title keys.

**Where system prompts live:** All recipe/SOS/balance templates and rule blocks are in **deepseek-chat/prompts.ts**. Build logic is in **deepseek-chat/buildPrompt.ts** and **deepseek-chat/promptByTariff.ts**. Final assembly (including family override, **likes soft signal + anti-repeat**, extraSuffix, KID_SAFETY) is in **deepseek-chat/index.ts** (approx. lines 523–675). **Likes in recipe JSON path:** not injected into `generateRecipeSystemPromptV3` [CONTEXT] (avoids treating profile likes as mandatory every turn); optional blocks from **chatLikesSignal** + **LIKES_DIVERSITY_RULE** when `shouldFavorLikes` and no recent like-overlap in titles.

**Where user message is inserted:** For recipe path: only the latest user message is sent as a single `user` message in `messagesForPayload`. For non-recipe (SOS, balance_check): `userMessage` is injected into the template via `{{userMessage}}` in SOS_PROMPT_TEMPLATE and BALANCE_CHECK_TEMPLATE. For chat/recipe with history, `messages` from the client can include multiple turns; for recipe request with `response_format: { type: "json_object" }` the payload is `[{ role: "user", content: userMessage }]`.

**Where family/member context is inserted:** In **buildPrompt.ts** `applyPromptTemplate()`: `{{target_profile}}`, `{{ageMonths}}`, `{{ageRule}}`, `{{allergies}}`, `{{preferences}}`, `{{familyContext}}`, `{{generationContextBlock}}`. In **index.ts**, when `targetIsFamily` and allMembersForPrompt.length > 0, the client-supplied `generationContextBlock` is replaced by server-built **buildFamilyGenerationContextBlock()** (no "Children:", no infants <12m in prompt when there is at least one member ≥12m; kid-safety 12–35 mo added when applyKidFilter).

---

## Chat Recipe Generation Prompt

**Edge Function:** deepseek-chat (types `chat`, `recipe` when generating a recipe).

**Main system prompt location:** For recipe path (`isRecipeRequest`): **generateRecipeSystemPromptV3()** in **buildPrompt.ts** (compact prompt). Для одного ребёнка **0–11 мес** отдельного промпта нет: **LLM не вызывается**, возвращается ответ **under_12_curated_recipe_block** (см. **recipeGenerationRouting.ts**, **chat_recipe_generation.md**). For non-recipe path: **getSystemPromptForType("chat" | "recipe", ...)** which uses **FREE_RECIPE_TEMPLATE** or **PREMIUM_RECIPE_TEMPLATE** from **prompts.ts** and **applyPromptTemplate()**.

**Prompt builder:** **buildPrompt.ts** — `applyPromptTemplate()`, `generateRecipeSystemPromptV3()`, `getSystemPromptForType()`. Placeholders: `{{target_profile}}`, `{{ageMonths}}`, `{{ageRule}}`, `{{allergies}}`, `{{allergiesExclude}}`, `{{preferences}}`, `{{familyContext}}`, `{{userMessage}}`, `{{mealType}}`, `{{maxCookingTime}}`, `{{servings}}`, `{{recentTitleKeysLine}}`, `{{generationContextBlock}}`. **Recipe-path V3 [CONTEXT]** includes allergies/dislikes and meal meta only — **not** profile likes (likes appended in **index.ts** with gating).

**Family context injection:** In **index.ts**: when `targetIsFamily` and allMembersForPrompt.length > 0, `effectiveGenerationContextBlock` is set to **buildFamilyGenerationContextBlock()** from **_shared/familyContextBlock.ts** (members list with age, allergies, dislikes, likes; "FAMILY MODE (shared table)"; kid safety line if applyKidFilter). Otherwise `{{familyContext}}` comes from **getFamilyContextPromptLine()** / **getFamilyContextPromptLineEmpty()** in **_shared/memberConstraints.ts**.

**Allergy filtering:** Allergies (and dislikes) are inserted into the prompt as text (e.g. "ИСКЛЮЧИТЬ (аллергия): …"). **Before** the model is called, **domain/policies/checkRequestBlocked.ts** runs: **buildBlockedTokenSet()** (_shared/blockedTokens) and **containsAnyTokenForAllergy()** (_shared/allergensDictionary) on the user message (after **textWithoutExclusionPhrases()**, lowercased) — same substring semantics as the client. If matched, the request is blocked and a JSON response is returned (blockedResponse.buildBlockedMessageEdge, getSuggestedAlternatives, extractIntendedDishHint); no LLM call. Token set is built from **_shared/allergyAliases.ts** via **_shared/allergens.ts** (getBlockedTokensFromAllergies). **CMPA (cow's milk protein allergy):** **CMPA_SAFETY_RULE** in **prompts.ts** is always included in the recipe system prompt (buildPrompt.generateRecipeSystemPromptV3): the model must never suggest lactose-free dairy or goat milk as substitutes; only fully non-dairy alternatives. **_shared/allergyAliases.ts** БКМ tokens include "коз", "козий", "козье", "безлактоз", "безлактозный", "goat", "lactose-free" so such recipes are detected and not saved / blocked.

**Recipe parsing rules:** Для **живого JSON recipe-path** system prompt собирается из **generateRecipeSystemPromptV3** и включает **RECIPE_SYSTEM_RULES_V3** (внутри — **CHEF_ADVICE_RULES**), **MEAL_SOUP_RULES**, **CMPA_SAFETY_RULE**, плюс условные куски в **index.ts** (likes и т.д.). Константа **RECIPE_STRICT_JSON_CONTRACT** в **prompts.ts** — **справочный** полный текст контракта (тесты, документация); в промпт **не** интерполируется. **RULES_USER_INTENT**, **STRICT_RULES**, **SAFETY_RULES** относятся к шаблонам **FREE_RECIPE_TEMPLATE** / **PREMIUM_RECIPE_TEMPLATE** для **non-recipe** пути, не к V3 JSON. **CHEF_ADVICE_RULES** в промпте короткий; детальный отсев — в **chefAdviceQuality.ts** / **enforceChefAdvice** → `string | null`. **MEAL_SOUP_RULES**: супы только для lunch; для dinner/breakfast/snack супы не предлагать; для запроса на обед — только супы и аналоги (окрошка и т.п.). Validation and parsing: **recipeSchema.ts** (Zod), **domain/recipe_io** (sanitizeAndRepair, **chefAdviceQuality.ts**, enforceChefAdvice → `string | null`), **_shared/parsing** (validateRecipe, retryFixJson). **`chefAdvice`:** LLM → sanitize → **prepareChefAdvicePipeline** → **hasForbiddenChefAdviceStart** → **isChefAdviceLowValue** (ровно одно предложение, длина ≤ **CHEF_ADVICE_MAX_LENGTH** 160; вводные «Для более»/«Чтобы» — только вместе с якорём, действием и эффектом) → **enforceChefAdvice**; слабый совет → **`null`**. **Второй полный вызов модели из-за провала гейта `chef_advice` не выполняется**. Диагностика: **CHEF_ADVICE_DEBUG=true** — лог `CHEF_ADVICE_DEBUG` (как ранее). **`recipes.description`:** **pickCanonicalDescription** — LLM-текст, если **passesDescriptionQualityGate** (1–2 предложения; **38–210** симв. — `DESCRIPTION_QUALITY_MIN_LENGTH` / `DESCRIPTION_MAX_LENGTH`; при двух предложениях минимум **45** — `DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH`; штампы, нутритивный маркер, не дубль title, завершённое последнее предложение) и нет **textContainsRequestContextLeak**; иначе **buildRecipeBenefitDescription**. Числа **38 / 210 / 45** зашиты в гейт и **подставляются в промпт** из `sanitizeAndRepair.ts`, чтобы промпт и пост-обработка совпадали. Для `description` в V3 явно указано **до 210 симв.** (не ориентир ~160), чтобы реже терять LLM-текст на гейте. Клиент **`createRecipe` с `source: 'chat_ai'`** не подменяет description на benefit после RPC (`useRecipes.tsx`). Диагностика описания: **CHAT_DESCRIPTION_DEBUG=true**. Перед вызовом LLM в лог пишется **SENDING PAYLOAD_META** (длины и метаданные), без полного тела payload. **_shared/recipeCanonical.ts**, RPC **create_recipe_with_steps**. Триггер **recipes_validate_not_empty**: непустой **description**; `chef_advice` и `advice` могут быть NULL.

**Curated-only 0–11 мес (recipe generation):** В **index.ts** после **resolveRecipeGenerationRoute**: при **under_12_curated_block** возвращается **`buildUnder12CuratedRecipeBlockPayload()`** без вызова модели. Лог: **`under_12_curated_recipe_block`**. Отдельных infant-промптов/валидаторов в репозитории нет.

**Files involved:** deepseek-chat/prompts.ts, deepseek-chat/buildPrompt.ts, deepseek-chat/promptByTariff.ts, deepseek-chat/ageCategory.ts, deepseek-chat/index.ts, deepseek-chat/recipeSchema.ts, deepseek-chat/domain/recipe_io/*, deepseek-chat/domain/recipe_generation/recipeGenerationRouting.ts, deepseek-chat/domain/policies/checkRequestBlocked.ts, deepseek-chat/domain/policies/blockedResponse.ts, deepseek-chat/domain/family/index.ts, _shared/blockedTokens.ts, _shared/allergens.ts, _shared/allergyAliases.ts, _shared/familyContextBlock.ts, _shared/familyMode.ts, _shared/memberConstraints.ts, _shared/likesFavoring.ts, _shared/chatLikesSignal.ts, _shared/parsing/*, _shared/recipeCanonical.ts.

---

## Plan Generation Prompt

**Edge Function:** generate-plan.

**AI prompt for plan generation:** **generate-plan does not create or use an AI prompt.** It fills meal slots by selecting from the recipe pool (**fetchPoolCandidates**, **pickFromPoolInMemory**) using filters: meal_type, is_soup (lunch = soup-only), profile (allergies, dislikes, preferences, age), exclude ids/titles, variety. **Likes** in `member_data` are **not** used for plan pool ranking (see **PLAN_MENU_PROFILE_AND_RECIPE_SELECTION.md** §4). No LLM is invoked; **aiFallbackCount** in the response is derived from slots filled from pool (totalAiCount is not incremented in the current loop — only totalDbCount when a recipe is picked). If in the future an AI fallback is added for empty slots, it would likely call deepseek-chat or a similar recipe-generation path; there is no such call in the current codebase.

**Context used for plan:** member_data from request body: **allergies, dislikes, age_months, preferences** (and optional fields the client may send, e.g. likes — ignored by generate-plan for scoring); pool candidates from DB (source in seed, starter, manual, week_ai, chat_ai). Meal slots are described by **MEAL_KEYS** (breakfast, lunch, snack, dinner). **Lunch = soup** is enforced in **pickFromPoolInMemory** (and related filtering) by requiring `is_soup` or soup-like category for lunch slot.

**Files involved:** generate-plan/index.ts, _shared/allergens.ts, _shared/planValidation.ts, _shared/plan/familyDinnerFilter.ts, generate-plan/preferenceRules.ts.

---

## Balance Check Prompt

**Edge Function / feature:** deepseek-chat with `type === "balance_check"`.

**Prompt template:** **BALANCE_CHECK_TEMPLATE** in **prompts.ts**:
- "Ты — ИИ-нутрициолог. Проанализируй тарелку ребенка: {{userMessage}}."
- "Учитывай возраст {{ageMonths}} мес."
- "Скажи, чего не хватило (белок, жиры, клетчатка, железо) и что предложить в следующий раз."
- "Будь краток и позитивен."

**Input format:** User message (description of the plate) is passed in the request body; inserted into template as `{{userMessage}}`. Member age from memberData as `{{ageMonths}}`. Built via **getSystemPromptForType("balance_check", memberData, ..., userMessage)** → **applyPromptTemplate(BALANCE_CHECK_TEMPLATE, ..., { userMessage })**.

**Output format expected:** Free-form text (no JSON). Response is stored in **plate_logs** (user_message, assistant_message) and returned in the chat response. No recipe parsing.

**Files involved:** deepseek-chat/prompts.ts (BALANCE_CHECK_TEMPLATE), deepseek-chat/buildPrompt.ts (getSystemPromptForType), deepseek-chat/index.ts (type === "balance_check", plate_logs insert).

---

## SOS Consultant Prompt

**Edge Function / feature:** deepseek-chat with `type === "sos_consultant"`.

**System prompt:** **SOS_PROMPT_TEMPLATE** in **prompts.ts**:
- Role: "Ты — дежурный нутрициолог Mom Recipes."
- "Вся помощь только в ответе чата. Без статей/внешних ссылок"
- "Профиль уже выбран: {{target_profile}}, возраст {{ageMonths}} мес. НЕ проси выбрать профиль. НЕ начинай с приветствий (Здравствуйте и т.п.). Отвечай сразу по сути."
- "Дай краткий ответ (до 500 знаков)."
- Structure: "1. 🔍 Возможная причина. 2. ✅ Прямо сейчас сделай: (3 шага). 3. ⚠️ К врачу если: (красные флаги)."
- "Данные: Ребенок {{ageMonths}} мес, аллергии: {{allergies}}. Вопрос: {{userMessage}}"

**Safety rules:** **NO_ARTICLES_RULE** (no links to articles; help only in chat). No recipe generation. Response is plain text; no JSON.

**Allowed responses:** Short text (up to ~500 chars), structured as cause / immediate steps / when to see a doctor. Written to chat response; no usage_events for "chat_recipe", but **help** is written to usage_events after successful response (for free limit).

**Files involved:** deepseek-chat/prompts.ts (SOS_PROMPT_TEMPLATE, NO_ARTICLES_RULE), deepseek-chat/buildPrompt.ts (getSystemPromptForType("sos_consultant")), deepseek-chat/index.ts.

---

## Prompt Context Sources

| Source | How it enters the prompt |
|--------|---------------------------|
| **members** | From request body (memberData, allMembers). Used for target_profile, ageMonths, ageRule, allergies, preferences, dislikes, likes. In family mode, buildFamilyGenerationContextBlock(membersForPrompt) builds the context block; getFamilyPromptMembers (familyMode) can exclude infants <12m. |
| **recipes** | Not injected as text into chat prompt. Recipe pool in generate-plan is from DB (fetchPoolCandidates). |
| **family context** | **getFamilyContextPromptLine()** / **getFamilyContextPromptLineEmpty()** for `{{familyContext}}` in templates. In family mode with members, **buildFamilyGenerationContextBlock()** replaces the client generationContextBlock. |
| **generation context** | Client sends **generationContextBlock**; in family mode it is replaced by server **buildFamilyGenerationContextBlock()**. For single profile, block can be used in **applyPromptTemplate** as `{{generationContextBlock}}` in non-recipe path. |
| **chat history** | **fetchRecentTitleKeys()** in index.ts reads recent recipe_id from chat_history (14 days) to build **recentTitleKeysLine** ("Не повторяй: …") and avoid duplicate recipe titles; title keys are ordered by chat message time. The same ordered list feeds **likes anti-repeat** (last 3 titles vs profile likes). Not the full message history for recipe path (only userMessage for that turn). |
| **plan context** | generate-plan uses member_data and pool only; no prompt string from plan. |

---

## Prompt Guardrails

- **Allergy blocking:** Before LLM call, **domain/policies/checkRequestBlocked.ts** uses **_shared/blockedTokens.ts** (buildBlockedTokenSet), **_shared/allergensDictionary.ts** (**containsAnyTokenForAllergy**, same substring semantics as client), and **_shared/allergyAliases.ts** (via getBlockedTokensFromAllergies in allergens.ts). If the user message contains an allergen or dislike token (after removing "без X" phrases), the request is blocked and a structured JSON response is returned (blockedResponse). **Files:** deepseek-chat/domain/policies/checkRequestBlocked.ts, domain/policies/blockedResponse.ts, _shared/blockedTokens.ts, _shared/allergensDictionary.ts, _shared/allergens.ts, _shared/allergyAliases.ts.

- **Dislike blocking:** Same pipeline as allergy; dislikes are passed to buildBlockedTokenSet as dislikeItems; **containsAnyTokenForAllergy** checks the user message. **Files:** same as above.

- **Family safety rules:** **buildFamilyGenerationContextBlock** does not include infants <12m when at least one member is ≥12m (getFamilyPromptMembers in familyMode). **KID_SAFETY_1_3_INSTRUCTION** (prompts.ts) is appended when applyKidFilter (children 12–35 mo). **Files:** _shared/familyContextBlock.ts, _shared/familyMode.ts, deepseek-chat/prompts.ts (KID_SAFETY_1_3_INSTRUCTION), deepseek-chat/index.ts.

- **Infant restrictions:** **AGE_CONTEXTS_SHORT.infant** and **getAgeCategoryRules("infant")** (ageCategory.ts): no salt, sugar, honey, whole milk; soft textures. In **RECIPE_SYSTEM_RULES_V3** and **SAFETY_RULES**: age <12 mo rules. **Files:** deepseek-chat/prompts.ts, deepseek-chat/ageCategory.ts, deepseek-chat/buildPrompt.ts.

---

## Prompt Output Format

**Recipe JSON:** The model is asked to return a single JSON object (response_format: json_object for recipe path). Expected structure (фактически из **RECIPE_SYSTEM_RULES_V3** + контекст; справочно **RECIPE_STRICT_JSON_CONTRACT**): title, description (Zod max 210; для принятия сырого LLM-текста — **passesDescriptionQualityGate**: 38–210 симв., 1–2 предложения, при двух предложениях ≥45 симв., нутритивный или сенсорный маркер; при провале — **repairChatRecipeDescription**, затем снова гейт; финальный запасной текст — **buildEmergencyChatRecipeDescription**; оркестратор **resolveChatRecipeCanonicalDescription**), ingredients [{ name, amount }] (max 10), steps (5–7, max 150 chars each), cookingTime, mealType (breakfast|lunch|dinner|snack), servings, chefAdvice (Zod до 220; финально ≤ **CHEF_ADVICE_MAX_LENGTH** 160 или null), nutrition (kcal_per_serving, protein_g_per_serving, fat_g_per_serving, carbs_g_per_serving, is_estimate: true).

**Validation:** **recipeSchema.ts** (Zod schema), **domain/recipe_io** (sanitizeAndRepair, **resolveChatRecipeCanonicalDescription**, **pickCanonicalDescription** — последний остаётся для тестов/совместимости, enforceChefAdvice), **_shared/parsing** (validateRecipe, retryFixJson, getRecipeOrFallback). Normalization of mealType, nutrition, ingredients (canonical amount/unit) in recipeSchema and parsing. After validation, **canonicalizeRecipePayload** (_shared/recipeCanonical) builds payload for **create_recipe_with_steps** RPC.

**Where validation happens:** deepseek-chat/index.ts after LLM response: parse response body, extract JSON, validateRecipe (parsing); затем санитайзеры, **resolveChatRecipeCanonicalDescription**, **enforceChefAdvice**, сохранение. **Files:** deepseek-chat/recipeSchema.ts, deepseek-chat/domain/recipe_io/index.ts, deepseek-chat/domain/recipe_io/sanitizeAndRepair.ts, deepseek-chat/domain/recipe_io/resolveChatRecipeCanonicalDescription.ts, deepseek-chat/domain/recipe_io/chatDescriptionRepair.ts, deepseek-chat/domain/recipe_io/chatEmergencyDescription.ts, _shared/parsing/index.ts, _shared/recipeCanonical.ts.

---

## VK preview plan (anonymous day slots)

**Edge Function:** **vk-preview-plan** (`supabase/functions/vk-preview-plan/`).

**Model:** DeepSeek Chat Completions (`https://api.deepseek.com/v1/chat/completions`), `response_format: { type: "json_object" }`, вызывается **только** если после DB-first в слотах &lt; 3 приёмов пищи.

**Prompt location:** Inline system + user strings in **vk-preview-plan/aiSlots.ts** (`fetchAiMealsForSlots`). Не использует **deepseek-chat/prompts.ts** и не пишет рецепты в БД. System-часть требует **конкретное название блюда** в `title` и запрещает общие фразы без имени блюда.

**Output:** JSON `{ "meals": [ { "type", "title", "description?", "calories?", "protein?", "fat?", "carbs?", "nutrition_goals?" } ] }` — только недостающие `type`; `nutrition_goals` — 1–3 ключа из whitelist БД; при ошибке/таймауте слоты добиваются **mock** в **mockSlots.ts**.

**Files:** vk-preview-plan/index.ts, vk-preview-plan/orchestrate.ts, vk-preview-plan/slotDb.ts, vk-preview-plan/aiSlots.ts, vk-preview-plan/mockSlots.ts.

---

## Token Usage Tracking

**Table:** **token_usage_log** (user_id, action_type, input_tokens, output_tokens, total_tokens, created_at).

**Action types:** Set in **deepseek-chat/index.ts** after the LLM response from `data.usage`: `plan_replace` (when fromPlanReplace), `sos_consultant` (type === "sos_consultant"), `balance_check` (type === "balance_check"), `chat_recipe` (type === "chat" or "recipe" and not plan_replace), else `other`.

**Where logging occurs:** **deepseek-chat/index.ts** (approx. lines 1005–1028): if usageObj exists and userId and supabase, insert into token_usage_log with action_type and token counts from response (prompt_tokens/input_tokens, completion_tokens/output_tokens, total_tokens).

**Files:** deepseek-chat/index.ts.

---

## Safe Prompt Editing Rules

- Do not change the prompt structure (placeholders, sections) without updating the parser and **applyPromptTemplate** replacers (buildPrompt.ts). New placeholders must be added to the replace list.
- Do not remove or relax allergy/dislike guardrails (checkRequestBlocked, buildBlockedTokenSet, textWithoutExclusionPhrases) without updating both Edge and client (allergenTokens, chatBlockedCheck) so blocking stays in sync.
- Do not change the recipe JSON field set or naming (title, description, ingredients, steps, cookingTime, mealType, servings, chefAdvice, nutrition) without updating **recipeSchema.ts**, **create_recipe_with_steps** payload handling, and **_shared/recipeCanonical.ts** (canonicalizeRecipePayload). Adding optional fields is safer than renaming or removing.
- **Likes in chat recipe generation** must stay a **soft** hint: do not put unconditional likes into **generateRecipeSystemPromptV3** [CONTEXT]; keep gating (**shouldFavorLikes**), **LIKES_DIVERSITY_RULE**, and **chatLikesSignal** anti-repeat aligned with **chat_recipe_generation.md** §6.
- Keep **buildFamilyGenerationContextBlock** and family prompt rules consistent: no "Children:" or "safe for ALL children" in server block; infants <12m excluded when appropriate (familyMode.getFamilyPromptMembers).
- For plan generation, prompts are not used (pool-only). Any future AI fallback for empty slots must align with the same recipe contract and create_recipe_with_steps.
- Keep **RECIPE_SYSTEM_RULES_V3** in sync with **passesDescriptionQualityGate** and **recipeSchema** (description/chefAdvice limits, mealType enum, nutrition keys). **RECIPE_STRICT_JSON_CONTRACT** обновлять при смене контракта для согласованности с тестами/доками; живой промпт V3 импортирует лимиты description из **sanitizeAndRepair.ts**.
- When changing age rules (infant/toddler/school/adult), update **ageCategory.ts** (getAgeCategoryRules) and **prompts.ts** (AGE_CONTEXTS_SHORT, SAFETY_RULES, RECIPE_SYSTEM_RULES_V3) together.
- Do not add articles or external links to SOS/balance prompts; **NO_ARTICLES_RULE** must stay enforced for consultant-style responses.
