import { useMemo } from "react";
import { Lock, Heart, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import pricing from "../../../supabase/functions/create-payment/pricing.json";
import { getPaywallReasonCopy } from "@/utils/paywallReasonCopy";

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: "🍳",
  lunch: "🍲",
  snack: "🍓",
  dinner: "🥘",
};

export interface PreviewMeal {
  meal_type: string;
  label: string;
  title: string;
}

interface WeekPreviewPaywallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewDayLabel: string;
  previewMeals: PreviewMeal[];
}

export function WeekPreviewPaywallSheet({
  open,
  onOpenChange,
  previewDayLabel,
  previewMeals,
}: WeekPreviewPaywallSheetProps) {
  const { toast } = useToast();
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const {
    startTrial,
    isStartingTrial,
    startPayment,
    isStartingPayment,
    hasAccess,
    hasTrialAccess,
    trialUsed,
  } = useSubscription();

  const trialUnavailable = trialUsed && !hasTrialAccess;
  const showPayForm = !hasAccess || hasTrialAccess;
  const copy = useMemo(() => getPaywallReasonCopy("week_preview"), []);

  const handleStartTrial = async () => {
    trackUsageEvent("paywall_primary_click", { properties: { source: "week_preview" } });
    try {
      await startTrial();
      trackUsageEvent("trial_started");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "TRIAL_ALREADY_USED") {
        toast({ variant: "default", title: "Триал уже использован", description: "Оформите подписку для полного доступа." });
      } else {
        toast({ variant: "destructive", title: "Ошибка", description: msg || "Попробуйте позже." });
      }
    }
  };

  const handlePayPremium = () => {
    setPaywallReason("week_preview");
    setPaywallCustomMessage(null);
    setShowPaywall(true);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl flex flex-col max-h-[90dvh] overflow-y-auto overflow-x-hidden p-5 gap-3"
      >
        <SheetHeader className="text-left space-y-1.5 pb-0 shrink-0">
          <SheetTitle className="text-lg font-semibold leading-snug text-balance">
            {copy.title}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground leading-relaxed text-balance">
            {copy.body}
          </SheetDescription>
        </SheetHeader>

        <ul className="shrink-0 space-y-2.5 min-w-0">
          {copy.bullets.map((text, index) => (
            <li key={`${text}-${index}`} className="flex items-start gap-2.5 text-xs leading-relaxed min-w-0">
              <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-primary" strokeWidth={3} />
              </span>
              <span className="text-foreground/95 min-w-0 flex-1">{text}</span>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2 shrink-0 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{previewDayLabel}</p>
          <ul className="space-y-1.5">
            {previewMeals.map((m) => (
              <li key={m.meal_type} className="flex items-center gap-2 text-xs text-muted-foreground leading-relaxed">
                <span aria-hidden className="shrink-0">{MEAL_EMOJIS[m.meal_type] ?? "🍽"}</span>
                <span className="text-foreground line-clamp-1">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 shrink-0">
          <p className="text-sm font-medium text-muted-foreground leading-snug">Остальные 6 дней</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground leading-relaxed"
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>День {i + 2}</span>
              </div>
            ))}
          </div>
        </div>

        {showPayForm && (
          <div className="flex flex-col gap-3 shrink-0 mt-auto pt-3 border-t border-border/50">
            {!hasAccess && !trialUnavailable && (
              <Button
                variant="default"
                size="sm"
                className="w-full h-12 text-sm font-semibold rounded-xl"
                onClick={handleStartTrial}
                disabled={isStartingTrial}
              >
                <span className="flex items-center gap-2">
                  <Heart className="w-4 h-4 shrink-0" />
                  {isStartingTrial ? "Активация…" : "Попробовать бесплатно"}
                </span>
              </Button>
            )}
            {!hasAccess && !trialUnavailable && !isStartingTrial && (
              <p className="text-center text-xs text-muted-foreground -mt-1 leading-relaxed">Полный доступ на 3 дня</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-10 rounded-xl text-sm flex flex-col gap-0 py-1 justify-center leading-none min-h-10"
              onClick={() => void handlePayPremium()}
              disabled={isStartingPayment}
            >
              {isStartingPayment ? (
                "Перенаправление…"
              ) : (
                <>
                  <span className="font-semibold leading-tight">Открыть полный доступ</span>
                  <span className="text-[11px] font-normal text-muted-foreground mt-0.5 leading-relaxed">
                    от {pricing.monthRub} ₽ в месяц
                  </span>
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground leading-relaxed">Можно отменить в любой момент</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
