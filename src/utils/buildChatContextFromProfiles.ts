/**
 * Парсинг имён из текста чата, поиск в профилях детей и формирование контекста для DeepSeek.
 *
 * Логика:
 * 1. Парсим текст на имена из наших профилей (любое склонение).
 * 2. Если имена найдены → общий рецепт для этих детей: возраст/аллергии ВСЕХ найденных.
 * 3. Если имён нет → используем текущий выбранный профиль (возраст + аллергии).
 *
 * Камера/фото: всегда текущий профиль (эта функция не используется для сканера).
 */

export interface ChildProfile {
  id: string;
  name: string;
  birth_date: string;
  allergies?: string[] | null;
  likes?: string[] | null;
  dislikes?: string[] | null;
  diet_goals?: string[] | null;
  weight?: number | null;
  height?: number | null;
}

export interface ChatContextChildData {
  name: string;
  ageMonths: number;
  allergies?: string[];
  likes?: string[];
  dislikes?: string[];
  dietGoals?: string[];
  weight?: number;
  height?: number;
  /** Описание возраста для нескольких детей, если применимо */
  ageDescription?: string;
}

export interface BuildChatContextInput {
  userMessage: string;
  children: ChildProfile[];
  selectedChild: ChildProfile | null | undefined;
  calculateAgeInMonths: (birthDate: string) => number;
}

export interface BuildChatContextResult {
  childData: ChatContextChildData | undefined;
  /** id профилей, по имени которых нашли совпадения (для общего рецепта) */
  matchedChildIds: string[];
}

const PUNCT = /[\s,.\-!?;:()]+/;
/** Окончания склонений: основа + суффикс даёт допустимое слово */
const DECLENSION_SUFFIXES = ['а', 'я', 'и', 'е', 'у', 'ю', 'ой', 'ей', 'ью', 'ем', 'ом', ''] as const;

function normalizedWords(text: string): string[] {
  return text
    .split(PUNCT)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Проверяет, встречается ли имя (или его склонение) в тексте.
 * Учитываем типичные окончания: -а/-я → -и/-е/-у/-ой/-ей, -й → -я/-ю и т.д.
 * Избегаем ложных совпадений: "Марина" не должна матчить "Маша".
 */
function nameMatchesInText(name: string, words: string[]): boolean {
  const n = name.trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  const stem = lower.length > 1 ? lower.slice(0, -1) : lower;

  for (const w of words) {
    if (w === lower) return true;
    if (!w.startsWith(stem) || w.length < stem.length) continue;
    const rest = w.slice(stem.length);
    if (DECLENSION_SUFFIXES.includes(rest as any) || (rest.length <= 2 && /^[а-яё]+$/.test(rest))) return true;
  }
  return false;
}

/**
 * Находит профили, имена которых (в любом склонении) встречаются в сообщении.
 */
function matchProfilesInMessage(
  message: string,
  children: ChildProfile[]
): ChildProfile[] {
  const words = normalizedWords(message);
  const matched: ChildProfile[] = [];

  for (const child of children) {
    if (!child.name?.trim()) continue;
    if (nameMatchesInText(child.name, words)) {
      matched.push(child);
    }
  }

  return matched;
}

/** Фразы «для всех / семейный» → рецепт на всю семью, учитывать ВСЕХ детей и все аллергии */
const FAMILY_INTENT_PATTERNS = [
  /\bна\s+всех\b/i,
  /\bдля\s+всех\b/i,
  /\bсемейн/i,        // семейный, семейное, семейный ужин
  /\bвсей\s+семьей\b/i,
  /\bвсем\s+детям\b/i,
  /\bвсех\s+детей\b/i,
  /\bвся\s+семья\b/i,
  /\bобщий\s+(ужин|обед|завтрак|рецепт|полдник)\b/i,
];

function isFamilyIntent(message: string): boolean {
  const s = (message || '').trim();
  if (!s) return false;
  return FAMILY_INTENT_PATTERNS.some((re) => re.test(s));
}

function buildChildDataFromProfiles(
  profiles: ChildProfile[],
  calculateAgeInMonths: (birthDate: string) => number
): { childData: ChatContextChildData; matchedChildIds: string[] } {
  const ages = profiles.map((c) => calculateAgeInMonths(c.birth_date));
  const ageMonths = Math.min(...ages);
  const allAllergies = new Set<string>();
  const allDietGoals = new Set<string>();
  const allLikes = new Set<string>();
  const allDislikes = new Set<string>();
  let weight: number | undefined;
  let height: number | undefined;

  for (const c of profiles) {
    (c.allergies || []).forEach((a) => a?.trim() && allAllergies.add(a.trim()));
    ((c as any).diet_goals || []).forEach((g: string) => g?.trim() && allDietGoals.add(g.trim()));
    (c.likes || []).forEach((l: string) => l?.trim() && allLikes.add(l.trim()));
    (c.dislikes || []).forEach((d: string) => d?.trim() && allDislikes.add(d.trim()));
    if (c.weight != null) weight = c.weight;
    if (c.height != null) height = c.height;
  }

  const names = profiles.map((c) => c.name).join(', ');
  const ageParts = profiles.map((c) => {
    const m = calculateAgeInMonths(c.birth_date);
    if (m < 12) return `${m} мес`;
    const y = Math.floor(m / 12);
    const rest = m % 12;
    return rest ? `${y} г. ${rest} мес` : `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'}`;
  });
  const ageDescription = ageParts.join(', ');

  return {
    childData: {
      name: names,
      ageMonths,
      allergies: allAllergies.size ? Array.from(allAllergies) : undefined,
      dietGoals: allDietGoals.size ? Array.from(allDietGoals) : undefined,
      weight,
      height,
      ageDescription,
      // Добавляем likes и dislikes в childData для использования в промптах
      likes: allLikes.size ? Array.from(allLikes) : undefined,
      dislikes: allDislikes.size ? Array.from(allDislikes) : undefined,
    } as any,
    matchedChildIds: profiles.map((c) => c.id),
  };
}

/**
 * Парсинг имён → поиск в профилях → сбор особенностей (возраст, аллергии).
 * 1. Имена в сообщении → общий рецепт для найденных детей (все их аллергии).
 * 2. «Для всех»/«семейный» и несколько детей → все дети, все аллергии.
 * 3. Иначе → текущий выбранный профиль.
 */
export function buildChatContextFromProfiles({
  userMessage,
  children,
  selectedChild,
  calculateAgeInMonths,
}: BuildChatContextInput): BuildChatContextResult {
  const matched = matchProfilesInMessage(userMessage, children);

  if (matched.length > 0) {
    return buildChildDataFromProfiles(matched, calculateAgeInMonths);
  }

  if (isFamilyIntent(userMessage) && children.length > 1) {
    return buildChildDataFromProfiles(children, calculateAgeInMonths);
  }

  if (selectedChild) {
    const m = calculateAgeInMonths(selectedChild.birth_date);
    const allergies = (selectedChild.allergies || []).filter((a) => a?.trim());
    return {
      childData: {
        name: selectedChild.name,
        ageMonths: m,
        allergies: allergies.length ? allergies : undefined,
        dietGoals: (selectedChild as any).diet_goals || undefined,
        weight: selectedChild.weight ?? undefined,
        height: selectedChild.height ?? undefined,
      },
      matchedChildIds: [],
    };
  }

  return { childData: undefined, matchedChildIds: [] };
}
