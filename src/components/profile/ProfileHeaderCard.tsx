import { Pencil, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  free: "Free",
  trial: "Trial",
  premium: "Premium",
};

export interface ProfileHeaderCardProps {
  displayName: string;
  status: string;
  onEditClick: (e: React.MouseEvent) => void;
  freePlanLine: string;
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
  onEditClick,
  freePlanLine,
  trialUntilFormatted,
  expiresAtFormatted,
  onSubscriptionCta,
  onCancelSubscription,
  isCancellingSubscription,
  canCancel,
}: ProfileHeaderCardProps) {
  const isPremium = status === "premium";
  const isTrial = status === "trial";
  const isFree = status === "free";

  const statusSubtext =
    isFree ? "Free план" : isTrial ? "Пробный период" : "Подписка активна";

  const row2Secondary =
    isFree
      ? freePlanLine
      : isTrial && trialUntilFormatted
        ? `до ${trialUntilFormatted}`
        : isPremium && expiresAtFormatted
          ? `до ${expiresAtFormatted}`
          : null;

  return (
    <div className="rounded-2xl border border-primary-border/80 bg-card p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] flex flex-col gap-3">
      {/* Row 1: Avatar | Name + secondary | Edit */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onEditClick}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          aria-label="Редактировать профиль"
        >
          <div className="w-12 h-12 rounded-full bg-primary/[0.06] border border-primary-border/50 flex items-center justify-center text-lg font-semibold text-foreground shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-foreground truncate leading-tight">
              {displayName}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {statusSubtext}
            </p>
          </div>
        </button>
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

      {/* Row 2: Badge (compact) + expiry/free inline */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full w-fit text-[10px] font-medium px-2 py-0.5 shrink-0",
            (isPremium || isTrial) && "bg-primary/10 text-primary border border-primary/20",
            isFree && "bg-muted/80 text-muted-foreground"
          )}
        >
          {STATUS_LABEL[status] ?? "Free"}
          {isPremium && <Crown className="h-3 w-3" strokeWidth={2} aria-hidden />}
        </span>
        {row2Secondary && (
          <span className="text-[11px] text-muted-foreground">{row2Secondary}</span>
        )}
      </div>

      {/* Row 3: Primary CTA + cancel link (8–10px under) */}
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
