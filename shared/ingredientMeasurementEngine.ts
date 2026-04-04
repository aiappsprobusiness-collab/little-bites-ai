/**
 * Универсальный движок кандидатов бытовой меры: тип меры, надёжность, согласование с canonical.
 * Не использует whitelist овощей/фруктов по названиям — лестница якорных масс + категории + явный парсинг текста.
 */

import { inferDbProductCategoryFromText, normalizeIngredientTextForCategoryMatch } from "./dbProductCategoryFromText.ts";
import {
  type DualMeasurementCandidateKind,
  type HouseholdReliability,
  isHumanReadableHouseholdQuantity,
  passesDualMeasurementQualityGate,
} from "./ingredientMeasurementQuality.ts";

export type HouseholdCandidateKind =
  | "explicit_household"
  | "tablespoon"
  | "teaspoon"
  | "clove"
  | "piece"
  | "slice"
  | "pinch"
  | "cup"
  | "jar_or_pack"
  | "egg"
  | "none";

export type ResolvedHouseholdCandidate = {
  kind: HouseholdCandidateKind;
  displayAmount: number;
  displayUnit: string;
  displayQuantityText: string | null;
  reliability: HouseholdReliability;
  explicitHousehold: boolean;
};

const MEAT_FISH_DAIRY_GRAINS_BLOCK =
  /фарш|филе|котлет|стейк|говядин|свинин|индейк|куриц|баранин|телятин|лосос|треск|тунец|форел|семг|судак|минтай|творог|йогурт|сыр\b|моцарел|рикотт|круп|овсян|греч|рис\b|булгур|киноа|перлов|макарон|паста\b|лапш|мука\b|хлеб/i;

/** Семантика «зубчиками» — узкий технический маркер, не каталог продуктов. */
const CLOVE_PRODUCT_STEM = /чеснок|чесноч/i;
const EGG_STEM = /яйц(о|а|ом|ами|ах)?\b/i;

const G_PER_CLOVE = 5;
const G_PER_TSP = 5;
const G_PER_TBSP_FAT = 17;
const G_PER_TBSP_GENERIC = 15;
const ML_PER_TBSP = 15;
const ML_PER_TSP = 5;
const G_PER_EGG = 55;

const PIECE_WEIGHT_ANCHORS_G = [55, 70, 85, 100, 120, 150, 180, 220];

function withinRel(computed: number, canonical: number, maxRel: number): boolean {
  if (!Number.isFinite(computed) || computed <= 0 || !Number.isFinite(canonical) || canonical <= 0) return false;
  return Math.abs(computed - canonical) / canonical <= maxRel;
}

export function resolveCategory(
  name: string,
  displayText: string,
  categoryHint: string | null | undefined,
): string {
  if (categoryHint && String(categoryHint).trim()) return String(categoryHint).trim().toLowerCase();
  return inferDbProductCategoryFromText(normalizeIngredientTextForCategoryMatch(name, displayText));
}

export function shouldBlockHouseholdInferenceFromGrams(
  name: string,
  displayText: string,
  category: string,
): boolean {
  const combined = normalizeIngredientTextForCategoryMatch(name, displayText);
  if (/по вкусу|для подачи/i.test(displayText.trim())) return true;
  const c = category.toLowerCase();
  if (c === "meat" || c === "fish" || c === "dairy" || c === "grains") {
    if (MEAT_FISH_DAIRY_GRAINS_BLOCK.test(combined)) return true;
  }
  return false;
}

/** Расширенный парсинг бытовой меры после «—» или в начале строки. */
const EXPLICIT_HOUSEHOLD =
  /(\d+[.,]?\d*)\s*(зубчик|зубчика|зубчиков|ст\.\s*л\.?|ст\.л\.?|ч\.\s*л\.?|ч\.л\.?|шт\.?|штук|штуки|щепотк|щепоток|стакан|стак\.?|ломтик|ломтика|ломтиков|яйц(о|а|ом|ами)?|банк|банки|упаковк)(?=\s*$|[\s,;.)])/i;

