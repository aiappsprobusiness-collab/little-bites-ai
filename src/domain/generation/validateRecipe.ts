import type { GenerationContext } from "./types";
import { buildBlockedTokens, containsAnyToken } from "@/utils/allergenTokens";

/** Words that indicate vegetarian preference → ban meat/fish in recipe text. */
const VEGETARIAN_BANNED = [
  "мясо", "мяса", "мясом", "куриц", "курин", "индейк", "говядин", "свинин", "баранин",
  "рыб", "лосос", "треск", "сельд", "морепродукт", "креветк", "кальмар", "фарш мясн", "фарш",
  "колбас", "сосиск", "ветчин",
];

export function validateRecipe(
  recipe: unknown,
  ctx: GenerationContext
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!recipe || typeof recipe !== "object") {
    errors.push("Invalid recipe format");
    return { ok: false, errors };
  }

  const rec = recipe as Record<string, unknown>;
  const text = JSON.stringify(recipe).toLowerCase();

  const profiles =
    ctx.mode === "family" && ctx.targets?.length
      ? ctx.targets
      : ctx.target
        ? [ctx.target]
        : [];

  for (const p of profiles) {
    const blockedTokens = buildBlockedTokens(p.allergies ?? []);
    if (blockedTokens.length > 0 && containsAnyToken(text, blockedTokens).hit) {
      const allergyList = (p.allergies ?? []).filter(Boolean).join(", ");
      if (allergyList) errors.push(`Allergy violation: ${allergyList}`);
    }

    for (const d of p.dislikes || []) {
      const token = String(d).toLowerCase().trim();
      if (token.length >= 2 && text.includes(token)) {
        errors.push(`Dislike violation: ${d}`);
      }
    }
    for (const pref of p.preferences || []) {
      const lowered = String(pref).toLowerCase().trim();
      if (lowered.includes("вегетариан") || lowered.includes("vegetarian")) {
        const hasBanned = VEGETARIAN_BANNED.some((b) => text.includes(b));
        if (hasBanned) {
          errors.push(`Preference violation: ${pref}`);
        }
        continue;
      }
      if (lowered.includes("не") || lowered.includes("без")) {
        const banned = lowered.replace(/не|без/gi, "").trim();
        if (banned.length > 1 && text.includes(banned)) {
          errors.push(`Preference violation: ${pref}`);
        }
      }
    }
  }

  const hasTitle =
    typeof rec.title === "string" && rec.title.trim().length > 0;
  const hasIngredients = Array.isArray(rec.ingredients) && rec.ingredients.length > 0;
  const hasSteps = Array.isArray(rec.steps) && rec.steps.length > 0;

  if (!hasTitle || !hasIngredients || !hasSteps) {
    errors.push("Invalid recipe format");
  }

  return { ok: errors.length === 0, errors };
}
