import { Clock } from "lucide-react";
import { formatKcal, formatMinutes, formatMacrosShort } from "@/utils/nutritionFormat";
import { recipeMealBadge, recipeTimeClass, recipeNutritionMetaKcal } from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export type RecipeNutritionHeaderSource = {
  kcal_per_serving?: number | null;
  calories?: number | null;
  protein_g_per_serving?: number | null;
  proteins?: number | null;
  fat_g_per_serving?: number | null;
  fats?: number | null;
  carbs_g_per_serving?: number | null;
  carbs?: number | null;
};

function normalizeNutrition(n?: RecipeNutritionHeaderSource | null) {
  if (!n) return { kcal: null, protein: null, fat: null, carbs: null };
  const kcal = n.kcal_per_serving ?? n.calories ?? null;
  const protein = n.protein_g_per_serving ?? n.proteins ?? null;
  const fat = n.fat_g_per_serving ?? n.fats ?? null;
  const carbs = n.carbs_g_per_serving ?? n.carbs ?? null;
  return {
    kcal: kcal != null && Number.isFinite(kcal) ? Number(kcal) : null,
    protein: protein != null && Number.isFinite(protein) ? Number(protein) : null,
    fat: fat != null && Number.isFinite(fat) ? Number(fat) : null,
    carbs: carbs != null && Number.isFinite(carbs) ? Number(carbs) : null,
  };
}

export interface RecipeNutritionHeaderProps {
  mealTypeLabel?: string | null;
  cookingTimeMinutes?: number | null;
  nutrition?: RecipeNutritionHeaderSource | null;
  variant?: "details" | "card";
  className?: string;
}

/**
 * Компактный блок мета + макросы: иконки + типографика, без чипсов.
 * details = детальная страница; card = карточки (чуть мельче).
 */
export function RecipeNutritionHeader({
  mealTypeLabel,
  cookingTimeMinutes,
  nutrition,
  variant = "details",
  className,
}: RecipeNutritionHeaderProps) {
  const { kcal, protein, fat, carbs } = normalizeNutrition(nutrition);
  const hasKcal = kcal != null;
  const hasTime = cookingTimeMinutes != null && cookingTimeMinutes > 0;
  const hasMeal = !!mealTypeLabel?.trim();
  const hasMeta = hasMeal || hasKcal || hasTime;
  const hasMacros = protein != null || fat != null || carbs != null;

  if (!hasMeta && !hasMacros) return null;

  const isCard = variant === "card";
  const macrosSize = isCard ? "text-[11px]" : "text-xs";

  return (
    <div className={cn("space-y-1.5", className)}>
      {hasMeta && (
        <div
          className="flex flex-wrap items-center gap-2 min-w-0"
          role="group"
          aria-label="Тип приёма, калории, время приготовления"
        >
          {hasMeal && (
            <span className={recipeMealBadge}>{mealTypeLabel!.trim()}</span>
          )}
          {hasTime && (
            <span className={recipeTimeClass}>
              <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>{formatMinutes(cookingTimeMinutes)}</span>
            </span>
          )}
          {hasKcal && (
            <span className={recipeNutritionMetaKcal}>
              <span className="font-medium text-primary/90">{Math.round(kcal!)}</span>
              <span> ккал</span>
            </span>
          )}
        </div>
      )}
      {hasMacros && (
        <p
          className={cn(macrosSize, "text-muted-foreground leading-snug")}
          role="paragraph"
        >
          {formatMacrosShort({ protein, fat, carbs })}
        </p>
      )}
    </div>
  );
}
