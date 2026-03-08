import { cn } from "@/lib/utils";
import { X, Lock } from "lucide-react";

export type PreferenceChipVariant = "allergy" | "like" | "dislike";

const variantStyles: Record<
  PreferenceChipVariant,
  { bg: string; text: string; border: string }
> = {
  allergy: {
    bg: "#FDE7E7",
    text: "#B54747",
    border: "#F6CACA",
  },
  like: {
    bg: "#EAF4E3",
    text: "#5E7D32",
    border: "#D6E7C8",
  },
  dislike: {
    bg: "#F4EAD9",
    text: "#8A6338",
    border: "#E9D8BC",
  },
};

const chipBase =
  "inline-flex items-center gap-1.5 min-h-[28px] py-0 px-[10px] rounded-[999px] text-[13px] font-medium leading-none whitespace-nowrap border cursor-default";

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
