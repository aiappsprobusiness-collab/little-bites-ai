# Recipe generation: all places that set model conditions (input tokens)

**Goal:** Reduce input tokens from ~2500 to ~1000 per recipe request.  
This file lists every source that contributes to the **system prompt** and **user message** sent to the model for recipe generation, so you can analyze and shorten them.

---

## 1. Assembly order (index.ts)

The system prompt for recipe (type `chat` or `recipe` when `isRecipeRequest`) is built in this order:

1. **Base system prompt** from `getSystemPromptForType(...)` — see §2 and §3.
2. **Appended in index.ts:**
   - `ageRulesV2` from `getAgeCategoryRules(ageCategory)` (§4)
   - `tariffResult.tariffAppendix` (§5)
   - `tariffResult.familyBalanceNote` (if family) (§5)
   - `NO_ARTICLES_RULE` (§6)
   - `GREETING_STYLE_RULE` (only if **not** recipe request and not sos/balance_check) (§6)
   - If family: `applyPromptTemplate(FAMILY_RECIPE_INSTRUCTION, ...)` + optionally `KID_SAFETY_1_3_INSTRUCTION` (§6)
   - If family and likes: `buildLikesLine(...)` (§7)
   - If single profile and likes: `buildLikesLineForProfile(...)` (§7)
   - `extraSystemSuffix` from request body (if any)
   - One line: "Разнообразь стиль описаний..."
3. **Messages sent to API:** `[{ role: "system", content: currentSystemPrompt }, { role: "user", content: userMessage }]`  
   For recipe requests only the last user message is sent (no full chat history).

**Note:** `effectiveGenerationContextBlock` (from client or `buildFamilyGenerationContextBlock` in family mode) is passed into `getSystemPromptForType` → `applyPromptTemplate`, but the current **FREE_RECIPE_TEMPLATE** and **PREMIUM_RECIPE_TEMPLATE** do **not** contain the placeholder `{{generationContextBlock}}`, so this block does not appear in the prompt unless the template is updated.

---

## 2. Base system prompt: template choice and variables (buildPrompt.ts)

- **File:** `supabase/functions/deepseek-chat/buildPrompt.ts`
- **Function:** `getSystemPromptForType(type, memberData, isPremium, targetIsFamily, allMembers, userMessage, generationContextBlock, mealType, maxCookingTime, servings, recentTitleKeysLine)`
- For `type === "chat"` or `type === "recipe"` it calls `generateChatSystemPrompt(isPremium, ...)` which picks:
  - **FREE_RECIPE_TEMPLATE** (free) or **PREMIUM_RECIPE_TEMPLATE** (premium/trial)
- **Function:** `applyPromptTemplate(template, memberData, targetIsFamily, allMembers, options)`  
  Replaces in the template:
  - `{{name}}`, `{{target_profile}}`, `{{age}}`, `{{ageMonths}}`, `{{ageRule}}`
  - `{{allergies}}`, `{{allergiesExclude}}`, `{{preferences}}`, `{{difficulty}}`
  - `{{generationContextBlock}}` (see note above: not present in current template)
  - `{{familyContext}}` — from `getFamilyContextPromptLine()` or `getFamilyContextPromptLineEmpty()` (§8)
  - `{{userMessage}}`, `{{mealType}}`, `{{maxCookingTime}}`, `{{servings}}`, `{{recentTitleKeysLine}}`

---

## 3. Template content: prompts.ts (main token load)

**File:** `supabase/functions/deepseek-chat/prompts.ts`

These constants are concatenated into **FREE_RECIPE_TEMPLATE** and **PREMIUM_RECIPE_TEMPLATE**:

