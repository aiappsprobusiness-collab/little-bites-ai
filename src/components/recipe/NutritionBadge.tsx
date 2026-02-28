import { useSubscription } from "@/hooks/useSubscription";
import {
  recipeNutritionChipKcal,
  recipeNutritionChipBju,
  recipeNutritionMetaKcal,
} from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export interface NutritionBadgeProps {
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  variant?: "full" | "compact" | "detail";
  /** Для variant="detail": только ккал (row1) или только БЖУ (row2) */
  part?: "row1" | "row2";
  className?: string;
}

/**
 * Показывает КБЖУ только для Premium/Trial.
 * full = чат (4 чипсы, ккал акцентнее, БЖУ приглушённые, меньший gap).
 * compact = план/избранное, часть meta-row (ккал в строку со временем).
 * detail = детальная карточка: row1 = ккал рядом с мета, row2 = БЖУ вторым уровнем.
 */
export function NutritionBadge({
  calories,
  proteins,
  fats,
  carbs,
  variant = "full",
  part,
  className,
}: NutritionBadgeProps) {
  const { isPremium, isTrial } = useSubscription();
  if (!isPremium && !isTrial) return null;

  const hasAll =
    calories != null &&
    proteins != null &&
    fats != null &&
    carbs != null &&
    Number.isFinite(calories) &&
    Number.isFinite(proteins) &&
    Number.isFinite(fats) &&
    Number.isFinite(carbs);
  if (!hasAll) return null;

  const cal = Math.round(Number(calories));
  const pro = Number(proteins);
  const fat = Number(fats);
  const car = Number(carbs);

  if (variant === "compact") {
    return (
      <span className={cn(recipeNutritionMetaKcal, "shrink-0", className)}>
        <span className="font-medium text-primary/90">{cal}</span>
        <span>ккал</span>
      </span>
    );
  }

  if (variant === "detail") {
    if (part === "row1") {
      return (
        <span className={cn("shrink-0", className)}>
          <span className={recipeNutritionChipKcal}>
            <span className="font-medium">{cal}</span>
            <span className="opacity-90">ккал</span>
          </span>
        </span>
      );
    }
    if (part === "row2") {
      return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
          <span className={recipeNutritionChipBju}>
            <span>Б</span>
            <span className="font-medium">{pro}г</span>
          </span>
          <span className={recipeNutritionChipBju}>
            <span>Ж</span>
            <span className="font-medium">{fat}г</span>
          </span>
          <span className={recipeNutritionChipBju}>
            <span>У</span>
            <span className="font-medium">{car}г</span>
          </span>
        </div>
      );
    }
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={recipeNutritionChipKcal}>
            <span className="font-medium">{cal}</span>
            <span className="opacity-90">ккал</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={recipeNutritionChipBju}>
            <span>Б</span>
            <span className="font-medium">{pro}г</span>
          </span>
          <span className={recipeNutritionChipBju}>
            <span>Ж</span>
            <span className="font-medium">{fat}г</span>
          </span>
          <span className={recipeNutritionChipBju}>
            <span>У</span>
            <span className="font-medium">{car}г</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className={recipeNutritionChipKcal}>
        <span className="font-medium">{cal}</span>
        <span className="opacity-90">ккал</span>
      </span>
      <span className={recipeNutritionChipBju}>
        <span>Б</span>
        <span className="font-medium">{pro}г</span>
      </span>
      <span className={recipeNutritionChipBju}>
        <span>Ж</span>
        <span className="font-medium">{fat}г</span>
      </span>
      <span className={recipeNutritionChipBju}>
        <span>У</span>
        <span className="font-medium">{car}г</span>
      </span>
    </div>
  );
}
