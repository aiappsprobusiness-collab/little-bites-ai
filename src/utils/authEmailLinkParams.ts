/**
 * Признаки «ссылка из письма» (magic link / recovery / PKCE), по которым нужно отдать обработку
 * `/auth/callback` или дождаться сессии.
 *
 * Важно: `?code=` (PKCE) нельзя проверять на всех путях — иначе сторонний `?code=` на `/meal-plan`
 * и т.п. вызывает бесконечный `location.replace` → `/auth/callback` (см. инцидент с штормом запросов).
 */
export function shouldHandOffEmailAuthToCallback(pathname: string, search: string, hash: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  const inHash = /access_token|refresh_token|type=recovery/.test(hash || "");
  const params = new URLSearchParams(search);
  if (inHash || params.has("access_token") || params.has("refresh_token")) return true;
  if (
    params.has("code") &&
    (p === "/" || p === "/auth/callback" || p === "/auth/reset-password")
  ) {
    return true;
  }
  return false;
}
