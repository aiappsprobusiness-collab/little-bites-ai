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

/** Карточка сценария: спокойный стиль, белый фон, мягкая рамка и тень. */
export function SosButton({
  label,
  subtext,
  emoji,
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
        "relative flex flex-col items-start justify-center gap-3 p-4 min-h-[100px]",
        "rounded-[18px] bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        "hover:bg-slate-50 hover:border-slate-200 transition-colors text-left",
        disabled && "opacity-70 cursor-not-allowed",
        locked && "opacity-90",
        className
      )}
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
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 shrink-0"
        )}
      >
        {icon ?? (emoji ? <span className="text-xl leading-none" role="img" aria-hidden>{emoji}</span> : null)}
      </span>
      <span className="text-typo-h2 font-bold text-slate-900 leading-tight">
        {label}
      </span>
      {subtext != null && subtext !== "" && (
        <span className="text-typo-caption text-slate-500 leading-snug">{subtext}</span>
      )}
    </motion.button>
  );
}
