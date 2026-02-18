import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HelpSectionCardProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Универсальная карточка для секций Help: «Коротко», «Что сделать сейчас», «Персональные рекомендации» и т.д.
 * Стиль: белый фон, 16px radius, 16px padding, лёгкая рамка, без тени, line-height 1.65.
 */
export function HelpSectionCard({ title, icon, children, className }: HelpSectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        "leading-[1.65]",
        className
      )}
    >
      {(title != null || icon != null) && (
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          {icon}
          {title}
        </h2>
      )}
      <div className="[&>*]:leading-[1.65]">{children}</div>
    </section>
  );
}
