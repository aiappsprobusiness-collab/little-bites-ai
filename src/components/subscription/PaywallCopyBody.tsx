import { cn } from "@/lib/utils";
import { splitPaywallMessage } from "@/utils/paywallBodyLines";

export interface PaywallCopyBodyProps {
  /** Две строки из `paywallReasonCopy.bodyLines` или результат `splitPaywallMessage`. */
  lines: readonly string[] | string;
  className?: string;
  /** Первая строка крупнее/жирнее (кастомные сообщения в UnifiedPaywall). */
  emphasisFirstLine?: boolean;
}

/**
 * Два отдельных абзаца вместо одного `<p>` с `\n` — ровные переносы на узких экранах.
 */
export function PaywallCopyBody({ lines, className, emphasisFirstLine = false }: PaywallCopyBodyProps) {
  const parts = typeof lines === "string" ? splitPaywallMessage(lines) : [...lines].filter((l) => l.trim());
  if (parts.length === 0) return null;

  const firstLineClass = emphasisFirstLine
    ? "text-base font-semibold leading-snug text-foreground text-pretty"
    : "text-sm text-muted-foreground leading-snug text-pretty";
  const nextLineClass = "text-sm text-muted-foreground leading-snug text-pretty";

  return (
    <div className={cn("space-y-1 text-center px-0.5", className)}>
      {parts.map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`} className={index === 0 ? firstLineClass : nextLineClass}>
          {line}
        </p>
      ))}
    </div>
  );
}
