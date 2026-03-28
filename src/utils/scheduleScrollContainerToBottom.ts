/** Мгновенная прокрутка контейнера сообщений к низу (юнит-тесты + внутренний вызов). */
export function scrollContainerToBottom(container: HTMLElement): void {
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
}

/**
 * Прокрутка flex-ребёнка с overflow-auto к низу после смены DOM (новые сообщения, индикатор «Думаю…», клавиатура Android).
 *
 * Двойной `requestAnimationFrame` — после commit layout; `setTimeout(0)` — после синхронных обновлений стилей;
 * один отложенный pass (80ms) — после resize visual viewport от клавиатуры, без цикла таймеров.
 */
export function scheduleScrollContainerToBottom(container: HTMLElement | null): void {
  if (!container) return;
  const apply = () => scrollContainerToBottom(container);
  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 80);
}
