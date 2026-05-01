/**
 * Логика deeplink `/profile?openCreateProfile=1` для ProfilePage.
 * Вынесена для юнит-тестов: при подавлении после создания первого ребёнка шторку открывать нельзя,
 * даже если query ещё не успели стереть или эффект переиграл из‑за deps.
 */
export function shouldOpenSheetForOpenCreateProfileDeepLink(args: {
  hasOpenCreateProfileFlag: boolean;
  authReady: boolean;
  isLoading: boolean;
  membersLen: number;
  maxProfiles: number;
  suppressAfterMemberCreate: boolean;
}): boolean {
  if (!args.hasOpenCreateProfileFlag || !args.authReady || args.isLoading) return false;
  if (args.membersLen >= args.maxProfiles) return false;
  if (args.membersLen > 0) return false;
  if (args.suppressAfterMemberCreate) return false;
  return true;
}
