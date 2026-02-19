import { LifeBuoy } from "lucide-react";

export function SosHero() {
  return (
    <div className="rounded-2xl bg-primary/[0.03] px-5 py-5">
      <div className="flex items-start gap-4">
        <div
          className="flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-primary/[0.08] text-primary"
          aria-hidden
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight">
            Помощник рядом
          </h2>
          <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
            Выберите ситуацию и получите рекомендации
          </p>
        </div>
      </div>
    </div>
  );
}
