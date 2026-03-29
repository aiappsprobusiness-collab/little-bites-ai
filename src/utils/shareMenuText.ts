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

/** Эмодзи для недельного шаринга (отдельно от дня — другой визуальный стиль). */
const WEEK_SHARE_SLOT_EMOJI: Record<(typeof DAY_SLOT_ORDER)[number], string> = {
  breakfast: "🍚",
  lunch: "🥣",
  dinner: "🍲",
  snack: "🍎",
};

/** Подписи слотов в тексте шаринга (единый вид во всех мессенджерах). */
const DAY_SLOT_TITLE_RU: Record<(typeof DAY_SLOT_ORDER)[number], string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const WEEK_SHARE_HEADERS = [
  "Посмотри, какое меню получилось на неделю 👇",
  "Собрали меню на неделю — удобно и без заморочек 👇",
  "Вот наш план питания на неделю 👇",
] as const;

const WEEK_SHARE_CTAS = [
  "🛒 Список продуктов соберётся автоматически:",
  "👉 Открыть меню и собрать список продуктов:",
] as const;

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
  /**
   * Строка дня для старого формата; если передан `meals`, используется блочный вывод по приёмам пищи.
   */
  brief?: string;
  /** Приёмы пищи за день (meal_type — id слота: breakfast, lunch, …). */
  meals?: Array<{ meal_type: string; title: string }>;
}

export interface BuildWeekMenuShareBodyOptions {
  /** Детерминированный выбор заголовка и CTA (тесты). */
  random?: () => number;
  /** Индексы вариантов — чтобы превью и отправка совпадали (0..headers-1, 0..ctas-1). */
  headerIndex?: number;
  ctaIndex?: number;
}

/** Вызвать при открытии превью недели; сохранить индексы в state и передать в buildWeekMenuShareBody. */
export function pickWeekMenuShareTextIndices(randomFn: () => number = Math.random): {
  headerIndex: number;
  ctaIndex: number;
} {
  return {
    headerIndex: Math.floor(randomFn() * WEEK_SHARE_HEADERS.length),
    ctaIndex: Math.floor(randomFn() * WEEK_SHARE_CTAS.length),
  };
}

function pickRandomString<T extends readonly string[]>(
  items: T,
  randomFn: () => number
): T[number] {
  const i = Math.floor(randomFn() * items.length);
  return items[Math.min(i, items.length - 1)];
}

function pickByIndex<T extends readonly string[]>(items: T, index: number): T[number] {
  const i = Math.max(0, Math.min(index, items.length - 1));
  return items[i];
}

function formatWeekShareDayBlock(row: WeekMenuShareDayRow): string[] | null {
  if (row.meals != null && row.meals.length > 0) {
    const byType = new Map(
      row.meals.map((m) => [m.meal_type, m.title != null ? String(m.title).trim() : ""])
    );
    const mealLines: string[] = [];
    for (const slot of DAY_SLOT_ORDER) {
      const title = byType.get(slot);
      if (!title) continue;
      const emoji = WEEK_SHARE_SLOT_EMOJI[slot] ?? "🍽️";
      const label = DAY_SLOT_TITLE_RU[slot] ?? slot;
      mealLines.push(`${emoji} ${label}: ${title}`);
    }
    if (!mealLines.length) return null;
    return [row.dayShort, ...mealLines];
  }
  const brief = (row.brief ?? "—").trim();
  if (brief === "—" || brief === "") return null;
  return [`${row.dayShort} — ${brief}`];
}

export function buildWeekMenuShareBody(
  dayRows: WeekMenuShareDayRow[],
  options?: BuildWeekMenuShareBodyOptions
): string {
  const randomFn = options?.random ?? Math.random;
  const header =
    options?.headerIndex != null
      ? pickByIndex(WEEK_SHARE_HEADERS, options.headerIndex)
      : pickRandomString(WEEK_SHARE_HEADERS, randomFn);
  const cta =
    options?.ctaIndex != null
      ? pickByIndex(WEEK_SHARE_CTAS, options.ctaIndex)
      : pickRandomString(WEEK_SHARE_CTAS, randomFn);

  const lines: string[] = [header, ""];
  for (const row of dayRows) {
    const block = formatWeekShareDayBlock(row);
    if (!block) continue;
    lines.push(...block);
    lines.push("");
  }
  lines.push(cta);
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
