/**
 * Deeplink `/profile?openCreateProfile=1` → full page `/profile/child/new`.
 */
export function shouldNavigateToCreateProfileForDeepLink(args: {
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
