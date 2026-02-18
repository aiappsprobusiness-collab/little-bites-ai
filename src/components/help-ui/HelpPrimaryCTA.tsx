import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HelpPrimaryCTAProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}

/**
 * Главная CTA кнопка Help: «Задать вопрос», «Спросить у помощника». Оливковый фон, 48px высота, 16px radius, без теней.
 */
export function HelpPrimaryCTA({
  children,
  onClick,
  type = "button",
  className,
  disabled,
}: HelpPrimaryCTAProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-12 rounded-2xl font-semibold bg-primary text-primary-foreground",
        "hover:opacity-90 active:opacity-95 disabled:opacity-50 disabled:pointer-events-none",
        "transition-opacity w-full sm:w-auto min-w-0",
        className
      )}
    >
      {children}
    </button>
  );
}
