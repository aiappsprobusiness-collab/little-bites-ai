/**
 * Динамическое вступление для шаринга дневного меню (plain text, мессенджеры).
 * Локальное время: с 18:00 — формулировки «на завтра», иначе «на сегодня».
 */

const INTRO_TODAY = [
  "Собрала меню на сегодня — делюсь 👇",
  "Вот меню на сегодня, очень выручает 👇",
  "Делюсь меню на сегодня 👇",
] as const;

const INTRO_TOMORROW = [
  "Собрала меню на завтра — делюсь 👇",
  "Чтобы завтра не думать, что готовить — вот меню 👇",
] as const;

function pickVariant<T extends readonly string[]>(
  variants: T,
  randomFn: () => number
): T[number] {
  const i = Math.min(
    Math.floor(randomFn() * variants.length),
    variants.length - 1
  );
  return variants[i];
}

/**
 * Первая строка сообщения шаринга дневного меню.
 * @param date — момент времени (локальный календарь/часы пользователя)
 * @param randomFn — опционально, для тестов (по умолчанию Math.random)
 */
export function getShareIntroText(
  date: Date,
  randomFn: () => number = Math.random
): string {
  const hour = date.getHours();
  const isTomorrow = hour >= 18;
  const variants = isTomorrow ? INTRO_TOMORROW : INTRO_TODAY;
  return pickVariant(variants, randomFn);
}
