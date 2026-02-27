/**
 * Pre-check запроса в чате по профилю: аллергии + dislikes.
 * Используется тот же словарь токенов, что и на Edge (в т.ч. ягоды → ягодный/berry и т.д.).
 * Если запрос содержит запрещённый ингредиент — возвращаем ChatBlockedResponse (Edge не вызываем).
 * Исключение: если пользователь явно просит рецепт БЕЗ ингредиента («суп без картошки»),
 * не блокируем — отдаём рецепт без него.
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
 * Удаляет из текста фразы «без X» (запрос исключения ингредиента).
 * Проверка блокировки по оставшемуся тексту: если аллерген только в «без X», не блокируем.
 */
export function textWithoutExclusionPhrases(text: string): string {
  return text.replace(/без\s+[^,.\n]+/gi, " ");
}

/**
 * Проверяет текст запроса на наличие токенов аллергий и dislikes профиля.
 * Возвращает ChatBlockedResponse при первом совпадении (приоритет: аллергия, затем dislike), иначе null.
 * Запросы вида «рецепт без X» при аллергии на X не блокируются.
 */
export function checkChatRequestAgainstProfile(params: {
  text: string;
  member: MemberForBlockCheck | null | undefined;
}): ChatBlockedResponse | null {
  const { text, member } = params;
  const profileName = (member?.name ?? "").trim() || "выбранного профиля";
  const messageLower = (text ?? "").trim().toLowerCase();
  if (!messageLower) return null;

  /** Текст без фраз «без X» — блокируем только если аллерген упомянут вне контекста исключения. */
  const messageWithoutWithout = textWithoutExclusionPhrases(messageLower);

  const allergies = (member?.allergies ?? []).filter(
    (a) => typeof a === "string" && (a as string).trim().length > 0
  );
  if (allergies.length > 0) {
    const blockedTokens = buildBlockedTokens(allergies);
    if (blockedTokens.length > 0) {
      const result = containsAnyToken(messageWithoutWithout, blockedTokens);
      if (result.hit) {
        const perAllergy = getBlockedTokensPerAllergy(allergies);
        const displayAllergens: string[] = [];
        for (const { allergy, tokens } of perAllergy) {
          if (containsAnyToken(messageWithoutWithout, tokens).hit) displayAllergens.push(allergy);
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
        const result = containsAnyToken(messageWithoutWithout, tokens);
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
