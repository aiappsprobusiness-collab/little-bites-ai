/**
 * Токены аллергий: алиасы (БКМ, глютен и т.д.) + fallback из allergensDictionary.
 */

import { buildBlockedTokensFromAllergies, expandAllergyToTokens } from "@/utils/allergyAliases";
import { containsAnyToken as containsAnyTokenShared } from "@/shared/allergensDictionary";

/** Строит блокирующие токены по списку аллергий (canonical/aliases + fallback). */
export const buildBlockedTokens = buildBlockedTokensFromAllergies;

/** Совместимость: возвращает { hit, found }. Используйте .hit для boolean. */
export const containsAnyToken = containsAnyTokenShared;

/** Для каждой аллергии — токены. Нужно для сообщения «У профиля X аллергия на: Y». */
export function getBlockedTokensPerAllergy(
  allergies: string[]
): Array<{ allergy: string; tokens: string[] }> {
  return allergies
    .filter((a) => typeof a === "string" && a.trim().length > 0)
    .map((allergy) => {
      const trimmed = allergy.trim();
      const { tokens } = expandAllergyToTokens(trimmed);
      return { allergy: trimmed, tokens };
    });
}
