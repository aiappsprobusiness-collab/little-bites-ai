import { cn } from "@/lib/utils";
import { X, Lock } from "lucide-react";

export type PreferenceChipVariant = "allergy" | "like" | "dislike";

/** Мягкие цвета для чипов: аллергии — розово-персик, любит — зелёный, не любит — нейтральный/бежевый */
const variantStyles: Record<
  PreferenceChipVariant,
  { bg: string; text: string; border: string }
> = {
  allergy: {
    bg: "#FCE8E4",
    text: "#B87A6E",
    border: "#F5D5CF",
  },
  like: {
    bg: "#E8F3E2",
    text: "#4A6B2D",
    border: "#D4E7C8",
  },
  dislike: {
    bg: "#F0EDE8",
    text: "#7A6F65",
    border: "#E5E0D8",
  },
};

/** Формы редактирования: читаемый акцент. */
const chipBaseDefault =
  "inline-flex items-center gap-1.5 h-7 py-[6px] px-[10px] rounded-[10px] text-[13px] font-medium leading-none whitespace-nowrap border cursor-default";

/** Список семьи / предпросмотр: тот же порядок, что у возраста (~11px), без «крика». */
const chipBaseCompact =
  "inline-flex items-center gap-1 h-6 min-h-[24px] py-[3px] px-2 rounded-lg text-[11px] font-medium leading-tight whitespace-nowrap border cursor-default";

/** Карточка семьи: длинные подписи (напр. «белок коровьего молока») без обрезки. */
const chipBaseWrapDefault =
  "inline-flex items-start gap-1.5 min-h-7 min-w-0 max-w-full py-1.5 px-[10px] rounded-[10px] text-[13px] font-medium leading-snug border cursor-default";

const chipBaseWrapCompact =
  "inline-flex items-start gap-1 min-h-0 min-w-0 max-w-full py-[3px] px-2 rounded-lg text-[11px] font-medium leading-snug border cursor-default";

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
  const styles = variantStyles[variant];
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
            "shrink-0 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity",
            isCompact ? "w-4 h-4 -mr-0.5" : "w-5 h-5 -mr-0.5"
          )}
          style={{ color: styles.text }}
          aria-label="Удалить"
        >
          <X className={isCompact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </button>
      )}
      {locked && (
        <span
          className={cn(
            "shrink-0 flex items-center justify-center -mr-0.5",
            isCompact ? "w-4 h-4" : "w-5 h-5"
          )}
          style={{ color: styles.text }}
          aria-hidden
        >
          <Lock className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </span>
      )}
    </>
  );

  const style = {
    background: styles.bg,
    color: styles.text,
    border: `1px solid ${styles.border}`,
  };

  if (locked && onLockedClick) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={onLockedClick}
        onKeyDown={(e) => e.key === "Enter" && onLockedClick()}
        className={cn(chipLayout, isInteractive && "cursor-pointer")}
        style={style}
      >
        {content}
      </span>
    );
  }

  if (removable) {
    return (
      <span
        className={cn(chipLayout, "cursor-default")}
        style={style}
      >
        {content}
      </span>
    );
  }

  return (
    <span className={cn(chipLayout, className)} style={style}>
      {content}
    </span>
  );
}
