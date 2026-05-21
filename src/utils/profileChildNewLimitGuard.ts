/**
 * Страница `/profile/child/new`: блокировать вход только если лимит профилей уже был
 * исчерпён до создания, а не сразу после успешного сохранения первого (0 → 1 на Free).
 */
export function shouldEnforceNewProfileMemberLimit(args: {
  isNewRoute: boolean;
  membersLen: number;
  maxProfiles: number;
  skipAfterSuccessfulSave: boolean;
}): boolean {
  if (!args.isNewRoute || args.skipAfterSuccessfulSave) return false;
  return args.membersLen >= args.maxProfiles;
}
