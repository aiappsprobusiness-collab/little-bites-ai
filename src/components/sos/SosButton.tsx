import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SosButtonProps {
  label: string;
  emoji: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  /** Показывать иконку замочка (для Free — фича платная) */
  showLock?: boolean;
  /** Чуть приглушённый вид кнопки (Free) */
  locked?: boolean;
}

/** Отдельный компонент кнопки SOS для простой смены стилей. */
export function SosButton({
  label,
  emoji,
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
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200/60 bg-slate-50/60 hover:bg-emerald-50/60 hover:border-emerald-200/60 transition-colors text-left min-h-[100px]",
        disabled && "opacity-70 cursor-not-allowed",
        locked && "opacity-80",
        className
      )}
    >
      {showLock && (
        <span
          className="absolute top-2 right-2 text-muted-foreground text-sm"
          role="img"
          aria-label="Доступно в Premium"
        >
          🔒
        </span>
      )}
      <span className="text-3xl" role="img" aria-hidden>
        {emoji}
      </span>
      <span className="text-sm font-medium text-foreground leading-tight">
        {label}
      </span>
    </motion.button>
  );
}
