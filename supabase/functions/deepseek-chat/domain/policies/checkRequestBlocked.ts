/**
 * Проверка запроса на блокировку по аллергиям/dislikes с учётом «без X».
 * Возвращает payload для ответа 200 JSON при блокировке, иначе null.
 */

import { buildBlockedTokenSet, textWithoutExclusionPhrases } from "../../../_shared/blockedTokens.ts";
import { containsAnyTokenForAllergyInWords } from "../../../_shared/recipeAllergyMatch.ts";
import type { BlockedBy } from "./blockedResponse.ts";
import {
  getSuggestedAlternatives,
  extractIntendedDishHint,
  buildBlockedMessageEdge,
  type BlockedResponsePayload,
} from "./blockedResponse.ts";

export function checkRecipeRequestBlocked(params: {
  userMessage: string;
  allergiesList: string[];
  dislikesList: string[];
  profileName: string;
}): BlockedResponsePayload | null {
  const { userMessage, allergiesList, dislikesList, profileName } = params;
  const tokenSet = buildBlockedTokenSet({ allergies: allergiesList, dislikes: dislikesList });
  const messageForBlockCheck = textWithoutExclusionPhrases(userMessage).toLowerCase();

  /** Pre-check: prefix/suffix по словам запроса (containsAnyTokenForAllergyInWords), как на клиенте. */
  const allergyMatch = tokenSet.allergyItems.find((item) =>
    containsAnyTokenForAllergyInWords(messageForBlockCheck, item.tokens).hit
  );
  if (allergyMatch) {
    const blockedItems = [allergyMatch.display];
    const suggestedAlternatives = getSuggestedAlternatives(blockedItems);
    const intendedDishHint = extractIntendedDishHint(userMessage, allergyMatch.display);
    const message = buildBlockedMessageEdge(profileName, "allergy" as BlockedBy, blockedItems, suggestedAlternatives, intendedDishHint);
    return {
      blocked: true,
      blocked_by: "allergy",
      profile_name: profileName,
      blocked_items: blockedItems,
      suggested_alternatives: suggestedAlternatives,
      original_query: userMessage,
      intended_dish_hint: intendedDishHint || undefined,
      message,
    };
  }

  const dislikeMatch = tokenSet.dislikeItems.find((item) =>
    containsAnyTokenForAllergyInWords(messageForBlockCheck, item.tokens).hit
  );
  if (dislikeMatch) {
    const blockedItems = [dislikeMatch.display];
    const suggestedAlternatives = getSuggestedAlternatives(blockedItems);
    const intendedDishHint = extractIntendedDishHint(userMessage, dislikeMatch.display);
    const message = buildBlockedMessageEdge(profileName, "dislike" as BlockedBy, blockedItems, suggestedAlternatives, intendedDishHint);
    return {
      blocked: true,
      blocked_by: "dislike",
      profile_name: profileName,
      blocked_items: blockedItems,
      suggested_alternatives: suggestedAlternatives,
      original_query: userMessage,
      intended_dish_hint: intendedDishHint || undefined,
      message,
    };
  }

  return null;
}
