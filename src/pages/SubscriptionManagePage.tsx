import { useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Форматирование даты для отображения. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Блок 1: текущий статус. План из subscriptions (latest confirmed), дата окончания, статус из profiles_v2. */
function StatusBlock({
  subscriptionStatus,
  subscriptionPlan,
  expiresAt,
  subscriptionExpiresAt,
  trialUntil,
  hasAccess,
  isExpired,
}: {
  subscriptionStatus: string;
  subscriptionPlan: "month" | "year" | null;
  expiresAt: string | null;
  subscriptionExpiresAt: string | null;
  trialUntil: string | null;
  hasAccess: boolean;
  isExpired: boolean;
}) {
  const statusLabel =
    subscriptionStatus === "free"
      ? "Free"
      : subscriptionStatus === "trial"
        ? "Trial"
        : "Premium";

  const planLabel =
    subscriptionStatus === "premium" && subscriptionPlan
      ? subscriptionPlan === "year"
        ? "Год"
        : "Месяц"
      : subscriptionStatus === "trial"
        ? "—"
        : "—";

  const statusStateLabel =
    subscriptionStatus === "free"
      ? "Без подписки"
      : subscriptionStatus === "trial"
        ? "Активен"
        : hasAccess && !isExpired
          ? "Активна"
          : "Истекла";

  const periodEndDate =
    subscriptionStatus === "premium"
      ? (subscriptionExpiresAt ?? expiresAt)
      : subscriptionStatus === "trial"
        ? trialUntil
        : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Текущий статус</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Статус</dt>
          <dd className="font-medium text-foreground">{statusLabel}</dd>
        </div>
        {(subscriptionStatus === "premium" || subscriptionStatus === "trial") && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Текущий план</dt>
            <dd className="font-medium text-foreground">{planLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Состояние</dt>
          <dd className="font-medium text-foreground">{statusStateLabel}</dd>
        </div>
        {periodEndDate && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Дата окончания текущего периода</dt>
            <dd className="font-medium text-foreground text-right">{formatDate(periodEndDate)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export default function SubscriptionManagePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const {
    subscriptionStatus,
    subscriptionPlan,
    expiresAt,
    subscriptionExpiresAt,
    trialUntil,
    hasAccess,
    isExpired,
    startPayment,
    isStartingPayment,
    cancelSubscription,
    isCancellingSubscription,
    refetchUsage,
  } = useSubscription();

  const handlePayment = (plan: "month" | "year") => {
    startPayment(plan).catch((e) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error).message,
      });
    });
  };

  const handleCancelSubscription = () => {
    cancelSubscription()
      .then(() => {
        toast({
          title: "Подписка отменена",
          description: "Доступ сохранится до конца оплаченного периода.",
        });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Не удалось отменить подписку",
        });
      });
  };

  const handleRefreshAfterPayment = async () => {
    const prevExpires = expiresAt;
    await queryClient.refetchQueries({ queryKey: ["profile-subscription", user?.id] });
    const data = queryClient.getQueryData(["profile-subscription", user?.id]) as {
      premium_until?: string | null;
    } | null | undefined;
    const nextExpires = data?.premium_until ?? null;
    if (nextExpires && nextExpires !== prevExpires) {
      toast({
        title: "Подписка обновлена",
        description: "Статус успешно обновлён.",
      });
    } else {
      toast({
        title: "Статус обновлён",
        description: "Если вы только что оплатили, данные подтянутся в течение минуты.",
      });
    }
  };

  const cardClass = "rounded-2xl border border-border bg-card p-4";
  const primaryButtonClass =
    "w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 border-0";
  const secondaryButtonClass =
    "rounded-xl border border-border bg-transparent text-foreground hover:bg-muted/50 w-full";
  const textLinkClass =
    "text-sm text-muted-foreground hover:text-foreground transition-colors py-2 block w-full text-center";

  return (
    <MobileLayout title="Управление подпиской" showNav={true}>
      <div className="min-h-full bg-[var(--color-bg-main)] overflow-y-auto">
        <div className="px-4 py-6 pb-24 space-y-6 max-w-md mx-auto">
          <StatusBlock
            subscriptionStatus={subscriptionStatus}
            subscriptionPlan={subscriptionPlan}
            expiresAt={expiresAt}
            subscriptionExpiresAt={subscriptionExpiresAt}
            trialUntil={trialUntil}
            hasAccess={hasAccess}
            isExpired={isExpired}
          />

          {/* Блок "Я оплатил — обновить" для смены тарифа / после оплаты */}
          <section className={cn(cardClass, "space-y-3")}>
            <p className="text-sm text-muted-foreground">
              Вернулись после оплаты? Обновите статус.
            </p>
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={handleRefreshAfterPayment}
            >
              Я оплатил — обновить
            </Button>
          </section>

          <section className={cn(cardClass, "space-y-4")}>
            <h2 className="text-lg font-semibold text-foreground">Действия</h2>

            {subscriptionStatus === "free" && (
              <div className="space-y-3">
                <Button
                  className={primaryButtonClass}
                  onClick={() => handlePayment("month")}
                  disabled={isStartingPayment}
                >
                  {isStartingPayment ? "Перенаправление…" : "Купить месяц"}
                </Button>
                <Button
                  variant="outline"
                  className={secondaryButtonClass}
                  onClick={() => handlePayment("year")}
                  disabled={isStartingPayment}
                >
                  Купить год (выгоднее)
                </Button>
              </div>
            )}

            {subscriptionStatus === "trial" && (
              <div className="space-y-3">
                {trialUntil && (
                  <p className="text-sm text-muted-foreground">
                    Trial до {formatDate(trialUntil)}
                  </p>
                )}
                <Button
                  className={primaryButtonClass}
                  onClick={() => setShowPaywall(true)}
                >
                  Купить Premium
                </Button>
                <Button
                  variant="outline"
                  className={secondaryButtonClass}
                  onClick={() => handlePayment("year")}
                  disabled={isStartingPayment}
                >
                  Купить год (выгоднее)
                </Button>
              </div>
            )}

            {subscriptionStatus === "premium" && (
              <div className="space-y-3">
                <Button
                  className={primaryButtonClass}
                  onClick={() => handlePayment("year")}
                  disabled={isStartingPayment}
                >
                  {isStartingPayment ? "Перенаправление…" : "Перейти на год (выгоднее)"}
                </Button>
                <Button
                  variant="outline"
                  className={secondaryButtonClass}
                  onClick={() => handlePayment("month")}
                  disabled={isStartingPayment}
                >
                  Продлить месяц
                </Button>
                <Button
                  variant="outline"
                  className={secondaryButtonClass}
                  onClick={() => handlePayment("year")}
                  disabled={isStartingPayment}
                >
                  Продлить год
                </Button>
                {hasAccess && (
                  <button
                    type="button"
                    className={textLinkClass}
                    onClick={handleCancelSubscription}
                    disabled={isCancellingSubscription}
                  >
                    {isCancellingSubscription ? "Отмена…" : "Отменить подписку"}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </MobileLayout>
  );
}
