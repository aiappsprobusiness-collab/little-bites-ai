/**
 * Канонические токены для аллергий на мясо (mammal/poultry/mince) для плана и чата.
 * Синхронизируется в Edge: supabase/functions/_shared/meatAllergyTokens.ts (npm run sync:allergens).
 *
 * Политика:
 * - Подстроки в тексте (как containsAnyTokenForAllergy / recipeMatchesAllergyTokens).
 * - Не использовать голый стем «мяс» — ложное срабатывание на «мясистые помидоры».
 * - «мясо» (umbrella) не включает рыбу и морепродукты — они отдельные аллергии в ALLERGY_ALIASES.
 * - Узкая «курица» без токенов «птиц»/poultry — иначе режется утка и т.п.
 */

/** Говядина + телятина (красное мясо крупного рогатого скота). */
export const BEEF_VEAL_BLOCK_TOKENS: string[] = [
  "говяд",
  "телят",
  "beef",
  "veal",
];

export const PORK_BLOCK_TOKENS: string[] = [
  "свинин",
  "свиной",
  "pork",
  "бекон",
  "bacon",
  "ветчин",
  "ham",
  "сало",
];

/** Только курица (не индейка, не говядина). */
export const CHICKEN_ONLY_BLOCK_TOKENS: string[] = [
  "куриц",
  "курин",
  "курят",
  "курочк",
  "бройлер",
  "chicken",
];

export const TURKEY_ONLY_BLOCK_TOKENS: string[] = ["индейк", "turkey"];

/** Фарш и аналоги (входит в umbrella «мясо» и в отдельную аллергию «фарш»). */
export const MINCE_MEAT_TOKENS: string[] = [
  "фарш",
  "mince",
  "minced",
  "ground beef",
  "ground pork",
  "ground turkey",
  "ground chicken",
];

/**
 * Склонения и прилагательные от «мясо»; без корня «мяс» из двух букв и без «мяс» как подстроки
 * для форм вроде «мясистый».
 */
export const MEAT_LEXEME_TOKENS: string[] = [
  "мясо",
  "мяса",
  "мясу",
  "мясом",
  "мясе",
  "мясной",
  "мясная",
  "мясное",
  "мясные",
  "мясного",
  "мясному",
  "мясным",
  "мясными",
  "meat",
];

/** Доп. животные для umbrella «мясо» (не в узких аллергиях курица/индейка/говядина). */
export const MEAT_UMBRELLA_EXTRA_ANIMAL_TOKENS: string[] = [
  "баранин",
  "lamb",
  "утин",
  "duck",
  "гусин",
  "goose",
  "кролик",
  "rabbit",
];

function dedupeTokens(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const s = String(t).trim().toLowerCase();
    if (s.length < 2 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Полный набор токенов для аллергии «мясо» / meat. */
export function getMeatUmbrellaBlockTokens(): string[] {
  return dedupeTokens([
    ...MEAT_LEXEME_TOKENS,
    ...BEEF_VEAL_BLOCK_TOKENS,
    ...PORK_BLOCK_TOKENS,
    ...CHICKEN_ONLY_BLOCK_TOKENS,
    ...TURKEY_ONLY_BLOCK_TOKENS,
    ...MINCE_MEAT_TOKENS,
    ...MEAT_UMBRELLA_EXTRA_ANIMAL_TOKENS,
  ]);
}

export function isGenericAnimalMeatAllergyNormalized(normalizedLower: string): boolean {
  const n = normalizedLower.trim().replace(/\s+/g, " ");
  return n === "мясо" || n === "meat";
}
