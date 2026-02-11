import { STARTER_DAILY_PLANS, STARTER_RECIPE_META } from "./starterDailyPlans";

/** Код для «использовать STARTER_NEUTRAL_DAY» — когда после hard-фильтра нет кандидатов */
export const STARTER_NEUTRAL_INDEX = -1;

/** Нормализация: общие термины (RU/EN) -> canonical allergen id */
const ALLERGEN_MAP: Record<string, string> = {
  молоко: "dairy", milk: "dairy", лактоза: "dairy", dairy: "dairy",
  глютен: "gluten", gluten: "gluten", пшеница: "gluten", wheat: "gluten",
  орехи: "nuts", nuts: "nuts", орех: "nuts", арахис: "nuts", peanut: "nuts",
  рыба: "fish", fish: "fish", рыб: "fish",
  яйца: "eggs", eggs: "eggs", яйцо: "eggs", egg: "eggs",
  соя: "soy", soy: "soy",
};

function normalizeAllergen(term: string): string {
  const t = term.toLowerCase().trim();
  return ALLERGEN_MAP[t] ?? t;
}

/** Маппинг "не любит X" -> теги рецепта */
const PREF_TO_TAGS: Record<string, string[]> = {
  молоко: ["dairy"], творог: ["dairy"], сыр: ["dairy"], кефир: ["dairy"], йогурт: ["dairy"], dairy: ["dairy"],
  глютен: ["gluten"], пшеница: ["gluten"], gluten: ["gluten"],
  орехи: ["nuts"], nuts: ["nuts"], арахис: ["nuts"],
  рыба: ["fish"], рыб: ["fish"], fish: ["fish"],
  яйца: ["eggs"], eggs: ["eggs"],
  мясо: ["meat"], курица: ["chicken"], говядина: ["beef"], свинина: ["pork"], индейка: ["turkey"], meat: ["meat"], chicken: ["chicken"], beef: ["beef"], pork: ["pork"], turkey: ["turkey"],
  овсянка: ["oats"], овёс: ["oats"], oats: ["oats"],
  рис: ["rice"], rice: ["rice"],
  гречка: ["buckwheat"], buckwheat: ["buckwheat"],
  лапша: ["pasta"], макароны: ["pasta"], pasta: ["pasta"],
  горох: ["legumes"], фасоль: ["legumes"], чечевица: ["legumes"], legumes: ["legumes"],
};

function extractDislikedTags(preferences: string[]): string[] {
  const tags = new Set<string>();
  const dislikePatterns = /не\s+любит\s+(.+)|не\s+ест\s+(.+)|без\s+(.+)|аллерги[яи]\s+(?:на\s+)?(.+)|нельзя\s+(.+)/i;
  for (const pref of preferences ?? []) {
    const m = String(pref).match(dislikePatterns);
    const rest = (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5] ?? "").trim().toLowerCase();
    if (!rest) continue;
    const words = rest.split(/[\s,]+/);
    for (const w of words) {
      const t = w.replace(/[^\p{L}\p{N}]/gu, "");
      if (t.length < 2) continue;
      const mapped = PREF_TO_TAGS[t] ?? (PREF_TO_TAGS[rest] ? PREF_TO_TAGS[rest] : []);
      mapped.forEach((tag) => tags.add(tag));
    }
    const full = PREF_TO_TAGS[rest];
    if (full) full.forEach((tag) => tags.add(tag));
  }
  return Array.from(tags);
}

/** Блюда без записи в STARTER_RECIPE_META не считаются конфликтом — пропускаем их. */
function variantHasAllergenConflict(
  plan: { recipe_id: string | null }[],
  profileAllergies: string[]
): boolean {
  if (profileAllergies.length === 0) return false;
  const normalizedProfile = new Set(profileAllergies.map(normalizeAllergen).filter(Boolean));
  for (const item of plan) {
    const meta = item.recipe_id ? STARTER_RECIPE_META[item.recipe_id] : undefined;
    if (!meta) continue;
    if (meta.allergens.some((a) => normalizedProfile.has(a))) return true;
  }
  return false;
}

/** Блюда без записи в STARTER_RECIPE_META не считаются конфликтом — пропускаем их. */
function variantHasPreferenceConflict(variantIndex: number, dislikedTags: string[]): boolean {
  if (dislikedTags.length === 0) return false;
  const disliked = new Set(dislikedTags.map((t) => t.toLowerCase()));
  const plan = STARTER_DAILY_PLANS[variantIndex];
  if (!plan) return false;
  for (const item of plan) {
    const meta = item.recipe_id ? STARTER_RECIPE_META[item.recipe_id] : undefined;
    if (!meta) continue;
    if (meta.tags.some((t) => disliked.has(t.toLowerCase()))) return true;
  }
  return false;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface StarterProfile {
  allergies?: string[];
  preferences?: string[];
}

/**
 * Выбирает индекс варианта starter дня с учётом профиля.
 * Hard: исключаем варианты с аллергенами. Если 0 — возвращаем STARTER_NEUTRAL_INDEX.
 * Soft: исключаем варианты с "не любит X", но если не осталось — берём из hard.
 * usedIndices: для недели — избегаем повторов (если возможно).
 */
export function selectStarterVariant(
  plannedDate: string,
  memberId: string | null | undefined,
  profile?: StarterProfile | null,
  usedIndices?: Set<number>
): number {
  const profileAllergies = (profile?.allergies ?? []).filter((a) => String(a).trim());
  const dislikedTags = extractDislikedTags(profile?.preferences ?? []);

  const allIndices = STARTER_DAILY_PLANS.map((_, i) => i);
  const afterHard = allIndices.filter((i) => !variantHasAllergenConflict(STARTER_DAILY_PLANS[i], profileAllergies));
  if (afterHard.length === 0) return STARTER_NEUTRAL_INDEX;

  const afterSoft = afterHard.filter((i) => !variantHasPreferenceConflict(i, dislikedTags));
  const candidates = afterSoft.length > 0 ? afterSoft : afterHard;

  let pool = candidates;
  if (usedIndices && usedIndices.size > 0) {
    const unused = candidates.filter((i) => !usedIndices.has(i));
    if (unused.length > 0) pool = unused;
  }

  const key = `${plannedDate}:${memberId ?? "all"}`;
  return pool[hashStr(key) % pool.length];
}
