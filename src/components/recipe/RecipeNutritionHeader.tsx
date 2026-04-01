import { Clock } from "lucide-react";
import { formatMinutes, formatMacrosShort } from "@/utils/nutritionFormat";
import { recipeMealBadge, recipeTimeClass, recipeKcalChip } from "@/theme/recipeTokens";
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
  /** Список избранного / мои рецепты: тише бейджи и мета, без «кричащего» primary. */
  tone?: "default" | "quiet";
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
  tone = "default",
}: RecipeNutritionHeaderProps) {
  const { kcal, protein, fat, carbs } = normalizeNutrition(nutrition);
  const hasKcal = kcal != null;
  const hasTime = cookingTimeMinutes != null && cookingTimeMinutes > 0;
  const hasMeal = !!mealTypeLabel?.trim();
  const hasMeta = hasMeal || hasKcal || hasTime;
  const hasMacros = protein != null || fat != null || carbs != null;

  if (!hasMeta && !hasMacros) return null;

  const isCard = variant === "card";
  const isQuiet = tone === "quiet";
  const macrosSize = isQuiet ? "text-[10px]" : isCard ? "text-[11px]" : "text-xs";
  const mealQuietClass =
    "inline-flex items-center rounded-md border border-border/55 bg-muted/35 text-[10px] font-medium text-muted-foreground px-2 py-0.5";

  return (
    <div className={cn(isQuiet ? "space-y-0.5" : "space-y-1", className)}>
      {hasMeta && (
        <div
          className={cn(
            "flex flex-wrap items-center min-w-0",
            isQuiet ? "gap-x-2.5 gap-y-1" : "gap-x-3 gap-y-1.5",
          )}
          role="group"
          aria-label="Тип приёма, калории, время приготовления"
        >
          {hasMeal && (
            <span className={isQuiet ? mealQuietClass : recipeMealBadge}>{mealTypeLabel!.trim()}</span>
          )}
          {hasTime && (
            <span
              className={cn(
                isQuiet
                  ? "inline-flex items-center gap-1 text-[11px] text-muted-foreground/75"
                  : recipeTimeClass,
              )}
            >
              <Clock
                className={cn("shrink-0", isQuiet ? "h-3 w-3" : "h-3.5 w-3.5")}
                aria-hidden
              />
              <span>{formatMinutes(cookingTimeMinutes)}</span>
            </span>
          )}
          {hasKcal && (
            <span
              className={
                isQuiet
                  ? "inline-flex items-center text-[11px] text-muted-foreground/80 tabular-nums gap-0.5"
                  : recipeKcalChip
              }
            >
              <span>{Math.round(kcal!)}</span>
              <span className={isQuiet ? "opacity-80" : "opacity-90"}> ккал</span>
            </span>
          )}
        </div>
      )}
      {hasMacros && (() => {
        const full = formatMacrosShort({ protein, fat, carbs });
        const [label, line] = full.split("\n");
        return (
          <div
            className={cn(
              macrosSize,
              isQuiet ? "text-muted-foreground/65 leading-snug" : "text-muted-foreground/90 leading-snug",
            )}
            role="paragraph"
          >
            <span>{label}</span>
            {line != null && line.trim() && <span className="block mt-px leading-tight">{line.trim()}</span>}
          </div>
        );
      })()}
    </div>
  );
}
