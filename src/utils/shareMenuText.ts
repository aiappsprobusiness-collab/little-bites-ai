/**
 * Тексты шаринга плана дня/недели (мессенджеры, Web Share API).
 */

import { getShareIntroText } from "./shareDayMenuText";

export { getShareIntroText };

/** Порядок вывода слотов в тексте дня: завтрак → обед → ужин → перекус. */
const DAY_SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

const DAY_SLOT_EMOJI: Record<string, string> = {
  breakfast: "🍓",
  lunch: "🍲",
  dinner: "🥗",
  snack: "🥪",
};

/** Подписи слотов в тексте шаринга (единый вид во всех мессенджерах). */
const DAY_SLOT_TITLE_RU: Record<(typeof DAY_SLOT_ORDER)[number], string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export interface DayMenuShareMeal {
  meal_type: string;
  label: string;
  title: string;
}

export interface BuildDayMenuShareBodyOptions {
  /** Зафиксированная первая строка (превью и отправка совпадают). */
  intro?: string;
  /** Для выбора «сегодня/завтра» и варианта intro, если intro не задан. */
  now?: Date;
  /** Подмешивание случайного варианта intro (тесты). */
  random?: () => number;
}

export function buildDayMenuShareBody(
  meals: DayMenuShareMeal[],
  options?: BuildDayMenuShareBodyOptions
): string {
  const now = options?.now ?? new Date();
  const randomFn = options?.random ?? Math.random;
  const intro =
    options?.intro ?? getShareIntroText(now, randomFn);

  const byType = new Map(meals.map((m) => [m.meal_type, m]));
  const lines: string[] = [intro, ""];
  for (const slot of DAY_SLOT_ORDER) {
    const m = byType.get(slot);
    const title = m?.title != null ? String(m.title).trim() : "";
    if (!title) continue;
    const emoji = DAY_SLOT_EMOJI[slot] ?? "🍽️";
    const label = DAY_SLOT_TITLE_RU[slot] ?? slot;
    lines.push(`${emoji} ${label}: ${title}`);
  }
  lines.push("");
  lines.push("Список продуктов уже готов — можно сразу идти в магазин 🛒");
  return lines.join("\n");
}

export interface WeekMenuShareDayRow {
  dayShort: string;
  brief: string;
}

export function buildWeekMenuShareBody(dayRows: WeekMenuShareDayRow[]): string {
  const lines = ["Меню на неделю 👇", ""];
  for (const { dayShort, brief } of dayRows) {
    lines.push(`${dayShort} — ${brief}`);
  }
  lines.push("");
  lines.push("Список продуктов можно собрать в приложении 🛒");
  return lines.join("\n");
}

/** 1–2 блюда для строки дня в шаринге недели. */
export function weekMealsBrief(meals: Array<{ title: string }>): string {
  if (!meals.length) return "—";
  const parts = meals
    .slice(0, 2)
    .map((m) => (m.title != null ? String(m.title).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

/**
 * Добавляет ссылку в конец текста, если её там ещё нет.
 * Защита от повторного добавления и от сочетания text + url в navigator.share.
 */
export function appendShareLinkOnce(text: string, link: string): string {
  const trimmed = (link ?? "").trim();
  if (!trimmed) return text;
  if (text.includes(trimmed)) return text;
  return text.endsWith("\n") ? `${text}${trimmed}` : `${text}\n${trimmed}`;
}

/**
 * Завершение текста шаринга дня: «Посмотреть меню:» и ссылка последней строкой.
 */
export function appendDayMenuShareLink(body: string, url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return body;
  if (body.includes(trimmed)) return body;
  return `${body.trimEnd()}\n\nПосмотреть меню:\n${trimmed}`;
}
