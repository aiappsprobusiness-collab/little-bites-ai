# Чат: allergy guard (pre + post)

Краткая ссылка для разработки. Источник истины по домену: **`docs/decisions/ALLERGIES_AND_PLAN_SOURCE_OF_TRUTH.md`** (§5).

## Pre-request (до LLM)

| Слой | Файл | Матч |
|------|------|------|
| Клиент | `src/utils/chatBlockedCheck.ts` → `checkChatRequestAgainstProfile` | `containsAnyTokenForAllergy`, токены из `allergyAliases` / `allergenTokens` |
| Edge | `deepseek-chat/index.ts` → `checkRecipeRequestBlocked` | То же; списки аллергий — **полные** (`allMembers` / `memberDataNorm`), не усечённые промптом по тарифу |

Фразы «без X» вырезаются: `textWithoutExclusionPhrases`.

## Post-recipe (после JSON от модели)

| Что | Где |
|-----|-----|
| Маппинг полей | `src/shared/chatRecipeAllergySafety.ts` → `chatRecipeRecordToAllergyFields` |
| Конфликт | `findFirstAllergyConflictInRecipeFields` + `expandAllergiesToCanonicalBlockedGroups` |
| Подстроковый матч | `listAllergyTokenHitsInRecipeFields` / `recipeAllergyMatch.ts` (как план) |
| Поля | title, description, `ingredients[].name`, `display_text` / `displayText`; **tags не используются** (как `preferenceRules` для аллергий) |
| Ответ | `buildAllergyBlockedResponsePayload` — тот же контракт, что при pre-block |
| Лог | `CHAT_RECIPE_ALLERGY_SAFETY_REJECTION` |

Пропускается при **`from_plan_replace`** (кандидат уже отфильтрован планом).

## Синхронизация Edge

`npm run sync:allergens` копирует в том числе **`chatRecipeAllergySafety.ts`**.

## Аудит

```bash
npm run audit:chat-allergy
```

Скрипт: `scripts/audit-chat-allergy-guard.ts` (pre + post на общих хелперах).

## Известные ограничения

- **`isRecipeAllowedByAllergens`** (`_shared/allergens.ts`) по-прежнему на границе слова — **не** путать с планом/чатом; для чата источник истины — `recipeAllergyMatch` + словарь алиасов.
- **Теги рецепта** в post-check чата не сканируются (паритет с Edge `preferenceRules` для аллергий). Редкий расход с клиентским пулом, если аллерген только в tags — см. SoT §4.
- Дублирование **`ALLERGY_ALIASES`**: `src/utils/allergyAliases.ts` и `supabase/functions/_shared/allergyAliases.ts`.
