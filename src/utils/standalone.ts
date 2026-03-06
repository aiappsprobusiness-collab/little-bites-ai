/**
 * Определение standalone PWA (приложение открыто с главного экрана).
 * Вызывать только на клиенте после гидрации, чтобы избежать mismatch.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return false;
}
