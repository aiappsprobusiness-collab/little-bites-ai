/**
 * Очистка клиентского хранилища при logout.
 * Убирает ключи, которые могут создавать эффект «призрака прошлого пользователя»:
 * выбранный член семьи, help-чат, подсказки чата.
 * Supabase сам очищает sb-*-auth-token при signOut(); lb_active_session_key очищается в useAuth.
 */

/** Ключи localStorage, которые нужно удалять при выходе (member/profile и чат привязаны к сессии). */
export const LOGOUT_LOCAL_STORAGE_KEYS = [
  "selectedMemberId",
  "primaryMemberId",
  "help_chat_messages_v1",
  "chat_hints_seen_v1",
] as const;

/**
 * Вызывать перед supabase.auth.signOut().
 * Не трогает sb-*-auth-token (их очищает Supabase) и lb_active_session_key (очищается в useAuth).
 */
export function clearOnLogout(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of LOGOUT_LOCAL_STORAGE_KEYS) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore (quota, private mode)
    }
  }
}
