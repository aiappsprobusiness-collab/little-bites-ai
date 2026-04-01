import type { ProfileStatusV2 } from "@/integrations/supabase/types-v2";
import { cn } from "@/lib/utils";

/** Короткие подписи тарифа в UI (хедер, профиль). Источник текста — только отсюда + опциональный override в пропе. */
export const SUBSCRIPTION_TIER_LABELS: Record<ProfileStatusV2, string> = {
  free: "Free",
  trial: "Пробный",
  premium: "Premium",
};

export function normalizeSubscriptionTier(raw: string): ProfileStatusV2 {
  if (raw === "premium" || raw === "trial" || raw === "free") return raw;
  return "free";
}

/** Единый pill-стиль чипсы тарифа (Free / Пробный / Premium). */
export function subscriptionTierChipClassNames(tier: ProfileStatusV2): string {
  return cn(
    "inline-flex items-center justify-center gap-1 rounded-full text-[10px] font-medium px-2.5 py-1 shrink-0 border",
    tier === "free" && "bg-muted/60 text-muted-foreground border-border/70",
    tier === "trial" &&
      "bg-amber-100/95 text-amber-950 border-amber-200/80 dark:bg-amber-950/45 dark:text-amber-50 dark:border-amber-800/55",
    tier === "premium" && "bg-primary/10 text-primary border-primary/25",
  );
}
