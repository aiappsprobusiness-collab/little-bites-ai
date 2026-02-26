import { Pencil, Crown } from "lucide-react";
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
}

/** Верхний блок: компактная белая карточка, лёгкая тень или без, радиус до 16px. */
export function ProfileHeaderCard({
  displayName,
  status,
  onEditClick,
}: ProfileHeaderCardProps) {
  const isPremium = status === "premium";
  const isTrial = status === "trial";
  const isFree = status === "free";

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 flex items-center gap-3 min-h-0">
      <button
        type="button"
        onClick={onEditClick}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
        aria-label="Редактировать профиль"
      >
        <div className="w-11 h-11 rounded-full bg-primary/[0.06] border border-primary-border/40 flex items-center justify-center text-lg font-semibold text-foreground shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground truncate leading-tight">
            {displayName}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {status === "free" ? "Бесплатный план" : isTrial ? "Пробный период" : "Подписка активна"}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 mt-1",
              isPremium && "rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 border border-primary/20",
              isTrial && "inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 border border-primary/20",
              isFree && "inline-flex items-center rounded-full bg-muted/80 text-muted-foreground text-[10px] font-medium px-2 py-0.5"
            )}
          >
            {STATUS_LABEL[status] ?? "Free"}
            {isPremium && <Crown className="h-3 w-3" strokeWidth={2} aria-hidden />}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onEditClick}
        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded-md"
        aria-label="Редактировать имя"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
