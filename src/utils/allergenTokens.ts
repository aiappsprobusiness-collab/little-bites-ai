/**
 * Re-export из единого источника истины (src/shared/allergensDictionary.ts).
 * Используется для проверки запроса в чате и в плане/рецептах.
 */

import {
  buildBlockedTokens,
  containsAnyToken as containsAnyTokenShared,
} from "@/shared/allergensDictionary";

export { buildBlockedTokens };

/** Совместимость: возвращает { hit, found }. Используйте .hit для boolean. */
export const containsAnyToken = containsAnyTokenShared;

/** Для каждой аллергии — токены. Нужно для сообщения «У профиля X аллергия на: Y». */
export function getBlockedTokensPerAllergy(
  allergies: string[]
): Array<{ allergy: string; tokens: string[] }> {
  return allergies
    .filter((a) => typeof a === "string" && a.trim().length > 0)
    .map((allergy) => ({
      allergy: allergy.trim(),
      tokens: buildBlockedTokens([allergy]),
    }));
}
