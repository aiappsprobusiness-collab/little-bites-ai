import { formatLocalDate } from "./dateUtils";

/** Добавить days дней к дате (локальная TZ). */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/** Rolling 7 дней: [today, today+1, ..., today+6] в локальной TZ. Без прошедших дней. */
export function getRolling7Dates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(today, i));
  }
  return dates;
}

/** startKey для rolling диапазона (первый день). */
export function getRollingStartKey(): string {
  return formatLocalDate(new Date());
}

/** endKey для rolling диапазона (седьмой день). */
export function getRollingEndKey(): string {
  return formatLocalDate(addDays(new Date(), 6));
}

/** Проверка: dateStr (YYYY-MM-DD) входит в rolling-диапазон [rangeStartKey, rangeStartKey+6]. */
export function isDateInRollingRange(dateStr: string, rangeStartKey: string): boolean {
  const end = formatLocalDate(addDays(new Date(rangeStartKey + "T12:00:00"), 6));
  return dateStr >= rangeStartKey && dateStr <= end;
}
