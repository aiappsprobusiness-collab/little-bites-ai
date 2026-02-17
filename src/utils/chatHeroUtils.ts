/**
 * Утилиты для hero вкладки «Чат».
 * getTimeOfDayLine принимает опциональный Date для тестов (подмена времени).
 */

/** Утро 05–11, День 12–16, Вечер 17–22, Ночь 23–04 */
export function getTimeOfDayLine(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Утро? Подберу быстрый завтрак.";
  if (h >= 12 && h < 17) return "Днём удобно приготовить суп или обед без жарки.";
  if (h >= 17 && h < 23) return "Вечер? Подберу лёгкий ужин.";
  return "Поздно? Подберу лёгкий перекус.";
}

/** Коротко: максимум 2 аллергена, остальное "+N". */
export function formatAllergySummary(allergies: string[]): string {
  if (!allergies?.length) return "без ограничений";
  const first = allergies.slice(0, 2).join(", ");
  const rest = allergies.length > 2 ? ` +${allergies.length - 2}` : "";
  return `аллергия: ${first}${rest}`;
}
