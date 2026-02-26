# PR: Single source of truth for allergen tokens

## Проблема

Словарь аллергенов был продублирован:
- `supabase/functions/_shared/allergens.ts` (Edge/Deno)
- `src/utils/allergenTokens.ts` (Vite/frontend)

Риск расхождений при правках в одном месте.

## Решение

1. **Единый модуль (чистый TS, без DOM/Node):**
   - `src/shared/allergensDictionary.ts` — источник истины.
   - Экспорт: `AllergenKey`, `ALLERGEN_TOKENS`, `normalizeToken`, `buildBlockedTokens`, `containsAnyToken(text, tokens) => { hit, found }`.

2. **Edge:**
   - `supabase/functions/_shared/allergensDictionary.ts` — копия, синхронизируется скриптом.
   - `supabase/functions/_shared/allergens.ts` — thin wrapper: импорт из `allergensDictionary.ts`, те же публичные API (`buildAllergenSet`, `containsAnyToken` → boolean, `isRecipeAllowedByAllergens`, `getBlockedTokensFromAllergies`).

3. **Frontend:**
   - `src/utils/allergenTokens.ts` — re-export из `@/shared/allergensDictionary` + `getBlockedTokensPerAllergy`.
   - `chatAllergyCheck.ts`, `validateRecipe.ts`, `recipePool.ts` используют общий модуль (через allergenTokens); `containsAnyToken` возвращает `{ hit, found }`, вызовы обновлены на `.hit`.

4. **Синхронизация:**
   - `scripts/sync-allergens-dict.mjs` копирует `src/shared/allergensDictionary.ts` → `supabase/functions/_shared/allergensDictionary.ts`.
   - npm script: `sync:allergens`. Запускается перед деплоем Edge (`supabase:deploy:chat`, `supabase:deploy:chat:slow`). Перед деплоем других Edge-функций (например, generate-plan) нужно выполнить `npm run sync:allergens`.

## Acceptance

- Edge и frontend используют один и тот же словарь (файлы синхронизированы скриптом).
- Тесты аллергенов в Edge (`deno test allergens.test.ts`) и на фронте (`chatAllergyCheck.test.ts`) проходят без изменений логики.
- Публичные API Edge-функций не изменены.
