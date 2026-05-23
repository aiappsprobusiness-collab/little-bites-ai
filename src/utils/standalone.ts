/**
 * Установленная PWA / запуск с домашнего экрана (не вкладка браузера).
 * Та же логика продублирована inline в `index.html` до загрузки бандла.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return false;
}

/** @deprecated alias — используйте isStandalonePwa */
export function isStandalone(): boolean {
  return isStandalonePwa();
}
