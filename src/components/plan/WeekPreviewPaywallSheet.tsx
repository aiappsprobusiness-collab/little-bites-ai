import { Lock, Heart } from "lucide-react";
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
        className="rounded-t-2xl flex flex-col max-h-[88dvh] overflow-hidden p-3 gap-2"
      >
        <SheetHeader className="text-left space-y-0.5 pb-0 shrink-0">
          <SheetTitle className="text-base font-semibold leading-tight">
            План на неделю почти готов
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground leading-snug">
            Меню на неделю за 30 секунд
          </SheetDescription>
        </SheetHeader>

        <div className="rounded-lg border border-border bg-card/50 p-2 space-y-1 shrink-0 min-h-0">
          <p className="text-xs font-medium text-foreground">{previewDayLabel}</p>
          <ul className="space-y-0.5">
            {previewMeals.map((m) => (
              <li key={m.meal_type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden className="shrink-0">{MEAL_EMOJIS[m.meal_type] ?? "🍽"}</span>
                <span className="text-foreground line-clamp-1">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 shrink-0">
          <p className="text-xs font-medium text-muted-foreground">Остальные 6 дней</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] text-muted-foreground"
              >
                <Lock className="w-3 h-3 shrink-0" />
                <span>День {i + 2}</span>
              </div>
            ))}
          </div>
        </div>

        {showPayForm && (
          <div className="flex flex-col gap-1.5 shrink-0 mt-auto pt-1 border-t border-border/50">
            {!hasAccess && !trialUnavailable && (
              <Button
                variant="default"
                size="sm"
                className="w-full h-9 text-sm font-semibold rounded-lg"
                onClick={handleStartTrial}
                disabled={isStartingTrial}
              >
                <span className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 shrink-0" />
                  {isStartingTrial ? "Активация…" : "Попробовать бесплатно"}
                </span>
              </Button>
            )}
            {!hasAccess && !trialUnavailable && !isStartingTrial && (
              <p className="text-center text-[10px] text-muted-foreground -mt-1">Полный доступ на 3 дня</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 rounded-lg text-sm flex flex-col gap-0 py-1 leading-none min-h-9"
              onClick={() => void handlePayPremium()}
              disabled={isStartingPayment}
            >
              {isStartingPayment ? (
                "Перенаправление…"
              ) : (
                <>
                  <span className="font-semibold leading-tight">Открыть полный доступ</span>
                  <span className="text-[10px] font-normal text-muted-foreground mt-0.5">
                    от {pricing.monthRub} ₽ в месяц
                  </span>
                </>
              )}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">Можно отменить в любой момент</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
