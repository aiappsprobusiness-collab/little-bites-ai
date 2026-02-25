import { recipeSectionLabel, recipeStepNum, recipeStepText } from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export interface RecipeStepsProps {
  steps: Array<string | { instruction?: string; step_number?: number }>;
  className?: string;
}

export function RecipeSteps({ steps, className }: RecipeStepsProps) {
  if (!steps?.length) return null;

  return (
    <div className={className}>
      <p className={cn(recipeSectionLabel, "mb-1")}>Шаги приготовления</p>
      <div className="space-y-1">
        {steps.map((step, idx) => {
          const text = typeof step === "string" ? step : (step as { instruction?: string }).instruction ?? "";
          const num = typeof step === "object" && (step as { step_number?: number }).step_number != null
            ? (step as { step_number: number }).step_number
            : idx + 1;
          return (
            <div key={idx} className="flex gap-2 items-start">
              <span className={recipeStepNum}>{num}.</span>
              <p className={recipeStepText}>{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
