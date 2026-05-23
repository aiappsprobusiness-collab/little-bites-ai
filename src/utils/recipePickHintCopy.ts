/**
 * Текст подсказки в шапке чата рецептов (Free): явный счётчик «осталось X из Y».
 */

function podborWord(count: number): string {
  const n = Math.abs(Math.floor(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "подборов";
  if (mod10 === 1) return "подбор";
  if (mod10 >= 2 && mod10 <= 4) return "подбора";
  return "подборов";
}

/** @param remainingAttempts сколько подборов ещё можно сделать сегодня */
export function getRemainingRecipesText(remainingAttempts: number, dailyLimit: number): string {
  const remaining = Math.max(0, Math.floor(remainingAttempts));
  const limit = Math.max(1, Math.floor(dailyLimit));
  const used = Math.min(limit, limit - remaining);
  if (remaining <= 0) {
    return `Осталось: 0 из ${limit} ${podborWord(limit)}`;
  }
  return `Осталось: ${remaining} из ${limit} ${podborWord(limit)}`;
}
