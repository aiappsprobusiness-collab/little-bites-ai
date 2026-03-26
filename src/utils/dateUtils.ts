/** YYYY-MM-DD в локальной таймзоне (не UTC). */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Сдвиг календарной даты YYYY-MM-DD на deltaDays (локально; delta может быть отрицательным). */
export function addDaysToLocalYmd(ymd: string, deltaDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, mo, d] = ymd.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDate(date);
}
