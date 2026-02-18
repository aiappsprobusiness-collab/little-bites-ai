import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HelpHeaderProps {
  title: string;
  subtitle?: string | null;
  /** Справа от заголовка, например pill профиля */
  rightSlot?: ReactNode;
  className?: string;
}

/**
 * Заголовок блока Help / Consultation: 18px semibold title, 12–13px muted subtitle, опционально rightSlot (pill).
 */
export function HelpHeader({ title, subtitle, rightSlot, className }: HelpHeaderProps) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-semibold text-foreground tracking-tight">
          {title}
        </h2>
        {rightSlot != null && (
          <div className="flex items-center shrink-0">{rightSlot}</div>
        )}
      </div>
      {subtitle != null && subtitle !== "" && (
        <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-1 leading-snug">
          {subtitle}
        </p>
      )}
    </div>
  );
}
