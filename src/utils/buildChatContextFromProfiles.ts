/**
 * Парсинг имён из текста чата, поиск в профилях членов семьи и формирование контекста для DeepSeek.
 * 1. Имена в сообщении → общий рецепт для найденных members (все аллергии).
 * 2. «Для всех»/«семейный» → все members. 3. Иначе — выбранный member.
 */

/** V2: профиль из members (age_months). */
export interface MemberProfile {
  id: string;
  name: string;
  birth_date?: string;
  age_months?: number | null;
  allergies?: string[] | null;
}

/** Данные для промпта (имя, возраст, аллергии). V2: memberData для Edge Function. */
export interface ChatContextMemberData {
  name: string;
  birth_date?: string;
  ageMonths: number;
  allergies?: string[];
  ageDescription?: string;
}

export interface BuildChatContextInput {
  userMessage: string;
  members: MemberProfile[];
  selectedMember: MemberProfile | null | undefined;
  selectedMemberId?: string | null;
  calculateAgeInMonths?: (birthDate: string) => number;
}

export interface BuildChatContextResult {
  memberData: ChatContextMemberData | undefined;
  matchedMemberIds: string[];
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
  members: MemberProfile[]
): MemberProfile[] {
  const words = normalizedWords(message);
  const matched: MemberProfile[] = [];

  for (const member of members) {
    if (!member.name?.trim()) continue;
    if (nameMatchesInText(member.name, words)) {
      matched.push(member);
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

/** Извлекает возраст в месяцах: число (int4 из БД) или строка, иначе birth_date через calc, иначе 0. */
function getAgeMonths(c: MemberProfile, calc?: (birthDate: string) => number): number {
  const raw = c.age_months;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return Math.max(0, n);
  }
  if (c.birth_date && calc) return Math.max(0, calc(c.birth_date));
  return 0;
}

function buildMemberDataFromProfiles(
  profiles: MemberProfile[],
  calc?: (birthDate: string) => number
): { memberData: ChatContextMemberData; matchedMemberIds: string[] } {
  const ages = profiles.map((c) => getAgeMonths(c, calc));
  const ageMonths = ages.length ? Math.min(...ages) : 0;
  const allAllergies = new Set<string>();

  for (const c of profiles) {
    (c.allergies || []).forEach((a) => a?.trim() && allAllergies.add(a.trim()));
  }

  const names = profiles.map((c) => c.name).join(', ');
  const ageParts = profiles.map((c) => {
    const m = getAgeMonths(c, calc);
    if (m < 12) return `${m} мес`;
    const y = Math.floor(m / 12);
    const rest = m % 12;
    return rest ? `${y} г. ${rest} мес` : `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'}`;
  });
  const ageDescription = ageParts.join(', ');

  return {
    memberData: {
      name: names,
      ageMonths,
      allergies: allAllergies.size ? Array.from(allAllergies) : undefined,
      ageDescription,
    },
    matchedMemberIds: profiles.map((c) => c.id),
  };
}

export function buildChatContextFromProfiles({
  userMessage,
  members,
  selectedMember,
  selectedMemberId,
  calculateAgeInMonths,
}: BuildChatContextInput): BuildChatContextResult {
  const matched = matchProfilesInMessage(userMessage, members);

  if (matched.length > 0) {
    return buildMemberDataFromProfiles(matched, calculateAgeInMonths);
  }

  if (selectedMemberId === "family" && members.length > 0) {
    return buildMemberDataFromProfiles(members, calculateAgeInMonths);
  }

  if (isFamilyIntent(userMessage) && members.length > 1) {
    return buildMemberDataFromProfiles(members, calculateAgeInMonths);
  }

  if (selectedMember) {
    const m = getAgeMonths(selectedMember, calculateAgeInMonths);
    const allergies = (selectedMember.allergies || []).filter((a) => a?.trim());
    return {
      memberData: {
        name: selectedMember.name,
        birth_date: selectedMember.birth_date || undefined,
        ageMonths: m,
        allergies: allergies.length ? allergies : undefined,
      },
      matchedMemberIds: [],
    };
  }

  return { memberData: undefined, matchedMemberIds: [] };
}