export function parseExplicitHouseholdFromText(displayText: string): {
  amount: number;
  unitRaw: string;
  kind: HouseholdCandidateKind;
} | null {
  const d = (displayText ?? "").trim();
  if (!d) return null;
  const dash = d.indexOf("—");
  const tail = dash >= 0 ? d.slice(dash + 1).trim() : d;
  const m = tail.match(EXPLICIT_HOUSEHOLD);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const raw = m[2].trim().toLowerCase();
  let unitRaw = raw;
  let kind: HouseholdCandidateKind = "explicit_household";

  if (/^ст/.test(raw)) {
    unitRaw = "ст. л.";
    kind = "tablespoon";
  } else if (/^ч/.test(raw)) {
    unitRaw = "ч. л.";
    kind = "teaspoon";
  } else if (/^шт|^штук/.test(raw)) {
    unitRaw = "шт.";
    kind = "piece";
  } else if (/зубчик/.test(raw)) {
    unitRaw = "зубчик";
    kind = "clove";
  } else if (/щепотк/.test(raw)) {
    unitRaw = "щепотка";
    kind = "pinch";
  } else if (/стакан|стак/.test(raw)) {
    unitRaw = "стакан";
    kind = "cup";
  } else if (/ломтик/.test(raw)) {
    unitRaw = "ломтик";
    kind = "slice";
  } else if (/яйц/.test(raw)) {
    unitRaw = "шт.";
    kind = "egg";
  } else if (/банк|упаковк/.test(raw)) {
    unitRaw = raw.includes("банк") ? "банка" : "упаковка";
    kind = "jar_or_pack";
  }

  return { amount, unitRaw, kind };
}

function kindToGateKind(k: HouseholdCandidateKind): DualMeasurementCandidateKind {
  if (k === "tablespoon") return "tablespoon";
  if (k === "teaspoon") return "teaspoon";
  if (k === "clove") return "clove";
  if (k === "piece" || k === "egg") return "piece";
  if (k === "slice") return "slice";
  if (k === "pinch") return "pinch";
  if (k === "cup") return "cup";
  if (k === "jar_or_pack") return "jar_or_pack";
  return "other_explicit";
}

function verifyExplicitAgainstCanonical(
  amount: number,
  unitNorm: string,
  kind: HouseholdCandidateKind,
  ca: number,
  cu: "g" | "ml",
): { ok: boolean; reliability: HouseholdReliability } {
  const u = unitNorm.toLowerCase();
  if (u.includes("зубчик")) {
    if (cu !== "g") return { ok: false, reliability: "none" };
    return {
      ok: withinRel(amount * G_PER_CLOVE, ca, 0.45),
      reliability: "high",
    };
  }
  if (u.includes("ч. л.")) {
    if (cu === "g") return { ok: withinRel(amount * G_PER_TSP, ca, 0.5), reliability: "high" };
    if (cu === "ml") return { ok: withinRel(amount * ML_PER_TSP, ca, 0.45), reliability: "high" };
    return { ok: false, reliability: "none" };
  }
  if (u.includes("ст. л.")) {
    if (cu === "ml") return { ok: withinRel(amount * ML_PER_TBSP, ca, 0.4), reliability: "high" };
    if (cu === "g") {
      const okFat = withinRel(amount * G_PER_TBSP_FAT, ca, 0.42);
      const okGen = withinRel(amount * G_PER_TBSP_GENERIC, ca, 0.42);
      return { ok: okFat || okGen, reliability: "high" };
    }
    return { ok: false, reliability: "none" };
  }
  if (u.includes("щепотк")) {
    return { ok: ca <= 12 && cu === "g", reliability: "high" };
  }
  if (u.includes("стакан")) {
    if (cu === "ml") return { ok: withinRel(amount * 250, ca, 0.35), reliability: "medium" };
    return { ok: false, reliability: "none" };
  }
  if (u.includes("ломтик")) {
    if (cu !== "g") return { ok: false, reliability: "none" };
    return { ok: withinRel(amount * 25, ca, 0.55), reliability: "medium" };
  }
  if (u.includes("шт") || u.startsWith("шт")) {
    if (cu !== "g") return { ok: false, reliability: "none" };
    if (kind === "egg") return { ok: withinRel(amount * G_PER_EGG, ca, 0.35), reliability: "high" };
    for (const W of PIECE_WEIGHT_ANCHORS_G) {
      if (withinRel(amount * W, ca, 0.2)) return { ok: true, reliability: "high" };
    }
    return { ok: withinRel(amount * 100, ca, 0.45), reliability: "medium" };
  }
  if (kind === "jar_or_pack") {
    return { ok: true, reliability: "low" };
  }
  return { ok: false, reliability: "none" };
}

