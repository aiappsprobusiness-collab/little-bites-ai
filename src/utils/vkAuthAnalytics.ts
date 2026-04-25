import { trackUsageEvent } from "@/utils/usageEvents";
import { getAnalyticsPlatform } from "@/utils/analyticsPlatform";
import { readVkDraftRaw } from "@/utils/vkDraft";

const trackedKey = (sid: string) => `lb.vk_auth_success_tracked.${sid}`;

/**
 * Один раз на vk_session_id после успешной аутентификации при наличии валидного VK-черновика.
 */
export function trackVkAuthSuccessOnce(): void {
  const draft = readVkDraftRaw();
  if (!draft || draft.handoff_consumed) return;
  if (typeof sessionStorage === "undefined") return;
  const k = trackedKey(draft.vk_session_id);
  if (sessionStorage.getItem(k)) return;
  sessionStorage.setItem(k, "1");
  const draft_age_ms = Date.now() - draft.created_at;
  trackUsageEvent("vk_auth_success", {
    properties: {
      entry_point: "vk",
      platform: getAnalyticsPlatform(),
      vk_session_id: draft.vk_session_id,
      has_preview: Boolean(draft.dayPlanPreview?.meals?.length),
      draft_age_ms,
    },
  });
}
