/**
 * Быстрые подсказки для чата рецептов по возрастной категории.
 * Family-mode: детей до 1 года не учитываем при выборе категории подсказок.
 */

export type QuickPromptsMember = {
  age_months?: number | null;
  name?: string | null;
};

export type QuickPromptsParams = {
  mode: "member" | "family";
  selectedMember?: QuickPromptsMember | null;
  members?: QuickPromptsMember[];
};

/** infant < 12, toddler 12–35, kid 36–83, adult >= 84 (7+ лет = общий стол для подсказок). */
export type AgeCategory = "infant" | "toddler" | "kid" | "adult";

const INFANT_MAX = 11;
const TODDLER_MAX = 35;
const KID_MAX = 83;

export function getAgeCategory(ageMonths: number | null | undefined): AgeCategory {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return "adult";
  if (ageMonths <= INFANT_MAX) return "infant";
  if (ageMonths <= TODDLER_MAX) return "toddler";
  if (ageMonths <= KID_MAX) return "kid";
  return "adult";
}

/** Family: эффективный возраст = min среди членов с age_months >= 12 (infant не учитываем). */
function getFamilyEffectiveCategory(members: QuickPromptsMember[]): AgeCategory {
  const candidates = members.filter(
    (m) => m.age_months == null || (Number.isFinite(m.age_months) && m.age_months >= 12)
  );
  if (candidates.length === 0) return "infant";
  const ages = candidates
    .map((m) => m.age_months!)
    .filter((a): a is number => a != null && Number.isFinite(a));
  if (ages.length === 0) return "adult";
  const minAge = Math.min(...ages);
  return getAgeCategory(minAge);
}

const PROMPTS_INFANT: string[] = [
  "Пюре из овощей",
  "Каша на воде",
  "Быстрый прикорм",
  "Что можно в 8 месяцев?",
  "Пюре из фруктов",
  "Безмолочная каша",
];

const PROMPTS_TODDLER: string[] = [
  "Сытный ужин без жарки",
  "Быстрый суп",
  "Запеканка",
  "Котлетки или тефтели",
  "Блюдо из индейки",
  "Овощное рагу",
  "Каша на молоке",
];

const PROMPTS_KID: string[] = [
  "Лёгкий ужин",
  "Гарнир",
  "Блюдо из рыбы",
  "Быстрое блюдо за 15 минут",
  "Блюдо из курицы",
  "Овощной гарнир",
  "Полезный перекус",
];

const PROMPTS_ADULT: string[] = [
  "Быстрое блюдо за 15 минут",
  "Сытный ужин",
  "Гарнир к мясу",
  "Суп на обед",
  "Блюдо из рыбы",
  "Блюдо из говядины",
  "Быстрый завтрак",
  "Лёгкий перекус",
];

const BY_CATEGORY: Record<AgeCategory, string[]> = {
  infant: PROMPTS_INFANT,
  toddler: PROMPTS_TODDLER,
  kid: PROMPTS_KID,
  adult: PROMPTS_ADULT,
};

/**
 * Список подсказок для модалки и чипов в чате.
 * Family: категория по «общему столу» (исключая детей до 1 года).
 */
export function getQuickPromptsForMode(params: QuickPromptsParams): string[] {
  const { mode, selectedMember, members = [] } = params;

  let category: AgeCategory;

  if (mode === "family") {
    category = getFamilyEffectiveCategory(members);
  } else {
    const age = selectedMember?.age_months ?? null;
    category = getAgeCategory(age);
  }

  return [...(BY_CATEGORY[category] ?? PROMPTS_ADULT)];
}
