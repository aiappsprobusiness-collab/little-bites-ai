import { cn } from "@/lib/utils";
import { X, Lock } from "lucide-react";

export type PreferenceChipVariant = "allergy" | "like" | "dislike";

/** Цвета из CSS-переменных (светлая/тёмная тема в index.css). */
const variantClass: Record<PreferenceChipVariant, string> = {
  allergy:
    "bg-[var(--pref-allergy-bg)] text-[var(--pref-allergy-fg)] border-[var(--pref-allergy-border)]",
  like: "bg-[var(--pref-like-bg)] text-[var(--pref-like-fg)] border-[var(--pref-like-border)]",
  dislike:
    "bg-[var(--pref-dislike-bg)] text-[var(--pref-dislike-fg)] border-[var(--pref-dislike-border)]",
};

/** Формы редактирования: читаемый акцент. */
const chipBaseDefault =
  "inline-flex items-center gap-1.5 h-7 py-[6px] px-[10px] rounded-[10px] text-[13px] font-medium leading-none whitespace-nowrap border border-solid cursor-default";

/** Список семьи / предпросмотр: тот же порядок, что у возраста (~11px), без «крика». */
const chipBaseCompact =
  "inline-flex items-center gap-1 h-6 min-h-[24px] py-[3px] px-2 rounded-lg text-[11px] font-medium leading-tight whitespace-nowrap border border-solid cursor-default";

/** Карточка семьи: длинные подписи (напр. «белок коровьего молока») без обрезки. */
const chipBaseWrapDefault =
  "inline-flex items-start gap-1.5 min-h-7 min-w-0 max-w-full py-1.5 px-[10px] rounded-[10px] text-[13px] font-medium leading-snug border border-solid cursor-default";

const chipBaseWrapCompact =
  "inline-flex items-start gap-1 min-h-0 min-w-0 max-w-full py-[3px] px-2 rounded-lg text-[11px] font-medium leading-snug border border-solid cursor-default";

export type PreferenceChipSize = "default" | "compact";

export interface PreferenceChipProps {
  label: string;
  variant: PreferenceChipVariant;
  /** `compact` — как строка возраста в карточке семьи (~11px), для списков и предпросмотра. */
  size?: PreferenceChipSize;
  /** Показать крестик удаления (create/edit) */
  removable?: boolean;
  onRemove?: () => void;
  /** Заблокировано (Free) — показать замок вместо крестика, клик по чипу открывает paywall */
  locked?: boolean;
  onLockedClick?: () => void;
  className?: string;
  /** Ограничение ширины текста с truncate */
  maxWidth?: string | number;
  /** Полный текст с переносами (предпросмотр в списке семьи). */
  allowWrap?: boolean;
}

export function PreferenceChip({
  label,
  variant,
  removable = false,
  onRemove,
  locked = false,
  onLockedClick,
  className,
  maxWidth = "140px",
  allowWrap = false,
  size = "default",
}: PreferenceChipProps) {
  const vCls = variantClass[variant];
  const isInteractive = removable || locked;
  const isCompact = size === "compact";
  const chipLayout = allowWrap
    ? isCompact
      ? chipBaseWrapCompact
      : chipBaseWrapDefault
    : isCompact
      ? chipBaseCompact
      : chipBaseDefault;
  const labelEl = allowWrap ? (
    <span className="break-words text-left min-w-0 flex-1">{label}</span>
  ) : (
    <span
      className="truncate"
      style={{ maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }}
    >
      {label}
    </span>
  );

  const content = (
    <>
      {labelEl}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "shrink-0 rounded-full flex items-center justify-center text-current opacity-70 hover:opacity-100 transition-opacity",
            isCompact ? "w-4 h-4 -mr-0.5" : "w-5 h-5 -mr-0.5",
          )}
          aria-label="Удалить"
        >
          <X className={isCompact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </button>
      )}
      {locked && (
        <span
          className={cn(
            "shrink-0 flex items-center justify-center text-current -mr-0.5",
            isCompact ? "w-4 h-4" : "w-5 h-5",
          )}
          aria-hidden
        >
          <Lock className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </span>
      )}
    </>
  );

  const combined = cn(chipLayout, vCls, className);

  if (locked && onLockedClick) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={onLockedClick}
        onKeyDown={(e) => e.key === "Enter" && onLockedClick()}
        className={cn(combined, isInteractive && "cursor-pointer")}
      >
        {content}
      </span>
    );
  }

  if (removable) {
    return (
      <span className={cn(combined, "cursor-default")}>
        {content}
      </span>
    );
  }

  return (
    <span className={combined}>
      {content}
    </span>
  );
}
