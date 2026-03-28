/** Совпадает с нижней панелью чата (`ChatInputBar`): ~5 строк при line-height 20px. */
export const TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX = 120;

/**
 * Автовысота textarea: сброс height → измерение scrollHeight → clamp по max.
 * Пока контент ниже max — `overflow-y: hidden` (без лишнего скроллбара); при превышении — внутренний скролл.
 */
export function applyTextareaAutosize(
  el: HTMLTextAreaElement | null,
  maxHeightPx: number = TEXTAREA_AUTOSIZE_DEFAULT_MAX_PX
): void {
  if (!el) return;
  el.style.height = "auto";
  const sh = el.scrollHeight;
  const next = Math.min(sh, maxHeightPx);
  el.style.height = `${next}px`;
  el.style.overflowY = sh > maxHeightPx ? "auto" : "hidden";
}
