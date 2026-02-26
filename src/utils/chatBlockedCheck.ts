/**
 * Pre-check запроса в чате по профилю: аллергии + dislikes.
 * Используется тот же словарь токенов, что и на Edge (в т.ч. ягоды → ягодный/berry и т.д.).
 * Если запрос содержит запрещённый ингредиент — возвращаем ChatBlockedResponse (Edge не вызываем).
 */

import { buildBlockedTokens, containsAnyToken, getBlockedTokensPerAllergy } from "@/utils/allergenTokens";
import type { ChatBlockedResponse } from "@/types/chatBlocked";
import { buildBlockedMessage, getSuggestedAlternativesForBlocked } from "@/types/chatBlocked";

export interface MemberForBlockCheck {
  name?: string | null;
  allergies?: string[] | null;
  dislikes?: string[] | null;
}

/**
 * Проверяет текст запроса на наличие токенов аллергий и dislikes профиля.
 * Возвращает ChatBlockedResponse при первом совпадении (приоритет: аллергия, затем dislike), иначе null.
 */
export function checkChatRequestAgainstProfile(params: {
  text: string;
  member: MemberForBlockCheck | null | undefined;
}): ChatBlockedResponse | null {
  const { text, member } = params;
  const profileName = (member?.name ?? "").trim() || "выбранного профиля";
  const messageLower = (text ?? "").trim().toLowerCase();
  if (!messageLower) return null;

  const allergies = (member?.allergies ?? []).filter(
    (a) => typeof a === "string" && (a as string).trim().length > 0
  );
  if (allergies.length > 0) {
    const blockedTokens = buildBlockedTokens(allergies);
    if (blockedTokens.length > 0) {
      const result = containsAnyToken(messageLower, blockedTokens);
      if (result.hit) {
        const perAllergy = getBlockedTokensPerAllergy(allergies);
        const displayAllergens: string[] = [];
        for (const { allergy, tokens } of perAllergy) {
          if (containsAnyToken(messageLower, tokens).hit) displayAllergens.push(allergy);
        }
        const matched = displayAllergens.length > 0 ? displayAllergens : result.found;
        const message = buildBlockedMessage(profileName, "allergy", matched);
        return {
          blocked: true,
          blocked_by: "allergy",
          profile_name: profileName,
          matched,
          message,
          original_query: text,
          blocked_items: matched,
          suggested_alternatives: getSuggestedAlternativesForBlocked(matched),
        };
      }
    }
  }

  const dislikes = (member?.dislikes ?? []).filter(
    (d) => typeof d === "string" && (d as string).trim().length > 0
  );
  if (dislikes.length > 0) {
    for (const d of dislikes) {
      const tokens = buildBlockedTokens([d]);
      if (tokens.length > 0) {
        const result = containsAnyToken(messageLower, tokens);
        if (result.hit) {
          const matchedItem = String(d).trim();
          const message = buildBlockedMessage(profileName, "dislike", [matchedItem]);
          return {
            blocked: true,
            blocked_by: "dislike",
            profile_name: profileName,
            matched: [matchedItem],
            message,
            original_query: text,
            blocked_items: [matchedItem],
            suggested_alternatives: getSuggestedAlternativesForBlocked([matchedItem]),
          };
        }
      }
    }
  }

  return null;
}
