/**
 * Pre-check запроса в чате по профилю: аллергии + dislikes.
 * Если запрос содержит запрещённый ингредиент — возвращаем ChatBlockedResponse (Edge не вызываем).
 */

import { buildBlockedTokens, containsAnyToken } from "@/utils/allergenTokens";
import { getBlockedTokensPerAllergy } from "@/utils/allergenTokens";
import { getDislikeTokens } from "@/utils/dislikeTokens";
import type { ChatBlockedResponse } from "@/types/chatBlocked";
import { buildBlockedMessage } from "@/types/chatBlocked";

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
        };
      }
    }
  }

  const dislikes = (member?.dislikes ?? []).filter(
    (d) => typeof d === "string" && (d as string).trim().length > 0
  );
  if (dislikes.length > 0) {
    const dislikeTokens = getDislikeTokens(dislikes);
    if (dislikeTokens.length > 0) {
      const result = containsAnyToken(messageLower, dislikeTokens);
      if (result.hit) {
        const matchedDislike = dislikes.find((d) => {
          const s = String(d).trim().toLowerCase();
          const words = tokenizeForDislikes(s);
          return words.some((t) => messageLower.includes(t));
        });
        const matched = matchedDislike ? [matchedDislike] : result.found;
        const message = buildBlockedMessage(profileName, "dislike", matched);
        return {
          blocked: true,
          blocked_by: "dislike",
          profile_name: profileName,
          matched,
          message,
        };
      }
    }
  }

  return null;
}

function tokenizeForDislikes(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
