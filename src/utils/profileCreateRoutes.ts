/**
 * Единые маршруты создания профиля члена семьи (full page, как редактирование).
 */

export const PROFILE_CHILD_CREATE_PATH = "/profile/child/new" as const;

/** Первый профиль после регистрации / email confirm. */
export const PROFILE_FIRST_CHILD_ONBOARDING =
  `${PROFILE_CHILD_CREATE_PATH}?welcome=1` as const;

/** Legacy deeplink на вкладке Профиль — редиректим на full page create. */
export const PROFILE_OPEN_CREATE_LEGACY_QUERY = "openCreateProfile" as const;

export function buildProfileChildCreateUrl(opts?: {
  welcome?: boolean;
  returnPath?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.welcome) params.set("welcome", "1");
  if (opts?.returnPath) params.set("return", opts.returnPath);
  const q = params.toString();
  return q ? `${PROFILE_CHILD_CREATE_PATH}?${q}` : PROFILE_CHILD_CREATE_PATH;
}
