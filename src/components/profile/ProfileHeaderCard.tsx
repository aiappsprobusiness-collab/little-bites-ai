import { Pencil, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  normalizeSubscriptionTier,
  SUBSCRIPTION_TIER_LABELS,
  subscriptionTierChipClassNames,
} from "@/utils/subscriptionTierDisplay";

export interface ProfileHeaderCardProps {
  displayName: string;
  status: string;
  /** Почта аккаунта (под именем вместо «Подписка активна» для Premium). */
  accountEmail?: string | null;
  onEditClick: (e: React.MouseEvent) => void;
  trialUntilFormatted: string | null;
  expiresAtFormatted: string | null;
  onSubscriptionCta: () => void;
  onCancelSubscription?: () => void;
  isCancellingSubscription?: boolean;
  canCancel?: boolean;
}

/** Hero: аккаунт + подписка. Стиль как Plan hero: лёгкая тень, бордер, премиум-иерархия. */
export function ProfileHeaderCard({
  displayName,
  status,
  accountEmail,
  onEditClick,
  trialUntilFormatted,
  expiresAtFormatted,
  onSubscriptionCta,
  onCancelSubscription,
  isCancellingSubscription,
  canCancel,
}: ProfileHeaderCardProps) {
  const tier = normalizeSubscriptionTier(status);
  const isPremium = tier === "premium";
  const isTrial = tier === "trial";
  const isFree = tier === "free";

  const statusSubtext = isFree
    ? null
    : isTrial
      ? "Пробный период"
      : accountEmail?.trim() ?? "";

  const row2Secondary = isFree
    ? "с ограничениями"
    : isTrial && trialUntilFormatted
      ? `до ${trialUntilFormatted}`
      : isPremium && expiresAtFormatted
        ? `до ${expiresAtFormatted}`
        : null;

  return (
    <div className="rounded-2xl border border-primary-border/80 bg-card p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] flex flex-col gap-3">
      {/* Row 1: Avatar | Name + secondary | Edit */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <button
            type="button"
            onClick={onEditClick}
            className="flex items-start gap-3 min-w-0 w-full text-left rounded-xl -m-1 p-1 hover:bg-muted/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Редактировать профиль"
          >
            <div className="w-12 h-12 rounded-full bg-primary/[0.06] border border-primary-border/50 flex items-center justify-center text-lg font-semibold text-foreground shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-lg font-semibold text-foreground truncate leading-tight">
                {displayName}
              </div>
              {!isFree && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={statusSubtext || undefined}>
                  {statusSubtext}
                </p>
              )}
            </div>
          </button>
        </div>
        <motion.button
          type="button"
          onClick={onEditClick}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.12 }}
          className="w-10 h-10 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors"
          aria-label="Редактировать имя"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </motion.button>
      </div>

      {/* Row 2: бейдж + строка справа (как Premium: дата; для Free — «с ограничениями») */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={subscriptionTierChipClassNames(tier)}>
          {SUBSCRIPTION_TIER_LABELS[tier]}
          {isPremium && <Crown className="h-3 w-3" strokeWidth={2} aria-hidden />}
        </span>
        {row2Secondary && (
          <span className="text-[11px] text-muted-foreground">{row2Secondary}</span>
        )}
      </div>

      {/* Row 3: Primary CTA + cancel link */}
      <div className="flex flex-col gap-2">
        <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
          <Button
            className="w-full rounded-xl bg-primary text-primary-foreground hover:opacity-90 border-0 h-11 text-sm font-medium shadow-soft"
            onClick={onSubscriptionCta}
          >
            {isFree ? "Попробовать Premium" : "Управлять подпиской"}
          </Button>
        </motion.div>
        {canCancel && onCancelSubscription && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors py-0.5 w-fit text-left"
            onClick={onCancelSubscription}
            disabled={isCancellingSubscription}
          >
            {isCancellingSubscription ? "Отмена…" : "Отменить подписку"}
          </button>
        )}
      </div>
    </div>
  );
}
