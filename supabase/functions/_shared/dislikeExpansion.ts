/**
 * Расширение чипов dislike (Telegram/VK: овощи, мясо, …) до подстрочных токенов и категорий ингредиентов.
 * Аллергии остаются в allergyAliases; здесь только сценарии «не ест» из онбординга.
 */

import { buildBlockedTokensFromAllergies } from "./allergyAliases.ts";
import { normalizeRecipeTextForPreferenceMatch } from "./recipeAllergyMatch.ts";

/** Значения public.product_category для recipe_ingredients.category */
export type DislikeIngredientCategory = "vegetables" | "meat" | "fish" | "dairy" | "grains";

const CHIP_TO_INGREDIENT_CATEGORIES: Record<string, DislikeIngredientCategory[]> = {
  овощи: ["vegetables"],
  мясо: ["meat"],
  рыба: ["fish"],
  молочное: ["dairy"],
  крупы: ["grains"],
};

/**
 * Доп. токены подстрочного поиска (как allergyTokenMatches: includes в нормализованном тексте).
 * Не использовать слишком короткие подстроки («лук» → «полук»).
 */
const CHIP_EXTRA_SUBSTRING_TOKENS: Record<string, string[]> = {
  овощи: [
    "овощн",
    "овощи",
    "морков",
    "кабач",
    "броккол",
    "тыкв",
    "капуст",
    "помидор",
    "томат",
    "огурец",
    "огурц",
    "свёкл",
    "свекл",
    "редис",
    "шпинат",
    "петрушк",
    "укроп",
    "сельдер",
    "баклажан",
    "цветной капуст",
    "цветная капуст",
    "горошек",
    "зелёный горо",
    "зеленый горо",
    "спарж",
    "авокад",
    "патиссон",
    "руккол",
    "латук",
    "айсберг",
    "щавел",
    "редьк",
    "дайкон",
    "чесноч",
    "чеснок",
    "zucchini",
    "картофел",
    "батат",
    "пастернак",
  ],
  крупы: [
    "гречк",
    "овсян",
    "перлов",
    "ячн",
    "пшён",
    "булгур",
    "манк",
    "киноа",
    "quinoa",
    "кус-кус",
    "couscous",
    "амарант",
    "полба",
    "просо",
    "круп",
    "рисов",
    "геркулес",
  ],
  супы: [
    "борщ",
    "солянк",
    "рассольник",
    "окрошк",
    "гаспачо",
    "уха",
    "супчик",
    "крем-суп",
    "крем суп",
    "похлёбк",
    "похлебк",
    "бульонн",
  ],
  острое: [
    "чили",
    "чил",
    "остр",
    "tabasco",
    "табаско",
    "wasabi",
    "васаб",
    "кайенск",
    "перец чил",
    "халапень",
    "джалапень",
    "шрирач",
    "sriracha",
    "острый перец",
    "жгуч",
  ],
  грибы: [
    "гриб",
    "шампинь",
    "опят",
    "подберёз",
    "подберез",
    "боровик",
    "вешенк",
    "енокоп",
    "трюфел",
    "mushroom",
  ],
  /** «нут» отдельно — recipeTextMatchesLegumeDislike (иначе ложное «минут»). */
  бобовые: [
    "фасол",
    "горох",
    "чечевиц",
    "бобов",
    "эдамам",
    "стручковая фасол",
  ],
};

export function normalizeDislikeChip(raw: string): string {
  return normalizeRecipeTextForPreferenceMatch(String(raw ?? ""));
}

export function getDislikeIngredientCategoriesToBlock(dislikes: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const d of dislikes ?? []) {
    const key = normalizeDislikeChip(d);
    const cats = CHIP_TO_INGREDIENT_CATEGORIES[key];
    if (cats) for (const c of cats) out.add(c);
  }
  return out;
}

function addNormalizedTokens(set: Set<string>, tokens: string[]): void {
  for (const t of tokens) {
    const nt = normalizeRecipeTextForPreferenceMatch(t);
    if (nt.length >= 2) set.add(nt);
  }
}

/** «суп» без ложного срабатывания на «супер»: паддинг + целое слово «суп»/производные. */
export function normalizedTextMatchesSoupDislike(normalizedRecipeText: string): boolean {
  const h = ` ${normalizedRecipeText} `;
  if (/(^|\s)суп[\s-]/.test(h)) return true;
  if (/(^|\s)щи(\s|,|$)/.test(h)) return true;
  if (h.includes(" борщ")) return true;
  return false;
}

/**
 * Токены для recipeMatchesAllergyTokens (подстрока в нормализованном тексте рецепта).
 */
export function buildDislikeExpandedSubstringTokens(dislikes: string[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const d of dislikes ?? []) {
    const key = normalizeDislikeChip(d);
    if (!key) continue;
    if (key === "мясо") {
      addNormalizedTokens(set, buildBlockedTokensFromAllergies(["мясо"]));
      continue;
    }
    if (key === "рыба") {
      addNormalizedTokens(set, buildBlockedTokensFromAllergies(["рыба"]));
      continue;
    }
    if (key === "молочное") {
      addNormalizedTokens(set, buildBlockedTokensFromAllergies(["бкм", "лактоза"]));
      continue;
    }
    if (key === "супы") {
      addNormalizedTokens(set, CHIP_EXTRA_SUBSTRING_TOKENS["супы"] ?? []);
      continue;
    }
    const extra = CHIP_EXTRA_SUBSTRING_TOKENS[key];
    if (extra) addNormalizedTokens(set, extra);
  }
  return [...set];
}

/** «нут» в типичных словоформах (не «минут»). */
export function normalizedTextMatchesLegumeDislike(normalizedRecipeText: string): boolean {
  const h = ` ${normalizedRecipeText} `;
  if (/(^|\s)нут(ом|е|а|у|ем|ами|ах|я|ю|ь|ы|и|)(\s|,|$)/iu.test(h)) return true;
  if (h.includes(" фасол")) return true;
  if (h.includes(" чечевиц")) return true;
  if (h.includes(" горох")) return true;
  if (h.includes(" бобов")) return true;
  if (h.includes(" эдамам")) return true;
  return false;
}

export function recipeTextMatchesChipSpecificDislikes(
  normalizedRecipeText: string,
  dislikes: string[] | null | undefined,
): boolean {
  for (const d of dislikes ?? []) {
    const key = normalizeDislikeChip(d);
    if (key === "супы" && normalizedTextMatchesSoupDislike(normalizedRecipeText)) return true;
    if (key === "бобовые" && normalizedTextMatchesLegumeDislike(normalizedRecipeText)) return true;
  }
  return false;
}
