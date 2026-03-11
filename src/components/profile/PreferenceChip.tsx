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

const chipBase =
  "inline-flex items-center gap-1.5 min-h-[26px] py-1 px-2.5 rounded-[10px] text-[13px] font-medium leading-none whitespace-nowrap border cursor-default";

export interface PreferenceChipProps {
  label: string;
  variant: PreferenceChipVariant;
  /** Показать крестик удаления (create/edit) */
  removable?: boolean;
  onRemove?: () => void;
  /** Заблокировано (Free) — показать замок вместо крестика, клик по чипу открывает paywall */
  locked?: boolean;
  onLockedClick?: () => void;
  className?: string;
  /** Ограничение ширины текста с truncate */
  maxWidth?: string | number;
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
}: PreferenceChipProps) {
  const styles = variantStyles[variant];
  const isInteractive = removable || locked;

  const content = (
    <>
      <span className="truncate" style={{ maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }}>
        {label}
      </span>
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center -mr-0.5 opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: styles.text }}
          aria-label="Удалить"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {locked && (
        <span
          className="shrink-0 w-5 h-5 flex items-center justify-center -mr-0.5"
          style={{ color: styles.text }}
          aria-hidden
        >
          <Lock className="w-3.5 h-3.5" />
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
        className={cn(chipBase, isInteractive && "cursor-pointer")}
        style={style}
      >
        {content}
      </span>
    );
  }

  if (removable) {
    return (
      <span
        className={cn(chipBase, "cursor-default")}
        style={style}
      >
        {content}
      </span>
    );
  }

  return (
    <span className={cn(chipBase, className)} style={style}>
      {content}
    </span>
  );
}
