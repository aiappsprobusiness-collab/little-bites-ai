import { LifeBuoy } from "lucide-react";

export function SosHero() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft p-4">
      <div className="flex items-start gap-4">
        <div
          className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-muted text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Помощник рядом
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Выберите ситуацию и получите рекомендации
          </p>
        </div>
      </div>
    </div>
  );
}
