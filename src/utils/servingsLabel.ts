/**
 * Склонение «порция» для фразы «Ингредиенты (на X порцию/порции/порций)».
 * 1 порцию, 2/3/4 порции, 5–20 порций, 21 порцию, 22–24 порции, 25–30 порций …
 */
export function servingsLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n % 10 === 1 && n % 100 !== 11) return "порцию";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "порции";
  return "порций";
}
