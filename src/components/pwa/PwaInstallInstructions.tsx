import type { ComponentType, ReactNode } from "react";
import { MoreVertical, Share, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type PwaInstallInstructionsProps = {
  variant: "ios" | "android";
  className?: string;
};

function StepRow({
  step,
  icon: Icon,
  children,
}: {
  step: number;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3 items-start">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-pill-surface text-xs font-semibold text-primary"
        aria-hidden
      >
        {step}
      </span>
      <div className="flex gap-2.5 min-w-0 pt-0.5">
        <Icon className="h-[18px] w-[18px] shrink-0 text-primary mt-0.5" strokeWidth={2} aria-hidden />
        <p className="text-sm text-foreground/90 leading-snug">{children}</p>
      </div>
    </li>
  );
}

export function PwaInstallInstructions({ variant, className }: PwaInstallInstructionsProps) {
  if (variant === "ios") {
    return (
      <ol className={cn("space-y-3 rounded-xl border border-border/60 bg-muted/25 px-3.5 py-3.5", className)}>
        <StepRow step={1} icon={Share}>
          В Safari нажмите <span className="font-medium text-foreground">Поделиться</span> (квадрат со стрелкой вверх).
        </StepRow>
        <StepRow step={2} icon={Smartphone}>
          Выберите <span className="font-medium text-foreground">На экран «Домой»</span> и подтвердите.
        </StepRow>
      </ol>
    );
  }

  return (
    <ol className={cn("space-y-3 rounded-xl border border-border/60 bg-muted/25 px-3.5 py-3.5", className)}>
      <StepRow step={1} icon={MoreVertical}>
        Откройте меню браузера <span className="font-medium text-foreground">(⋮ или ≡)</span>.
      </StepRow>
      <StepRow step={2} icon={Smartphone}>
        Нажмите{" "}
        <span className="font-medium text-foreground">«Установить приложение»</span> или{" "}
        <span className="font-medium text-foreground">«Добавить на главный экран»</span>.
      </StepRow>
    </ol>
  );
}
