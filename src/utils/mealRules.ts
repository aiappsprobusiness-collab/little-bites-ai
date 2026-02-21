/**
 * Client-side meal rules: canonical classification by content (mirrors Edge _shared/mealRules.ts).
 */

export function normalizeTextRu(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SOUP_KEYWORDS = [
  "суп", "суп-пюре", "крем-суп", "бульон", "щи", "борщ", "уха", "рассольник", "солянка",
];

export function isSoupText(text: string | null | undefined): boolean {
  const t = normalizeTextRu(text ?? "");
  if (!t) return false;
  return SOUP_KEYWORDS.some((kw) => t.includes(normalizeTextRu(kw)));
}

const BREAKFAST_MARKERS = ["каша", "омлет", "сырник", "олад", "запеканк", "тост", "яичн"];
const SNACK_MARKERS = ["перекус", "пюре", "смузи", "йогурт", "печень", "фрукт", "ягод"];

export type CanonicalMealType = "lunch" | "dinner" | "breakfast" | "snack";

/**
 * Classify meal type by content only (soup -> lunch; breakfast/snack markers; else dinner).
 */
export function classifyCanonicalMealType(text: string | null | undefined): CanonicalMealType {
  const t = normalizeTextRu(text ?? "");
  if (!t) return "dinner";
  if (isSoupText(t)) return "lunch";
  if (BREAKFAST_MARKERS.some((m) => t.includes(m))) return "breakfast";
  if (SNACK_MARKERS.some((m) => t.includes(m))) return "snack";
  return "dinner";
}
