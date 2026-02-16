import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SosButtonProps {
  label: string;
  /** Опциональный подзаголовок под названием */
  subtext?: string;
  /** Эмодзи или не используется, если передан icon */
  emoji?: string;
  /** Outline-иконка в круглом фоне (приоритет над emoji) */
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  showLock?: boolean;
  locked?: boolean;
}

/** Карточка сценария: только Lucide-иконка в круге, адаптивные размеры (clamp), press-эффект. */
export function SosButton({
  label,
  subtext,
  icon,
  onClick,
  className,
  disabled,
  showLock,
  locked,
}: SosButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={cn(
        "relative flex flex-col items-start justify-center gap-2.5 min-h-0",
        "rounded-[22px] bg-white border border-slate-100",
        "shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]",
        "hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left",
        disabled && "opacity-70 cursor-not-allowed",
        locked && "opacity-90",
        className
      )}
      style={{
        padding: "clamp(14px, 3vw, 20px)",
      }}
    >
      {showLock && (
        <span
          className="absolute top-2.5 right-2.5 text-slate-400"
          role="img"
          aria-label="Доступно в Premium"
        >
          <Lock className="w-4 h-4" />
        </span>
      )}
      <span
        className="flex items-center justify-center rounded-full bg-slate-100 text-slate-600 shrink-0"
        style={{
          width: "clamp(36px, 8vw, 44px)",
          height: "clamp(36px, 8vw, 44px)",
        }}
      >
        {icon ?? null}
      </span>
      <span className="text-typo-h2 font-bold text-slate-900 leading-tight">
        {label}
      </span>
      {subtext != null && subtext !== "" && (
        <span className="text-typo-caption text-gray-500 leading-snug">{subtext}</span>
      )}
    </motion.button>
  );
}
