/**
 * Блокировка автооткрытия шторки «Новый профиль» после успешного создания члена семьи.
 * Ref в React сбрасывается при remount (Strict Mode, быстрая навигация) — flags в sessionStorage переживают это.
 */
const KEY = "lb:blockEmptyFamilyProfileAutoOpen";

export function setBlockEmptyFamilyProfileAutoOpen(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* приватный режим / quota */
  }
}

/** Вызывать когда в семье уже есть хотя бы один член (контекст подтянулся с сервера). */
export function clearBlockEmptyFamilyProfileAutoOpenIfHasMembers(membersLen: number): void {
  if (membersLen <= 0) return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isBlockingEmptyFamilyProfileAutoOpen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
