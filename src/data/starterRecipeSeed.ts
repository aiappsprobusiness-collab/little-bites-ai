/**
 * Seeding starter recipes into DB. Uses deterministic UUID v5 from (userId + starterId)
 * so each user gets their own copy, and the same starterId always maps to the same UUID.
 * All DB writes go through RPC ensure_starter_recipes_seeded — no direct recipe_ingredients/recipe_steps requests from client.
 */
import { v5 as uuidv5, validate as uuidValidate } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { safeLog } from "@/utils/safeLogger";
import { STARTER_RECIPES } from "./starterRecipes";

const STARTER_RECIPE_NS = "3d9f4d6a-3a6c-4e3b-9f5d-8c5f3b2a1d11";

/** In-flight seed promise per userId — strictly one-flight: max one concurrent seed per user. */
const inflightByUserId = new Map<string, Promise<void>>();

/** Once seeded successfully for userId — no RPC calls for rest of session. */
const seededOnceByUserId = new Set<string>();

/**
 * Returns deterministic UUID v5 for a starter recipe. Same (userId, starterId) → same UUID.
 */
export function toStarterRecipeDbId(userId: string, starterId: string): string {
  const id = uuidv5(`${userId}:${starterId}`, STARTER_RECIPE_NS);
  if (!uuidValidate(id)) {
    console.error("toStarterRecipeDbId: invalid UUID generated", { userId, starterId, id });
  }
  return id;
}

/**
 * Ensures all starter recipes exist in DB for the user. Idempotent — safe to call multiple times.
 * Strictly one-flight: for each userId, seed runs at most once at a time.
 * Uses RPC only — no direct recipe_ingredients/recipe_steps requests.
 */
export async function ensureStarterRecipesSeeded(userId: string): Promise<void> {
  if (!userId) return;
  if (seededOnceByUserId.has(userId)) return;

  const existing = inflightByUserId.get(userId);
  if (existing) {
    safeLog("starter seed skipped (inflight) for userId", userId);
    return existing;
  }

  const task = (async () => {
    safeLog("starter seed started for userId", userId);
    try {
      const payload = STARTER_RECIPES.map((r) => ({
        id: toStarterRecipeDbId(userId, r.id),
        user_id: userId,
        title: r.title,
        description: r.description ?? null,
        cooking_time_minutes: r.cooking_time_minutes ?? null,
        ingredients: r.ingredients.map((ing) => ({ name: ing.name, order_index: ing.order_index })),
        steps: r.steps.map((s) => ({ instruction: s.instruction, step_number: s.step_number })),
      }));

      const { error } = await supabase.rpc("ensure_starter_recipes_seeded", { p_recipes: payload });
      if (error) {
        safeLog("starter seed RPC error:", error.message);
      } else {
        seededOnceByUserId.add(userId);
      }
    } finally {
      safeLog("starter seed finished for userId", userId);
      inflightByUserId.delete(userId);
    }
  })();

  inflightByUserId.set(userId, task);
  return task;
}
