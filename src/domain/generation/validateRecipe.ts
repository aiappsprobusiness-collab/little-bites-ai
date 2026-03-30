import type { GenerationContext } from "./types";
import { buildBlockedTokens, containsAnyToken, containsAnyTokenForAllergy } from "@/utils/allergenTokens";

/** Words that indicate vegetarian preference → ban meat/fish in recipe text. */
const VEGETARIAN_BANNED = [
  "мясо", "мяса", "мясом", "куриц", "курин", "индейк", "говядин", "свинин", "баранин",
  "рыб", "лосос", "треск", "сельд", "морепродукт", "креветк", "кальмар", "фарш мясн", "фарш",
  "колбас", "сосиск", "ветчин",
];

/**
 * Текст для аллергий: title + description + ингредиенты (name, display_text) — в унисон с планом / post-check чата (подстрока по токенам).
 */
function getRecipeTextForAllergyCheck(recipe: Record<string, unknown>): string {
  const parts: string[] = [];
  const title = typeof recipe.title === "string" ? recipe.title : "";
  if (title.trim()) parts.push(title.trim());
  const desc = typeof recipe.description === "string" ? recipe.description : "";
  if (desc.trim()) parts.push(desc.trim());
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  for (const ing of ings) {
    if (typeof ing === "string" && ing.trim()) {
      parts.push(ing.trim());
    } else if (ing && typeof ing === "object") {
      const o = ing as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const dt =
        typeof o.display_text === "string"
          ? o.display_text.trim()
          : typeof o.displayText === "string"
            ? o.displayText.trim()
            : "";
      if (name) parts.push(name);
      if (dt) parts.push(dt);
    }
  }
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ");
}

/** Dislikes: без description (меньше ложных срабатываний). */
function getRecipeTextForDislikeCheck(recipe: Record<string, unknown>): string {
  const parts: string[] = [];
  const title = typeof recipe.title === "string" ? recipe.title : "";
  if (title.trim()) parts.push(title.trim());
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  for (const ing of ings) {
    if (typeof ing === "string" && ing.trim()) {
      parts.push(ing.trim());
    } else if (ing && typeof ing === "object" && "name" in ing && typeof (ing as { name: unknown }).name === "string") {
      const name = (ing as { name: string }).name.trim();
      if (name) parts.push(name);
    }
  }
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ");
}

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
  const allergyText = getRecipeTextForAllergyCheck(rec);
  const dislikeText = getRecipeTextForDislikeCheck(rec);

  const profiles =
    ctx.mode === "family" && ctx.targets?.length
      ? ctx.targets
      : ctx.target
        ? [ctx.target]
        : [];

  for (const p of profiles) {
    const blockedTokens = buildBlockedTokens(p.allergies ?? []);
    if (blockedTokens.length > 0 && containsAnyTokenForAllergy(allergyText, blockedTokens).hit) {
      const allergyList = (p.allergies ?? []).filter(Boolean).join(", ");
      if (allergyList) errors.push(`Allergy violation: ${allergyList}`);
    }

    for (const d of p.dislikes || []) {
      const tokens = buildBlockedTokens([d]);
      if (tokens.length > 0 && containsAnyToken(dislikeText, tokens).hit) {
        errors.push(`Dislike violation: ${d}`);
      }
    }

    for (const pref of p.preferences || []) {
      const lowered = String(pref).toLowerCase().trim();
      if (lowered.includes("вегетариан") || lowered.includes("vegetarian")) {
        const hasBanned = VEGETARIAN_BANNED.some((b) => allergyText.includes(b));
        if (hasBanned) {
          errors.push(`Preference violation: ${pref}`);
        }
        continue;
      }
      if (lowered.includes("не") || lowered.includes("без")) {
        const banned = lowered.replace(/не|без/gi, "").trim();
        if (banned.length > 1 && allergyText.includes(banned)) {
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

  if (errors.length > 0 && typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn("[validateRecipe] Recipe rejected:", errors.join("; "));
  }
  return { ok: errors.length === 0, errors };
}
