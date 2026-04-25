import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Baby, CalendarDays, Heart, ThumbsDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlanModeHintMode = "family" | "member";

function formatAge(ageMonths: number | null | undefined): string {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return "";
  if (ageMonths < 12) return `${ageMonths} мес`;
  const years = Math.floor(ageMonths / 12);
  return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`;
}

function formatList(items: string[] | undefined): string {
  if (!items?.length) return "";
  return items.join(", ");
}

function HelpRow({
  icon: Icon,
  label,
  value,
  valueEmpty,
  isLast,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Показать value как второстепенный текст, если пусто по смыслу */
  valueEmpty?: boolean;
  isLast?: boolean;
}) {
  const showValue = value.length > 0;
  return (
    <div
      className={cn(
        "flex gap-3 px-3 py-3 sm:px-4",
        !isLast && "border-b border-border/20",
      )}
    >
      <Icon className="h-[18px] w-[18px] text-muted-foreground/80 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-sm",
            showValue && !valueEmpty ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {showValue ? value : "не указано"}
        </p>
      </div>
    </div>
  );
}

const cardShell =
  "rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]";

export interface PlanProfileHelpBodyProps {
  mode: PlanModeHintMode;
  /** Данные профиля для режима "member". */
  memberAgeMonths?: number | null;
  memberAllergies?: string[];
  memberLikes?: string[];
  memberDislikes?: string[];
  className?: string;
}

/**
 * Справка «как учитывается профиль» — меню «Ещё» на вкладке План (sheet).
 */
export function PlanProfileHelpBody({
  mode,
  memberAgeMonths,
  memberAllergies,
  memberLikes,
  memberDislikes,
  className,
}: PlanProfileHelpBodyProps) {
  if (mode === "family") {
    return (
      <div className={cn(cardShell, className)}>
        <HelpRow
          icon={Baby}
          label="Дети до 12 месяцев"
          value="не участвуют в семейном меню"
          isLast={false}
        />
        <HelpRow
          icon={Users}
          label="Дети 1–3 года"
          value="подбираем более мягкие блюда"
          isLast={false}
        />
        <HelpRow
          icon={Heart}
          label="Особенности семьи"
          value="учитываем аллергии, любит и не любит у всех членов"
          isLast
        />
      </div>
    );
  }

  const ageStr = formatAge(memberAgeMonths);
  const allergiesStr = formatList(memberAllergies);
  const likesStr = formatList(memberLikes);
  const dislikesStr = formatList(memberDislikes);

  return (
    <div className={cn(cardShell, className)}>
      <HelpRow icon={CalendarDays} label="Возраст" value={ageStr} valueEmpty={!ageStr} isLast={false} />
      <HelpRow
        icon={AlertTriangle}
        label="Аллергии"
        value={allergiesStr}
        valueEmpty={!allergiesStr}
        isLast={false}
      />
      <HelpRow icon={Heart} label="Любит" value={likesStr} valueEmpty={!likesStr} isLast={false} />
      <HelpRow icon={ThumbsDown} label="Не любит" value={dislikesStr} valueEmpty={!dislikesStr} isLast />
    </div>
  );
}