function explicitHouseholdMatchesParsed(
  displayText: string,
  da: number,
  kind: HouseholdCandidateKind,
): boolean {
  const p = parseExplicitHouseholdFromText(displayText);
  if (!p) return false;
  if (Math.abs(p.amount - da) > 0.051) return false;
  if (kind === "egg") {
    return p.kind === "egg" || p.kind === "piece";
  }
  if (kind === "piece") {
    return p.kind === "piece" || p.kind === "egg";
  }
  return p.kind === kind;
}

function inferKindFromPersistedDisplayUnit(
  displayUnit: string,
  combined: string,
): HouseholdCandidateKind | null {
  const du = displayUnit.trim().toLowerCase();
  if (du.includes("зубчик")) return "clove";
  if (du.includes("ст. л.")) return "tablespoon";
  if (du.includes("ч. л.")) return "teaspoon";
  if (/^шт|шт\./i.test(displayUnit.trim())) {
    return EGG_STEM.test(combined) ? "egg" : "piece";
  }
  if (du.includes("ломтик")) return "slice";
  if (du.includes("щепотк")) return "pinch";
  if (du.includes("стакан")) return "cup";
  if (du.includes("банк") || du.includes("упаковк")) return "jar_or_pack";
  return null;
}

function normalizeUnitForVerify(kind: HouseholdCandidateKind, displayUnit: string): string {
  const du = displayUnit.trim().toLowerCase();
  if (kind === "clove") return "зубчик";
  if (kind === "tablespoon") return "ст. л.";
  if (kind === "teaspoon") return "ч. л.";
  if (kind === "piece" || kind === "egg") return "шт.";
  if (kind === "slice" && du.includes("ломтик")) return displayUnit.trim();
  if (kind === "pinch") return "щепотка";
  if (kind === "cup") return "стакан";
  return displayUnit.trim();
}

/**
 * Проверка уже сохранённого dual перед записью/отображением: согласованность с canonical + quality gate.
 */
export function validatePersistedDualMeasurement(input: {
  name: string;
  display_text: string;
  display_amount: number;
  display_unit: string;
  canonical_amount: number;
  canonical_unit: string;
  category?: string | null;
}): boolean {
  const da = input.display_amount;
  const ca = input.canonical_amount;
  const cu = input.canonical_unit.trim().toLowerCase();
  if (!Number.isFinite(da) || da <= 0 || !Number.isFinite(ca) || ca <= 0) return false;
  if (cu !== "g" && cu !== "ml") return false;

  const combined = normalizeIngredientTextForCategoryMatch(input.name, input.display_text);
  const kind = inferKindFromPersistedDisplayUnit(input.display_unit, combined);
  if (kind == null) return false;

  const unitNorm = normalizeUnitForVerify(kind, input.display_unit);
  const { ok, reliability } = verifyExplicitAgainstCanonical(da, unitNorm, kind, ca, cu as "g" | "ml");
  if (!ok) return false;

  const explicitHousehold = explicitHouseholdMatchesParsed(input.display_text, da, kind);
  return passesDualMeasurementQualityGate({
    householdAmount: da,
    reliability,
    canonicalAmount: ca,
    canonicalUnit: cu as "g" | "ml",
    explicitHousehold,
    candidateKind: kindToGateKind(kind),
  });
}

/** Snap к ближайшей читаемой четверти в диапазоне. */
function snapToReadableQuarter(raw: number): number {
  const q = Math.round(raw * 4) / 4;
  if (q <= 0) return 0;
  return q;
}

