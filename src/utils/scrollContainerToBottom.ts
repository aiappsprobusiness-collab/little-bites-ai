/** Мгновенная прокрутка контейнера сообщений к низу (юнит-тесты + использование из schedule). */
export function scrollContainerToBottom(container: HTMLElement): void {
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
}
