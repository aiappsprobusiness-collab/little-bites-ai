export type { Family, GenerationContext, Profile } from "./types";
export { buildGenerationContext } from "./buildGenerationContext";
export { buildPrompt } from "./buildPrompt";
export { validateRecipe } from "./validateRecipe";

import type { GenerationContext } from "./types";
import { validateRecipe } from "./validateRecipe";

const FAILED_AFTER_ATTEMPTS = "Failed to generate valid recipe after 3 attempts";

/**
 * Production pipeline: generate → validate → retry up to 3 times.
 * Caller provides the actual AI call (e.g. chat + parse).
 */
export async function generateRecipeWithValidation<T = unknown>(
  ctx: GenerationContext,
  generateFromAI: (ctx: GenerationContext) => Promise<T | null>
): Promise<T> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const recipe = await generateFromAI(ctx);
    if (recipe == null) {
      attempts++;
      continue;
    }

    const validation = validateRecipe(recipe as unknown, ctx);
    if (validation.ok) {
      return recipe;
    }

    attempts++;
  }

  throw new Error(FAILED_AFTER_ATTEMPTS);
}
