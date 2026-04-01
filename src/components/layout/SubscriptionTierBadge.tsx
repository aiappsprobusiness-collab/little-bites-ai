import { Crown } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ProfileStatusV2 } from "@/integrations/supabase/types-v2";
import {
  normalizeSubscriptionTier,
  SUBSCRIPTION_TIER_LABELS,
  subscriptionTierChipClassNames,
} from "@/utils/subscriptionTierDisplay";

export type SubscriptionTierBadgeStatus = ProfileStatusV2 | string;

export interface SubscriptionTierBadgeProps {
  subscriptionStatus: SubscriptionTierBadgeStatus;
  /** Редкий override; по умолчанию подпись из `SUBSCRIPTION_TIER_LABELS` по статусу. */
  label?: string;
  /** Открыть paywall / экран подписки (глобальный стор или навигация — задаёт родитель). */
  onClick?: () => void;
  className?: string;
}

/**
 * Чипса тарифа в хедере (План / Чат): Free, Пробный, Premium — один стиль, без хардкода подписей в страницах.
 */
export function SubscriptionTierBadge({ subscriptionStatus, label, onClick, className }: SubscriptionTierBadgeProps) {
  const tier = normalizeSubscriptionTier(String(subscriptionStatus));
  const text = label ?? SUBSCRIPTION_TIER_LABELS[tier];
  const chipClass = cn(subscriptionTierChipClassNames(tier), "tabular-nums", className);

  const content = (
    <>
      {text}
      {tier === "premium" && <Crown className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />}
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className={cn(
          chipClass,
          "cursor-pointer touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        aria-label={`Подписка: ${text}. Открыть экран подписки`}
      >
        {content}
      </motion.button>
    );
  }

  return <span className={chipClass}>{content}</span>;
}