function tryInferPieceFromGrams(ca: number): { n: number; reliability: HouseholdReliability } | null {
  let best: { n: number; err: number; W: number } | null = null;
  for (const W of PIECE_WEIGHT_ANCHORS_G) {
    const raw = ca / W;
    const n = snapToReadableQuarter(raw);
    if (!isHumanReadableHouseholdQuantity(n) || n <= 0) continue;
    const err = Math.abs(n * W - ca) / ca;
    if (err <= 0.16 && (!best || err < best.err)) best = { n, err, W };
  }
  if (!best) return null;
  const nInteger = Math.abs(best.n - Math.round(best.n)) < 1e-6;
  /** Дробный выведенный «шт» и крупные якоря без явного ввода — low (gate без explicit → dual выкл.). */
  let reliability: HouseholdReliability;
  if (!nInteger) reliability = "low";
  else if (best.W > 120) reliability = "low";
  else reliability = "medium";
  return { n: best.n, reliability };
}

function tryInferCloveFromGrams(ca: number, combined: string): { n: number } | null {
  if (!CLOVE_PRODUCT_STEM.test(combined)) return null;
  const n = Math.max(1, Math.round(ca / G_PER_CLOVE));
  if (!withinRel(n * G_PER_CLOVE, ca, 0.45)) return null;
  if (!isHumanReadableHouseholdQuantity(n)) return null;
  return { n };
}

function tryInferTspFromGrams(ca: number, category: string): { n: number } | null {
  if (category !== "spices") return null;
  const n = snapToReadableQuarter(ca / G_PER_TSP);
  if (!isHumanReadableHouseholdQuantity(n) || n <= 0) return null;
  if (!withinRel(n * G_PER_TSP, ca, 0.52)) return null;
  return { n };
}

function tryInferTbspFromGrams(ca: number, category: string): { n: number } | null {
  if (category !== "fats") return null;
  for (const gPer of [G_PER_TBSP_FAT, G_PER_TBSP_GENERIC]) {
    const n = snapToReadableQuarter(ca / gPer);
    if (!isHumanReadableHouseholdQuantity(n) || n <= 0) continue;
    if (withinRel(n * gPer, ca, 0.42)) return { n };
  }
  return null;
}

function tryInferEggFromGrams(ca: number, combined: string): { n: number } | null {
  if (!EGG_STEM.test(combined)) return null;
  const n = snapToReadableQuarter(ca / G_PER_EGG);
  if (!isHumanReadableHouseholdQuantity(n) || n <= 0) return null;
  if (!withinRel(n * G_PER_EGG, ca, 0.38)) return null;
  return { n };
}

export type IngredientProbeInput = {
  name: string;
  display_text: string;
  canonical_amount: number;
  canonical_unit: string;
  category?: string | null;
};

/**
 * Полный разбор кандидата на dual (save-time). Приоритет: явный текст → инференс по классу меры.
 */
