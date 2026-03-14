/**
 * Rule-based "primary base" of a dish for weekly diversity control.
 * Used to cap / penalize overuse of the same base (e.g. cottage cheese, oatmeal) in a week.
 */

export type PrimaryBaseKey =
  | "cottage_cheese"
  | "oatmeal"
  | "yogurt_kefir"
  | "eggs"
  | "chicken"
  | "turkey"
  | "fish"
  | "buckwheat"
  | "rice"
  | "pasta"
  | "potato"
  | "cheese"
  | "tofu"
  | "chickpea"
  | "beans"
  | "other";

/** Tokens (substrings) → base key. Order matters: first match wins. Prefer more specific before generic. */
const BASE_TOKENS: { tokens: string[]; key: PrimaryBaseKey }[] = [
  { tokens: ["творог", "творож", "cottage cheese", "curd"], key: "cottage_cheese" },
  { tokens: ["овсян", "овсяные хлопья", "oatmeal", "oat "], key: "oatmeal" },
  { tokens: ["йогурт", "кефир", "ряженк", "yogurt", "kefir"], key: "yogurt_kefir" },
  { tokens: ["яйц", "яичн", "egg", "eggs"], key: "eggs" },
  { tokens: ["кур", "куриц", "chicken"], key: "chicken" },
  { tokens: ["индейк", "turkey"], key: "turkey" },
  { tokens: ["рыб", "лосос", "треск", "fish", "salmon", "cod"], key: "fish" },
  { tokens: ["гречн", "buckwheat"], key: "buckwheat" },
  { tokens: ["рис", " rice"], key: "rice" },
  { tokens: ["макарон", "паста", "pasta", "noodle"], key: "pasta" },
  { tokens: ["картош", "картофел", "potato"], key: "potato" },
  { tokens: ["сыр", "cheese"], key: "cheese" },
  { tokens: ["тофу", "tofu"], key: "tofu" },
  { tokens: ["нут", "chickpea"], key: "chickpea" },
  { tokens: ["фасол", "боб", "bean", "beans"], key: "beans" },
];

export function inferPrimaryBase(recipe: {
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
}): PrimaryBaseKey {
  const parts = [
    recipe.title ?? "",
    recipe.description ?? "",
    (recipe.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" "),
  ];
  const text = parts.join(" ").toLowerCase().replace(/\s+/g, " ");
  if (!text.trim()) return "other";
  for (const { tokens, key } of BASE_TOKENS) {
    if (tokens.some((t) => text.includes(t))) return key;
  }
  return "other";
}
