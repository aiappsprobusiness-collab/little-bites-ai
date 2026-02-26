import { Button } from "@/components/ui/button";

export interface SubscriptionCardProps {
  status: "free" | "trial" | "premium";
  freePlanLine: string;
  trialUntilFormatted: string | null;
  expiresAtFormatted: string | null;
  onCta: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  canCancel?: boolean;
}

/** Минимальный блок подписки: без большой карточки и декора. Заголовок, текст, кнопка. */
export function SubscriptionCard({
  status,
  freePlanLine,
  trialUntilFormatted,
  expiresAtFormatted,
  onCta,
  onCancel,
  isCancelling,
  canCancel,
}: SubscriptionCardProps) {
  const isPremium = status === "premium";
  const isTrial = status === "trial";
  const isFree = status === "free";

  const subtitle =
    isFree
      ? freePlanLine
      : isTrial && trialUntilFormatted
        ? `Trial до ${trialUntilFormatted}`
        : isPremium && expiresAtFormatted
          ? `Premium до ${expiresAtFormatted}`
          : isPremium
            ? "Подписка активна"
            : "Пробный период";

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Подписка
      </p>
      <p className="text-sm text-muted-foreground">
        {subtitle}
      </p>
      <Button
        className="w-full rounded-xl bg-primary text-primary-foreground hover:opacity-90 border-0 h-10 text-sm font-medium"
        onClick={onCta}
      >
        {isFree ? "Попробовать Premium" : "Управлять подпиской"}
      </Button>
      {canCancel && onCancel && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? "Отмена…" : "Отменить подписку"}
        </button>
      )}
    </section>
  );
}
