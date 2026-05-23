# Чат: allergy guard (pre + post)

Краткая ссылка для разработки. Источник истины по домену: **`docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md`** (§5).

## Pre-request (до LLM)

| Слой | Файл | Матч |
|------|------|------|
| Клиент | `src/utils/chatBlockedCheck.ts` → `checkChatRequestAgainstProfile` | `containsAnyTokenForAllergyInWords` (`recipeAllergyMatch.ts`) |
| Edge | `checkRecipeRequestBlocked` | То же; списки аллергий — **полные** (`allMembers` / `memberDataNorm`) |

**Правило:** по словам запроса — prefix/suffix (не вложенная подстрока: «запеканка» ≠ «пекан», «творожный» ≠ «рож»). Явные формы («ореховый», «яичный») по-прежнему блокируют.

Фразы «без X» вырезаются: `textWithoutExclusionPhrases`.

## Post-recipe (после JSON от модели)

| Что | Где |
|-----|-----|
| Маппинг полей | `chatRecipeRecordToAllergyFields` |
| Конфликт | **`findFirstAllergyConflictInChatRecipeIngredients`** |
| Матч | **`listAllergyTokenHitsInChatIngredientNames`** — только `ingredients[].name` |
| Retry | `_shared/parsing/retryRecipeAllergyFix.ts` — один вызов LLM заменить ингредиенты |
| Hard block | **Снят** — рецепт отдаётся; при остаточном конфликте: `allergy_ingredient_warning` + лог **`CHAT_RECIPE_ALLERGY_SAFETY_WARNING`** |

План (`generate-plan`) по-прежнему использует подстроку по title+description+ингредиентам — **`listAllergyTokenHitsInRecipeFields`**.

Пропускается при **`from_plan_replace`**.

## Синхронизация Edge

`npm run sync:allergens` копирует `recipeAllergyMatch.ts`, `chatRecipeAllergySafety.ts`.

## Аудит

```bash
npm run audit:chat-allergy
```

## Тесты

- Vitest: `src/shared/recipeAllergyMatch.test.ts`, `chatRecipeAllergySafety.test.ts`, `chatBlockedCheck.test.ts`
- Deno: `deepseek-chat/chatRecipeAllergyPostCheck.test.ts`

## Известные ограничения

- Аллерген **только в title/description** LLM post-check **не ловит** (осознанно — меньше ложных срабатываний на маркeting-текст).
- **`isRecipeAllowedByAllergens`** (`_shared/allergens.ts`) — другой контракт (граница слова), не путать с чатом/планом.
- Дублирование **`ALLERGY_ALIASES`**: `src/utils/allergyAliases.ts` и `supabase/functions/_shared/allergyAliases.ts`.
