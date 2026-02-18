import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HelpWarningCardProps {
  title?: string;
  /** Outline-иконка (по умолчанию AlertTriangle) */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Блок предупреждений: «Когда к врачу» и аналоги. Оливковый фон 8%, компактный padding, outline-иконка.
 */
export function HelpWarningCard({
  title,
  icon,
  children,
  className,
}: HelpWarningCardProps) {
  const Icon = icon ?? <AlertTriangle className="w-4 h-4 text-primary shrink-0" strokeWidth={2} aria-hidden />;

  return (
    <div
      className={cn(
        "flex gap-2 rounded-xl p-3 border border-primary/20 bg-primary/[0.08]",
        className
      )}
    >
      <span className="shrink-0 mt-0.5">{Icon}</span>
      <div className="min-w-0 flex-1">
        {title != null && (
          <h2 className="text-sm font-semibold text-foreground mb-1.5">{title}</h2>
        )}
        <div className="text-sm text-muted-foreground [&>*]:leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
