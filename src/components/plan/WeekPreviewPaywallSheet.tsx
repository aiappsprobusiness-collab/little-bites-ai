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
  /** Подпись дня: "Завтра" или "Сегодня" */
  previewDayLabel: string;
  /** 3–4 приёма пищи с названиями (или placeholder) */
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
    setPaywallCustomMessage("Заполнение недели доступно в Premium. Попробуйте Trial или оформите подписку.");
    setShowPaywall(true);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-typo-title font-semibold">
            План на неделю почти готов
          </SheetTitle>
          <SheetDescription className="text-muted-foreground whitespace-pre-line">
            Меню на неделю для вашей семьи
            {"\n"}за 30 секунд
          </SheetDescription>
        </SheetHeader>

        {/* День 1 — превью */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{previewDayLabel}</p>
          <ul className="space-y-1.5">
            {previewMeals.map((m) => (
              <li key={m.meal_type} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span aria-hidden>{MEAL_EMOJIS[m.meal_type] ?? "🍽"}</span>
                <span className="text-foreground">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Остальные 6 дней — залочены */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Остальные 6 дней</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-muted-foreground"
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>День {i + 2}</span>
              </div>
            ))}
          </div>
        </div>

        {showPayForm && (
          <div className="flex flex-col gap-2 mt-2">
            {!hasAccess && !trialUnavailable && (
              <Button
                variant="default"
                size="lg"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl flex flex-col items-center justify-center gap-0 py-3"
                onClick={handleStartTrial}
                disabled={isStartingTrial}
              >
                <span className="flex items-center gap-2">
                  <Heart className="w-5 h-5 shrink-0" />
                  {isStartingTrial ? "Активация…" : "Попробовать бесплатно"}
                </span>
                {!isStartingTrial && <span className="text-xs font-normal opacity-90">Полный доступ на 3 дня</span>}
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-full h-11 rounded-xl flex flex-col items-center justify-center gap-0 py-3"
              onClick={handlePayPremium}
              disabled={isStartingPayment}
            >
              {isStartingPayment ? (
                "Перенаправление…"
              ) : (
                <>
                  <span>Оформить Premium</span>
                  <span className="text-xs font-normal text-muted-foreground">от {pricing.monthRub} ₽ в месяц</span>
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-1">
              Можно отменить в любой момент
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
