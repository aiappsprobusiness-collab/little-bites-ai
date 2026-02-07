import { cn } from "@/lib/utils";

interface OnboardingStepperProps {
  currentStep: number;
  totalSteps?: number;
  className?: string;
}

export function OnboardingStepper({
  currentStep,
  totalSteps = 2,
  className,
}: OnboardingStepperProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm font-medium text-muted-foreground">
        Шаг {currentStep} из {totalSteps}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
}
