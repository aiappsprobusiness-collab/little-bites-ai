import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildVkPreviewDayPlan } from "../vk-preview-plan/orchestrate.ts";
import type { DayPlan } from "../vk-preview-plan/types.ts";
import type { TelegramSession } from "./types.ts";

export type PreviewProvider = (session: TelegramSession) => Promise<DayPlan>;

export function createPreviewProvider(supabase: SupabaseClient): PreviewProvider {
  return async (session) => {
    if (!session.age_months) {
      throw new Error("missing_age_months");
    }
    return await buildVkPreviewDayPlan(supabase, {
      age_months: session.age_months,
      allergies: session.allergies,
      likes: session.likes,
      dislikes: session.dislikes,
      entry_point: "telegram",
      utm: session.utm,
    });
  };
}
