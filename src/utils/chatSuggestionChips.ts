/**
 * Адаптивные подсказки для чата рецептов: один рецепт (single-shot),
 * строго по возрасту профиля. Детские чипсы только при возрасте < 18 лет.
 */

const FORBIDDEN_SUBSTRINGS = [
  "варианты",
  "меню",
  "подборка",
  "идеи",
  "на неделю",
  "на 3 дня",
  "рацион",
  "5 рецептов",
];

function hasForbidden(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_SUBSTRINGS.some((s) => lower.includes(s));
}

const ADULT_AGE_MONTHS = 18 * 12; // 216

/** Возрастные группы по месяцам: 0–1, 1–3, 3–7, 7–17, 18+. */
function getAgeGroup(
  ageMonths: number | null | undefined
): "0-1" | "1-3" | "3-7" | "7-17" | "18+" | null {
  if (ageMonths == null) return null;
  if (ageMonths >= ADULT_AGE_MONTHS) return "18+";
  if (ageMonths < 12) return "0-1";
  if (ageMonths < 36) return "1-3";
  if (ageMonths < 84) return "3-7";
  return "7-17";
}

/** Чипсы для профилей 18+: без «для ребёнка», «для школьника», «для малыша». */
const ADULT_CHIPS = [
  "Сытный ужин",
  "Гарнир к мясу",
  "Суп на обед",
  "Быстрый ужин за 20 минут",
  "Блюдо из рыбы",
  "Блюдо из говядины",
];

/** Детские чипсы по группам — показывать только если возраст < 18. */
const CHIPS_0_1 = [
  "Овощное пюре",
  "Мясное пюре",
  "Каша без сахара",
  "Безмолочный прикорм",
];

const CHIPS_1_3 = [
  "Лёгкий ужин",
  "Суп без зажарки",
  "Блюдо из индейки",
  "Запеканка без жарки",
];

const CHIPS_3_7 = [
  "Полезный перекус",
  "Блюдо из курицы",
  "Овощной гарнир",
];

const CHIPS_7_17 = [
  "Ужин для школьника",
  "Сытный ужин",
  "Быстрый завтрак",
  "Блюдо из курицы",
];

/** Чипсы 3–7 с подстановкой имени (если передать имя). */
function getChips3_7(memberName: string | null): string[] {
  const base = [...CHIPS_3_7];
  if (memberName?.trim()) {
    base.unshift(`Ужин для ${memberName.trim()}`);
  }
  return base;
}

const CHILD_GROUPS = {
  "0-1": CHIPS_0_1,
  "1-3": CHIPS_1_3,
  "3-7": CHIPS_3_7,
  "7-17": CHIPS_7_17,
} as const;

/** Время суток по локальному часу: morning 05–11, day 12–16, evening 17–22, night 23–04. */
export function getTimeOfDay(): "morning" | "day" | "evening" | "night" {
  const h = typeof document !== "undefined" ? new Date().getHours() : 12;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 23) return "evening";
  return "night";
}

/** Якорные чипсы по времени суток (1–2 шт.): завтрак/обед/ужин/перекус. */
const TIME_ANCHORS: Record<"morning" | "day" | "evening" | "night", string[]> = {
  morning: ["Быстрый завтрак", "Каша без сахара"],
  day: ["Суп на обед", "Обед без жарки"],
  evening: ["Ужин за 20 минут", "Сытный ужин"],
  night: ["Лёгкий перекус", "Быстрое блюдо за 15 минут"],
};

export interface SuggestionChipsInput {
  /** Выбранный профиль: "family" или id ребёнка/взрослого. */
  selectedMemberId: string | null;
  /** Возраст выбранного профиля (месяцы). >= 216 (18 лет) → только взрослые чипсы. */
  ageMonths: number | null | undefined;
  /** Аллергии выбранного профиля (или объединённые для семьи). */
  allergies: string[];
  /** Есть ли в семье несколько человек (профиль «семья»). */
  isFamily: boolean;
  /** Имя выбранного профиля (для чипа «Ужин для {имя}» в группе 3–7). */
  memberName?: string | null;
}

/**
 * Строит список подсказок (макс. 8): строго по возрасту.
 * 18+ — только взрослые чипсы; < 18 — только детские по группе.
 * Вариант «Рецепт без …» в подсказки не добавляем.
 */
export function getSuggestionChips(input: SuggestionChipsInput): string[] {
  const { ageMonths, memberName } = input;
  const out: string[] = [];
  const used = new Set<string>();

  function add(phrase: string) {
    const n = phrase.trim();
    if (!n || hasForbidden(n) || used.has(n)) return;
    used.add(n);
    out.push(n);
  }

  const ageGroup = getAgeGroup(ageMonths ?? null);

  if (ageGroup === "18+" || ageMonths != null && ageMonths >= ADULT_AGE_MONTHS) {
    ADULT_CHIPS.forEach(add);
  } else if (ageGroup && ageGroup !== "18+") {
    const chips =
      ageGroup === "3-7"
        ? getChips3_7(memberName ?? null)
        : CHILD_GROUPS[ageGroup];
    if (chips) chips.forEach(add);
  } else {
    ADULT_CHIPS.forEach(add);
  }

  // Якоря по времени суток: гарантированно 1–2 чипса в начале выдачи
  const timeOfDay = getTimeOfDay();
  const anchors = TIME_ANCHORS[timeOfDay] ?? [];
  let result = [...out];
  for (let i = 0; i < Math.min(2, anchors.length); i++) {
    const a = anchors[i].trim();
    if (!a || hasForbidden(a)) continue;
    if (result.includes(a)) {
      result = [a, ...result.filter((x) => x !== a)];
    } else {
      result = [a, ...result];
    }
  }
  return result.slice(0, 8);
}
