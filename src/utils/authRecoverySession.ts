import type { Session } from "@supabase/supabase-js";

/**
 * Расшифровка payload JWT (без проверки подписи — только для клиентских подсказок UI;
 * сервер по-прежнему должен валидировать токен).
 */
function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function amrHasRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (entry === "recovery") return true;
    if (entry && typeof entry === "object" && "method" in entry) {
      return (entry as { method: string }).method === "recovery";
    }
    return false;
  });
}

/**
 * Сессия после перехода по ссылке сброса пароля: в JWT в `amr` указан метод `recovery`
 * (см. https://supabase.com/docs/guides/auth/jwt-fields ).
 * После успешного `updateUser({ password })` выдаётся обычный токен без `recovery`.
 */
export function isRecoveryJwtSession(session: Session | null): boolean {
  if (!session?.access_token) return false;
  const payload = decodeJwtPayload(session.access_token);
  if (!payload) return false;
  return amrHasRecovery(payload.amr);
}
