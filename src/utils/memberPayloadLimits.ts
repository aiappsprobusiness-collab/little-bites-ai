import { getSubscriptionLimits, isPaid, type SubscriptionTier } from "@/utils/subscriptionRules";
import type { AllergyItemRow } from "@/integrations/supabase/types-v2";

/**
 * Обрезка массивов профиля под лимиты тарифа перед insert/update в БД.
 */
export function clampMemberPayloadForTier(
  payload: Record<string, unknown>,
  tier: SubscriptionTier
): void {
  const lim = getSubscriptionLimits(tier);
  const allergies = Array.isArray(payload.allergies) ? (payload.allergies as string[]) : [];
  payload.allergies = allergies.slice(0, lim.maxAllergiesPerProfile);

  if (Array.isArray(payload.allergy_items) && (payload.allergy_items as unknown[]).length > 0) {
    const items = payload.allergy_items as AllergyItemRow[];
    payload.allergy_items = items.slice(0, lim.maxAllergiesPerProfile);
  }

  if (!isPaid(tier)) {
    payload.likes = [];
    payload.dislikes = [];
    return;
  }

  const likes = Array.isArray(payload.likes) ? (payload.likes as string[]) : [];
  const dislikes = Array.isArray(payload.dislikes) ? (payload.dislikes as string[]) : [];
  payload.likes = likes.slice(0, lim.maxLikesTagsPerProfile);
  payload.dislikes = dislikes.slice(0, lim.maxDislikesTagsPerProfile);
}
