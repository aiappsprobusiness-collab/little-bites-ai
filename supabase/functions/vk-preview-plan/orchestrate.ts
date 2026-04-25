import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { DayPlan, MealSlot, MemberDataPool, VkPreviewMeal, VkPreviewPlanRequest } from "./types.ts";
import { fetchVkPreviewPool, pickDbSlots } from "./slotDb.ts";
import { fetchAiMealsForSlots, fillMissingWithMock } from "./aiSlots.ts";

const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function mergePreferDb(
  db: Partial<Record<MealSlot, VkPreviewMeal>>,
  extra: Partial<Record<MealSlot, VkPreviewMeal>>,
): Partial<Record<MealSlot, VkPreviewMeal>> {
  const out: Partial<Record<MealSlot, VkPreviewMeal>> = { ...db };
  for (const s of SLOT_ORDER) {
    if (!out[s] && extra[s]) out[s] = extra[s]!;
  }
  return out;
}

function resolveFallbackSource(flags: { db: boolean; ai: boolean; mock: boolean }): DayPlan["meta"]["fallback_source"] {
  const { db, ai, mock } = flags;
  if (mock && !db && !ai) return "mock";
  if (ai && !db) return "ai";
  if (db && !ai && !mock) return "db";
  return "db+ai";
}

export async function buildVkPreviewDayPlan(
  supabase: SupabaseClient,
  body: VkPreviewPlanRequest,
): Promise<DayPlan> {
  const t0 = Date.now();
  const memberData: MemberDataPool = {
    age_months: body.age_months,
    allergies: body.allergies,
    likes: body.likes,
    dislikes: body.dislikes,
    type: "child",
  };

  const infantCore = body.age_months < 12;
  const pool = await fetchVkPreviewPool(supabase, { infantSeedCoreOnly: infantCore });
  const { meals: dbMeals, filledCount } = pickDbSlots(pool, memberData);

  const usedDb = filledCount > 0;
  let usedAi = false;
  let usedMock = false;

  let merged: Partial<Record<MealSlot, VkPreviewMeal>> = { ...dbMeals };
  const missingAfterDb = SLOT_ORDER.filter((s) => !merged[s]);

  if (filledCount < 3 && missingAfterDb.length > 0) {
    const aiPart = await fetchAiMealsForSlots(missingAfterDb, memberData);
    if (aiPart) {
      for (const s of missingAfterDb) {
        if (aiPart[s]) usedAi = true;
      }
      merged = mergePreferDb(merged, aiPart);
    }
  }

  let stillMissing = SLOT_ORDER.filter((s) => !merged[s]);
  if (stillMissing.length > 0) {
    merged = fillMissingWithMock(stillMissing, merged);
    usedMock = true;
  }

  stillMissing = SLOT_ORDER.filter((s) => !merged[s]);
  if (stillMissing.length > 0) {
    merged = fillMissingWithMock(stillMissing, merged);
    usedMock = true;
  }

  const meals: VkPreviewMeal[] = [];
  for (const s of SLOT_ORDER) {
    const m = merged[s];
    if (m) meals.push(m);
  }

  const missing_slots = SLOT_ORDER.filter((s) => !dbMeals[s]);
  const fallback_source = resolveFallbackSource({ db: usedDb, ai: usedAi, mock: usedMock });

  return {
    meals,
    meta: {
      fallback_source,
      duration_ms: Date.now() - t0,
      ...(missing_slots.length ? { missing_slots } : {}),
    },
  };
}
