/**
 * Эвристики для строк recipe_ingredients, где нет канона из-за бытовых единиц
 * («зубчик», «веточка», «ломтик» без «= N г» в хвосте display_text).
 * Используется только repair-скриптом; не меняет правила save-time enrich.
 *
 * Якоря — консервативные кулинарные ориентиры (не медицинская точность).
 */

import { isValidStoredCanonicalPair } from "./ingredientCanonicalResolve.ts";

/** г на 1 зубчик чеснока */
export const GARLIC_CLOVE_G = 5;
/** г на 1 веточку зелени (укроп, розмарин, петрушка) */
export const HERB_SPRIG_G = 3;
/** г на 1 ломтик хлеба по умолчанию */
export const BREAD_SLICE_G = 28;
/** г на 1 см свежего имбиря (оценка) */
export const GINGER_CM_G = 4;
/** г на 1 стебель сельдерея */
export const CELERY_STALK_G = 35;
/** г на 1 стебель зелёного лука */
export const GREEN_ONION_STALK_G = 12;
/** половина средней репчатой луковицы */
export const ONION_HALF_G = 45;
/** половина куриного яйца для порций */
export const EGG_HALF_G = 25;
/** ~1/4 ч.л. соли */
export const SALT_QUARTER_TSP_G = 1;

export type HouseholdHeuristicPatch = {
  canonical_amount: number;
  canonical_unit: "g" | "ml" | "pcs" | "tsp" | "tbsp";
  heuristic: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Пытается вывести канон из русскоязычного display_text / имени, когда стандартный парсер не сработал.
 */
export function tryHouseholdCanonicalHeuristic(row: {
  name: string | null;
  display_text: string | null;
  amount: unknown;
  unit: string | null;
}): HouseholdHeuristicPatch | null {
  if (isValidStoredCanonicalPair(row.canonical_amount as number | null, row.canonical_unit)) {
    return null;
  }

  const name = `${row.name ?? ""}`.toLowerCase();
  const dt = `${row.display_text ?? ""}`.trim();
  const combined = `${name} ${dt}`.toLowerCase();
  if (!dt && !name) return null;

  const tail = dt.includes("—") || dt.includes("-") ? (dt.split(/\s*[—\-]\s*/).pop() ?? "").trim() : dt;

  // Соль 1/4 ч.л. / дробь + ч.л.
  if (/соль|соли/i.test(name) && (/1\s*\/\s*4\s*ч|0?[,.]?\s*25\s*ч/i.test(tail) || /\/\s*4\s*ч\.?\s*л/i.test(dt))) {
    return { canonical_amount: SALT_QUARTER_TSP_G, canonical_unit: "g", heuristic: "salt_quarter_tsp_g" };
  }

  // Яйцо 1/2 шт.
  if (/яйц/i.test(combined) && (/1\s*\/\s*2\s*шт|половин/i.test(tail) || /\/\s*2\s*шт/i.test(String(row.unit ?? "")))) {
    return { canonical_amount: EGG_HALF_G, canonical_unit: "g", heuristic: "egg_half_g" };
  }

  // Лук репчатый 1/2 шт.
  if (/лук\s*репч|репчат/i.test(combined) && (/1\s*\/\s*2\s*шт/i.test(tail) || /половин/i.test(tail))) {
    return { canonical_amount: ONION_HALF_G, canonical_unit: "g", heuristic: "onion_half_g" };
  }

  // Чеснок: N зубчик(а/ов)
  const clove = tail.match(/(\d+(?:[.,]\d+)?)\s*(зубчик|зубчика|зубчиков)/i);
  if (clove && /чеснок|чеснока/i.test(combined)) {
    const n = parseFloat(clove[1].replace(",", "."));
    if (n > 0 && n <= 30) {
      return {
        canonical_amount: round1(n * GARLIC_CLOVE_G),
        canonical_unit: "g",
        heuristic: "garlic_cloves_g",
      };
    }
  }

  // Зубчик без слова «чеснок» в редких строках — всё равно трактуем как чеснок, если в названии есть чеснок
  if (clove && /чеснок/i.test(name)) {
    const n = parseFloat(clove[1].replace(",", "."));
    if (n > 0 && n <= 30) {
      return {
        canonical_amount: round1(n * GARLIC_CLOVE_G),
        canonical_unit: "g",
        heuristic: "garlic_cloves_by_name_g",
      };
    }
  }

  // Веточки зелени
  const sprig = tail.match(/(\d+(?:[.,]\d+)?)\s*(веточка|веточки|веточек)/i);
  if (sprig && /укроп|розмарин|петрушк|тимьян|базилик/i.test(combined)) {
    const n = parseFloat(sprig[1].replace(",", "."));
    if (n > 0 && n <= 20) {
      return {
        canonical_amount: round1(n * HERB_SPRIG_G),
        canonical_unit: "g",
        heuristic: "herb_sprigs_g",
      };
    }
  }

  // Ломтики хлеба
  const slice = tail.match(/(\d+(?:[.,]\d+)?)\s*(ломтик|ломтика|ломтиков)/i);
  if (slice && /хлеб|батон|тост|багет/i.test(combined)) {
    const n = parseFloat(slice[1].replace(",", "."));
    if (n > 0 && n <= 20) {
      return {
        canonical_amount: round1(n * BREAD_SLICE_G),
        canonical_unit: "g",
        heuristic: "bread_slices_g",
      };
    }
  }

  // Имбирь N см
  const gingerCm = tail.match(/(\d+(?:[.,]\d+)?)\s*см\b/i);
  if (gingerCm && /имбир/i.test(combined)) {
    const n = parseFloat(gingerCm[1].replace(",", "."));
    if (n > 0 && n <= 30) {
      return {
        canonical_amount: round1(n * GINGER_CM_G),
        canonical_unit: "g",
        heuristic: "ginger_cm_g",
      };
    }
  }

  // Сельдерей стебель
  const celery = tail.match(/(\d+(?:[.,]\d+)?)\s*(стебель|стебля|стеблей)/i);
  if (celery && /сельдер/i.test(combined)) {
    const n = parseFloat(celery[1].replace(",", "."));
    if (n > 0 && n <= 10) {
      return {
        canonical_amount: round1(n * CELERY_STALK_G),
        canonical_unit: "g",
        heuristic: "celery_stalk_g",
      };
    }
  }

  // Зелёный лук — стебли
  const greenOnion = tail.match(/(\d+(?:[.,]\d+)?)\s*(стебель|стебля|стеблей)/i);
  if (greenOnion && /зелён/i.test(combined) && /лук/i.test(combined)) {
    const n = parseFloat(greenOnion[1].replace(",", "."));
    if (n > 0 && n <= 20) {
      return {
        canonical_amount: round1(n * GREEN_ONION_STALK_G),
        canonical_unit: "g",
        heuristic: "green_onion_stalk_g",
      };
    }
  }

  return null;
}

/**
 * Дополняет display_text суффиксом « = N г», если канон в граммах и в строке ещё нет «=».
 */
export function appendCanonicalGramSuffix(displayText: string | null, grams: number): string {
  const base = (displayText ?? "").trim();
  if (!base) return `— ${grams} г`;
  if (/=\s*\d/.test(base)) return base;
  return `${base} = ${grams % 1 === 0 ? grams : round1(grams)} г`;
}
