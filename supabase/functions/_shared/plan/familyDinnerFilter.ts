/**
 * Family-mode dinner filter: exclude steak/hard textures for toddler safety.
 * Prefer toddler-friendly techniques (рагу, тушение, тефтели, котлеты, запеканка).
 */

const FAMILY_DINNER_EXCLUDE = [
  "стейк",
  "бифштекс",
  "ростбиф",
  "medium",
  "rare",
  "шашлык",
];

const FAMILY_DINNER_PREFER = [
  "туш",
  "рагу",
  "котлет",
  "тефтел",
  "суфле",
  "запеканк",
  "гуляш",
];

function textToSearch(recipe: { title?: string | null; description?: string | null; tags?: string[] | null }): string {
  const title = (recipe.title ?? "").toLowerCase();
  const desc = (recipe.description ?? "").toLowerCase();
  const tags = (recipe.tags ?? []).map((t) => String(t).toLowerCase()).join(" ");
  return [title, desc, tags].join(" ");
}

/**
 * Returns false if recipe is not suitable as family dinner (e.g. steak, rare meat).
 */
export function isFamilyDinnerCandidate(recipe: {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
}): boolean {
  const text = textToSearch(recipe);
  return !FAMILY_DINNER_EXCLUDE.some((tok) => text.includes(tok));
}

/**
 * Higher score = more toddler-friendly. Used to prefer recipes when filtering.
 */
export function scoreFamilyDinnerCandidate(recipe: {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
}): number {
  const text = textToSearch(recipe);
  if (!isFamilyDinnerCandidate(recipe)) return -1;
  let score = 0;
  for (const tok of FAMILY_DINNER_PREFER) {
    if (text.includes(tok)) score += 1;
  }
  return score;
}
