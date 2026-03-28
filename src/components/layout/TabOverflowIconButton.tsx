import { forwardRef, type ButtonHTMLAttributes } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Единый вид кнопки ⋮ для верхнего ряда вкладок План / Чат (круг 40px, muted). */
export const tabOverflowIconButtonClassName =
  "h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all";

export type TabOverflowIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const TabOverflowIconButton = forwardRef<HTMLButtonElement, TabOverflowIconButtonProps>(
  function TabOverflowIconButton({ className, type = "button", ...props }, ref) {
    return (
      <button ref={ref} type={type} className={cn(tabOverflowIconButtonClassName, className)} {...props}>
        <MoreVertical className="w-5 h-5" aria-hidden />
      </button>
    );
  },
);