| Constant | Purpose | Approx. size |
|----------|---------|--------------|
| **STRICT_RULES** | Allergies/preferences strict; never refuse; always one JSON; substitute if conflict | ~20 lines |
| **SAFETY_RULES** | Allergies, age &lt;12 мес (no salt/sugar/honey/milk), style | ~5 lines |
| **[ROLE]** | One line (Free vs Premium) | 1 line |
| **[CONTEXT]** | Placeholders: target_profile, ageRule, ageMonths, familyContext, allergies, preferences, mealType, maxCookingTime, servings, recentTitleKeysLine | ~10 lines when filled |
| **[ЗАПРЕЩЕНО В ТЕКСТЕ]** | No toddler/infant/preschool wording; age only as number | ~2 lines |
| **RULES_USER_INTENT** | Dish must match request; mealType must not change dish; only valid JSON | ~7 lines |
| **RECIPE_STRICT_JSON_CONTRACT** | Full JSON schema + description/chefAdvice/ingredients/nutrition rules | ~25 lines |
| **RECIPE_JSON_RULES** | One recipe; description/chefAdvice limits; ingredients with amount | ~5 lines |
| **RECIPE_DESCRIPTION_VARIETY_RULE** | description max 150 chars, one advantage, no filler, vary openings | ~5 lines |
| **RECIPE_OUTPUT_RULES** | No other family; no reasoning; no markdown; no extra text | ~5 lines |
| **RECIPE_ONE_ONLY_RULE** | Exactly one recipe; no lists; no text outside JSON | ~5 lines |
| Final line | Ingredients amount+unit; steps max 5 (Free) or 7 (Premium); chefAdvice 300 (Premium) | 1 line |

**AGE_CONTEXTS** (prompts.ts): used inside `applyPromptTemplate` to fill `{{ageRule}}` from `getAgeCategory(ageMonths)`:
- infant, toddler, school, adult — each a short paragraph. Inlined into template via `{{ageRule}}`.

**Duplicate / overlapping content** (see also `docs/prompts_shortening_proposal.md`):
- “Only valid JSON, no markdown” appears in RULES_USER_INTENT, RECIPE_STRICT_JSON_CONTRACT, RECIPE_JSON_RULES, RECIPE_ONE_ONLY_RULE.
- “One recipe / no lists” in RECIPE_JSON_RULES and RECIPE_ONE_ONLY_RULE.
- description/chefAdvice rules in RECIPE_STRICT_JSON_CONTRACT, RECIPE_JSON_RULES, RECIPE_DESCRIPTION_VARIETY_RULE.
- Allergies in STRICT_RULES and SAFETY_RULES.

---

## 4. Age category rules (appended after base prompt)

- **File:** `supabase/functions/deepseek-chat/ageCategory.ts`
- **Function:** `getAgeCategoryRules(category)`  
  Returns short strings per category (infant, toddler, school, adult), e.g. “Только прикорм и пюре. Без соли, сахара…”  
- **Called from:** `index.ts`: `ageRulesV2 = getAgeCategoryRules(ageCategory)` then `systemPrompt += "\n\n" + ageRulesV2 + ...`

This adds a few lines per request (category-dependent).

---

## 5. Tariff appendix and family balance (appended)

- **File:** `supabase/functions/deepseek-chat/promptByTariff.ts`
- **Function:** `buildPromptByProfileAndTariff({ status, memberType, isFamilyTarget })`
- **Used in index.ts:**
  - `tariffAppendix`: one line (e.g. “Эмпатичный тон, советы шефа…” or “Строгая структура…”).
  - `familyBalanceNote`: if family, one line “Балансируй интересы всех членов семьи…”.

---

## 6. Global rules and family/kid blocks (appended in index.ts)

- **File:** `supabase/functions/deepseek-chat/prompts.ts`
- **NO_ARTICLES_RULE** — no links to articles; help only in chat (~2 lines). Always appended.
- **GREETING_STYLE_RULE** — greeting style, no “мамочка” (~2 lines). Appended only when **not** recipe request and not sos_consultant/balance_check (so usually **not** for recipe path).
- **FAMILY_RECIPE_INSTRUCTION** — if family: one recipe for everyone, JSON format, chefAdvice only about dish (~3 lines). Appended only for family.
- **KID_SAFETY_1_3_INSTRUCTION** — if family and `applyKidFilter`: safety 1–3 years (salt/sugar, no fry/spicy, choking hazards, soft pieces) (~6 lines). Appended only when applicable.

---

## 7. Likes lines (appended in index.ts)

- **File:** `supabase/functions/_shared/likesFavoring.ts`
- **buildLikesLine(likesForPrompt)** — family: “ПРИОРИТЕТ ЛАЙКОВ СЕМЬИ: старайся подобрать рецепт…” + list. Used in ~20% of requests (shouldFavorLikes).
- **buildLikesLineForProfile(profileName, likes)** — single profile: “ПРИОРИТЕТ ЛАЙКОВ (имя): …” + list. Same ~20% logic.

