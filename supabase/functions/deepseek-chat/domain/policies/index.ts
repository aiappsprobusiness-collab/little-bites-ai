/**
 * Домен: политики блокировки запроса (аллергии, dislikes, «без X», границы слов).
 * Поведение и контракт ответа совместимы с текущим.
 */

export { buildBlockedTokenSet, findMatchedTokens, textWithoutExclusionPhrases } from "../../../_shared/blockedTokens.ts";
export type { BlockedTokenSet } from "../../../_shared/blockedTokens.ts";
export {
  getSuggestedAlternatives,
  extractIntendedDishHint,
  buildBlockedMessageEdge,
  type BlockedBy,
  type BlockedResponsePayload,
} from "./blockedResponse.ts";
export { checkRecipeRequestBlocked } from "./checkRequestBlocked.ts";
