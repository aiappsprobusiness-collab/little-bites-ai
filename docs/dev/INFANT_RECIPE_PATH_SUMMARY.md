# Infant recipe path + under-6 block — краткая сводка

## Что сделано

- Отдельная ветка генерации JSON-рецепта для **ребёнка 6–11 мес** (прикорм): свой компактный system prompt, свой LLM-вызов, Zod + **validateInfantRecipe**, до 2 попыток.
- Блок **0–5 мес** в том же recipe path: **без LLM**, **без рецепта**, ответ `route: "under_6_recipe_block"`.
- **Standard path** (V3 prompt, логика parse/retry/sanitize) **не менялся**; для infant он **не вызывается**.
- **Non-recipe** ветки (SOS, balance, чат без рецепта) **не трогались**; routing вызывается только при `isRecipeRequest`.

## Файлы

| Файл | Назначение |
|------|------------|
| `supabase/functions/deepseek-chat/domain/recipe_generation/recipeGenerationRouting.ts` | `resolveRecipeGenerationRoute`, сообщение under-6, нормализация типа профиля |
| `supabase/functions/deepseek-chat/domain/recipe_generation/infantRecipePrompt.ts` | `buildInfantRecipeSystemPrompt`, `resolveInfantStage` |
| `supabase/functions/deepseek-chat/domain/recipe_generation/infantSafetyValidator.ts` | `validateInfantRecipe` |
| `supabase/functions/deepseek-chat/domain/recipe_generation/infantRecipe.ts` | `runInfantRecipeGeneration` (LLM + retry) |
| `supabase/functions/deepseek-chat/index.ts` | Точка входа: under-6 return; `skipStandardRecipeLlm`; infant vs standard fetch; пропуск стандартного parse-блока для infant |
| `supabase/functions/deepseek-chat/buildPrompt.ts` | `MemberData.type`, `normalizeMemberData` сохраняет `type` |
| `src/domain/generation/derivePayloadFromContext.ts` | Проброс `type` в `memberData` |
| `src/hooks/useDeepSeekAPI.tsx` | Передача `type` в `derivePayloadFromContext` |
| `docs/architecture/chat_recipe_generation.md` | Контракты и правила routing |
| `docs/architecture/system-prompts-map.md` | Карта промптов: infant prompt |
| `package.json` | `test:edge` — новые deno-тесты |

## Где routing

После **checkRecipeRequestBlocked** (recipe path), до сборки standard V3 prompt:

1. `recipeGenerationKind = resolveRecipeGenerationRoute(...)`
2. Если `under_6_block` → немедленный `Response` с `message` + `recipes: []` + `route`
3. Если `infant` → `skipStandardRecipeLlm`, отдельный вызов `runInfantRecipeGeneration`; при отказе → `route: "infant_recipe_rejected"`

## JSON-контракт ответов

- **under_6:** `{ message, recipes: [], route: "under_6_recipe_block", reason_code: "under_6_recipe_block" }` — **`reason_code` здесь не из infant-validator**, а код блокировки routing.
- **infant reject:** `{ message, recipes: [], route: "infant_recipe_rejected", reason_code, severity_outward }` — канонические `reason_code` и severity: см. **`docs/architecture/chat_recipe_generation.md`** и **`infantReasonCodes.ts`**.
- **infant success:** как у standard: `message` (JSON строка рецепта), `recipes`, `recipe_id` при сохранении.

## Тесты

- `deno test` (см. `npm run test:edge`):  
  `deepseek-chat/domain/recipe_generation/recipeGenerationRouting.test.ts`  
  `deepseek-chat/domain/recipe_generation/infantSafetyValidator.test.ts`

## Что проверить вручную

1. Профиль **child**, **5 мес** — запрос рецепта в чате → текст о прикорме с 6 мес, без карточки рецепта.
2. **child 8 мес** — простой запрос (например тыква) → рецепт, в логах Edge теги `recipe_infant_path`, `recipe_infant_validator`.
3. **child 12+** / **adult** / **Семья** — поведение как до изменений (V3).
4. Тот же профиль **0–5 мес** — вопрос в **Помощнике** (SOS) не должен блокироваться этим guard (routing только recipe path).
