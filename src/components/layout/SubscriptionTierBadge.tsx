import { cn } from "@/lib/utils";

export type SubscriptionTierBadgeStatus = "premium" | "trial" | "free" | string;

export interface SubscriptionTierBadgeProps {
  subscriptionStatus: SubscriptionTierBadgeStatus;
  label: string;
  className?: string;
}

/** Бейдж Premium / Триал / Free — тот же стиль, что на вкладке План. */
export function SubscriptionTierBadge({ subscriptionStatus, label, className }: SubscriptionTierBadgeProps) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium px-2 py-0.5 rounded-full tabular-nums shrink-0",
        subscriptionStatus === "premium" && "bg-primary/10 text-primary",
        subscriptionStatus === "trial" && "bg-amber-500/12 text-amber-900/85",
        subscriptionStatus !== "premium" && subscriptionStatus !== "trial" && "bg-muted/70 text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
