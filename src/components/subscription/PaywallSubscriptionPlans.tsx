import {
  SUBSCRIPTION_PRICES,
  YEARLY_BADGE_WHEN_NOT_SELECTED,
  YEARLY_PER_MONTH,
  YEARLY_SAVINGS_COPY,
} from "@/utils/subscriptionPricing";
import { cn } from "@/lib/utils";

export type PaywallPlanOption = "month" | "year";

interface PaywallSubscriptionPlansProps {
  value: PaywallPlanOption;
  onChange: (plan: PaywallPlanOption) => void;
  /** `comfortable` — как в UnifiedPaywall; `compact` — чуть плотнее для Legacy. */
  density?: "comfortable" | "compact";
}

export function PaywallSubscriptionPlans({
  value,
  onChange,
  density = "comfortable",
}: PaywallSubscriptionPlansProps) {
  const yearSelected = value === "year";
  const monthSelected = value === "month";
  const pad = density === "compact" ? "p-2.5" : "p-3";

  return (
    <div className={cn("space-y-2", density === "compact" ? "" : "space-y-2.5")}>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "w-full text-left rounded-xl border-2 transition-colors",
          pad,
          yearSelected
            ? "border-primary bg-primary-pill-surface shadow-sm shadow-primary/20"
            : "border-border/50 bg-muted/20 hover:bg-muted/35"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold text-foreground tracking-tight">Годовая подписка</p>
            <p className="text-base font-bold text-foreground leading-tight">
              {SUBSCRIPTION_PRICES.yearly.toLocaleString("ru-RU")} ₽ / год
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              ≈{YEARLY_PER_MONTH.toLocaleString("ru-RU")} ₽ / месяц
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">{YEARLY_SAVINGS_COPY}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full text-[10px] font-semibold px-2 py-0.5 text-right leading-tight",
              yearSelected
                ? "bg-primary text-primary-foreground"
                : "bg-primary/12 text-primary"
            )}
          >
            {yearSelected ? "Лучшее предложение" : YEARLY_BADGE_WHEN_NOT_SELECTED}
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "w-full text-left rounded-xl border transition-colors",
          pad,
          monthSelected
            ? "border-primary bg-primary-pill-surface/70 shadow-sm shadow-primary/10"
            : "border-border/50 bg-muted/20 hover:bg-muted/35"
        )}
      >
        <p className="text-xs font-medium text-foreground">Месячная подписка</p>
        <p className="text-sm font-semibold text-foreground mt-1 leading-tight">
          {SUBSCRIPTION_PRICES.monthly.toLocaleString("ru-RU")} ₽ / месяц
        </p>
      </button>
    </div>
  );
}