Each adds 1–2 lines when used.

---

## 8. familyContext placeholder (inside template)

- **File:** `supabase/functions/_shared/memberConstraints.ts`
- **getFamilyContextPromptLine()** — “Готовим для общего стола. Учитываются аллергии и «не любят» всех членов семьи. Рецепт универсальный…”
- **getFamilyContextPromptLineEmpty()** — “Готовим для семьи. Рецепт универсальный.”
- In **buildPrompt.ts**, `{{familyContext}}` is replaced by one of these when building the template (family mode vs empty family).

---

## 9. Family generation context block (not in current template)

- **File:** `supabase/functions/_shared/familyContextBlock.ts`
- **Function:** `buildFamilyGenerationContextBlock({ membersForPrompt, applyKidFilter })`
- In **family mode**, `index.ts` sets `effectiveGenerationContextBlock = buildFamilyGenerationContextBlock(...)` and passes it to `getSystemPromptForType` → `applyPromptTemplate`. The template does **not** currently include `{{generationContextBlock}}`, so this text is **not** in the prompt. If you add `{{generationContextBlock}}` to the template, this block would add:
  - Header “FAMILY MODE (shared table):” + short intro
  - Per member: name, age, Allergies (STRICT), Dislikes (STRICT), Likes (SOFT)
  - Closing line about one recipe and allergies/dislikes; optionally kid safety line.

This is a large block (many lines for multiple members). Either keep it out of the prompt or shorten it if you decide to inject it.

---

## 10. User message (recipe request)

- **Source:** Request body `messages` — for recipe requests only the **last user message** is sent: `content: userMessage`.
- **No** full chat history for recipe path; so user-side token cost is only one message.

---

## 11. API request shape (index.ts)

- **Payload:** `messages: [{ role: "system", content: currentSystemPrompt }, { role: "user", content: userMessage }]`
- **Recipe-specific:** `response_format: { type: "json_object" }`, `temperature: 0.4`, `max_tokens: 1536`
- **No** JSON schema is sent in the API; the “schema” is only the text in RECIPE_STRICT_JSON_CONTRACT (and related rules) inside the system prompt.

---

## 12. Recipe schema (validation only, not sent to model)

- **File:** `supabase/functions/deepseek-chat/recipeSchema.ts`
- **RecipeJsonSchema** (Zod) is used **only** for parsing/validation of the model response. It is **not** sent to the API and does **not** affect input tokens.

---

## 13. Other calls that use tokens (not main recipe prompt)

- **retryFixJson** (on validation failure): extra API call with a short system/user prompt to fix JSON — adds tokens only on retry.
- **repairDescriptionOnly** / **buildRecipeDescription** / **buildChefAdvice**: may call the API or use local fallbacks; if they call the API, that is separate from the main recipe request.

---

## 14. Summary: where to cut to reach ~1000 input tokens

- **Largest contributors:** §3 (prompts.ts) — STRICT_RULES, RECIPE_STRICT_JSON_CONTRACT, RECIPE_JSON_RULES, RECIPE_DESCRIPTION_VARIETY_RULE, RECIPE_OUTPUT_RULES, RECIPE_ONE_ONLY_RULE, plus [CONTEXT] and ageRule.
- **Duplication:** Merge “one JSON / no markdown / one recipe” into a single short block; merge description/chefAdvice/ingredients rules into one RECIPE_TASK block (see `docs/prompts_shortening_proposal.md`).
- **Optional:** Shorten STRICT_RULES and SAFETY_RULES; keep one clear “allergies/preferences strict, always output one recipe JSON” line.
- **Optional:** Shorten AGE_CONTEXTS and getAgeCategoryRules (or merge with SAFETY_RULES) to avoid repeating age rules.
- **generationContextBlock:** Currently unused in template; if you add it, prefer a short family-context format to avoid a large token increase.
- **recentTitleKeysLine:** “Не повторять: …” — keep short (e.g. cap number of titles).
- **Likes lines:** Already short; optional to make even shorter.

Use this file plus `docs/prompts_shortening_proposal.md` for GPT-assisted shortening and token counting.
