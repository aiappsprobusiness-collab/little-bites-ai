/**
 * Домен: семейный режим — исключение <12 мес, server-truth контекст, лайки, storage member.
 * Логика без изменений: re-export из _shared.
 */

export {
  getFamilyPromptMembers,
  buildFamilyMemberDataForChat,
  buildFamilyConstraints,
  isInfant,
  isFamilyMode,
} from "../../../_shared/familyMode.ts";
export type { MemberWithAge, FamilyConstraints } from "../../../_shared/familyMode.ts";

export { resolveFamilyStorageMemberId } from "../../../_shared/familyStorageResolver.ts";
export { buildFamilyGenerationContextBlock } from "../../../_shared/familyContextBlock.ts";
export type { MemberForFamilyBlock } from "../../../_shared/familyContextBlock.ts";
export { shouldFavorLikes, buildLikesLine, buildLikesLineForProfile } from "../../../_shared/likesFavoring.ts";
export {
  getFamilyContextPromptLine,
  getFamilyContextPromptLineEmpty,
} from "../../../_shared/memberConstraints.ts";