export function resolveHouseholdCandidateForSave(input: IngredientProbeInput): ResolvedHouseholdCandidate | null {
  const name = (input.name ?? "").trim();
  const displayTextIn = (input.display_text ?? "").trim();
  const ca = Number(input.canonical_amount);
  const cu = (input.canonical_unit ?? "").trim().toLowerCase();
  if (!name || !Number.isFinite(ca) || ca <= 0 || (cu !== "g" && cu !== "ml")) return null;

  const category = resolveCategory(name, displayTextIn, input.category);
  const combined = normalizeIngredientTextForCategoryMatch(name, displayTextIn);
  const blockInfer = shouldBlockHouseholdInferenceFromGrams(name, displayTextIn, category);

  const explicit = parseExplicitHouseholdFromText(displayTextIn);
  if (explicit) {
    const unitNorm = explicit.kind === "clove" ? "зубчик" : explicit.unitRaw;
    const { ok, reliability } = verifyExplicitAgainstCanonical(
      explicit.amount,
      unitNorm,
      explicit.kind,
      ca,
      cu as "g" | "ml",
    );
    if (!ok) return null;
    const gate = passesDualMeasurementQualityGate({
      householdAmount: explicit.amount,
      reliability,
      canonicalAmount: ca,
      canonicalUnit: cu as "g" | "ml",
      explicitHousehold: true,
      candidateKind: kindToGateKind(explicit.kind),
    });
    if (!gate) return null;
    return {
      kind: explicit.kind,
      displayAmount: explicit.amount,
      displayUnit: unitNorm,
      displayQuantityText: null,
      reliability,
      explicitHousehold: true,
    };
  }

  if (blockInfer) return null;

  if (cu === "g") {
    const clove = tryInferCloveFromGrams(ca, combined);
    if (clove) {
      const gate = passesDualMeasurementQualityGate({
        householdAmount: clove.n,
        reliability: "high",
        canonicalAmount: ca,
        canonicalUnit: "g",
        explicitHousehold: false,
        candidateKind: "clove",
      });
      if (gate) {
        return {
          kind: "clove",
          displayAmount: clove.n,
          displayUnit: "зубчик",
          displayQuantityText: null,
          reliability: "high",
          explicitHousehold: false,
        };
      }
    }

    const egg = tryInferEggFromGrams(ca, combined);
    if (egg) {
      const gate = passesDualMeasurementQualityGate({
        householdAmount: egg.n,
        reliability: "medium",
        canonicalAmount: ca,
        canonicalUnit: "g",
        explicitHousehold: false,
        candidateKind: "piece",
      });
      if (gate) {
        return {
          kind: "egg",
          displayAmount: egg.n,
          displayUnit: "шт.",
          displayQuantityText: null,
          reliability: "medium",
          explicitHousehold: false,
        };
      }
    }

    const tsp = tryInferTspFromGrams(ca, category);
    if (tsp) {
      const gate = passesDualMeasurementQualityGate({
        householdAmount: tsp.n,
        reliability: "medium",
        canonicalAmount: ca,
        canonicalUnit: "g",
        explicitHousehold: false,
        candidateKind: "teaspoon",
      });
      if (gate) {
        return {
          kind: "teaspoon",
          displayAmount: tsp.n,
          displayUnit: "ч. л.",
          displayQuantityText: null,
          reliability: "medium",
          explicitHousehold: false,
        };
      }
    }

    const tbsp = tryInferTbspFromGrams(ca, category);
    if (tbsp) {
      const gate = passesDualMeasurementQualityGate({
        householdAmount: tbsp.n,
        reliability: "medium",
        canonicalAmount: ca,
        canonicalUnit: "g",
        explicitHousehold: false,
        candidateKind: "tablespoon",
      });
      if (gate) {
        return {
          kind: "tablespoon",
          displayAmount: tbsp.n,
          displayUnit: "ст. л.",
          displayQuantityText: null,
          reliability: "medium",
          explicitHousehold: false,
        };
      }
    }

    if (category === "vegetables" || category === "fruits") {
      const piece = tryInferPieceFromGrams(ca);
      if (piece) {
        const gate = passesDualMeasurementQualityGate({
          householdAmount: piece.n,
          reliability: piece.reliability,
          canonicalAmount: ca,
          canonicalUnit: "g",
          explicitHousehold: false,
          candidateKind: "piece",
        });
        if (gate) {
          return {
            kind: "piece",
            displayAmount: piece.n,
            displayUnit: "шт.",
            displayQuantityText: null,
            reliability: piece.reliability,
            explicitHousehold: false,
          };
        }
      }
    }
  }

  if (cu === "ml") {
    const tbspMl = snapToReadableQuarter(ca / ML_PER_TBSP);
    if (
      category === "fats" &&
      isHumanReadableHouseholdQuantity(tbspMl) &&
      withinRel(tbspMl * ML_PER_TBSP, ca, 0.42)
    ) {
      const gate = passesDualMeasurementQualityGate({
        householdAmount: tbspMl,
        reliability: "medium",
        canonicalAmount: ca,
        canonicalUnit: "ml",
        explicitHousehold: false,
        candidateKind: "tablespoon",
      });
      if (gate) {
        return {
          kind: "tablespoon",
          displayAmount: tbspMl,
          displayUnit: "ст. л.",
          displayQuantityText: null,
          reliability: "medium",
          explicitHousehold: false,
        };
      }
    }
  }

  return null;
}

/**
 * Есть ли осмысленный dual-кандидат, проходящий quality gate (для probe / feature-флагов).
 */
export function shouldUseDualMeasurement(input: IngredientProbeInput): boolean {
  return resolveHouseholdCandidateForSave(input) != null;
}
