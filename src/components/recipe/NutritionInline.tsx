import { formatKcal, formatMacrosInline, formatMacrosSentence } from "@/utils/nutritionFormat";
import { cn } from "@/lib/utils";

/** Поддержка и API-полей (kcal_per_serving), и legacy (calories). */
export type NutritionInlineSource = {
  kcal_per_serving?: number | null;
  calories?: number | null;
  protein_g_per_serving?: number | null;
  proteins?: number | null;
  fat_g_per_serving?: number | null;
  fats?: number | null;
  carbs_g_per_serving?: number | null;
  carbs?: number | null;
};

function normalizeNutrition(n?: NutritionInlineSource | null): {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
} {
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

export interface NutritionInlineProps {
  mealTypeLabel?: string | null;
  cookingTimeMinutes?: number | null;
  nutrition?: NutritionInlineSource | null;
  /** header = одна строка мета (Ужин · 550 ккал · 40 мин); card = строка макросов под метой. */
  variant?: "header" | "card";
  /** detail = в деталке рецепта: предложение "Одна порция содержит...". */
  useSentence?: boolean;
  className?: string;
}

const metaSeparator = " · ";
const captionClass = "text-xs text-muted-foreground leading-snug";

/**
 * Единый блок КБЖУ: мета-строка (тип приёма · ккал · время) и/или строка БЖУ.
 * Без чипсов, обычный текст.
 */
export function NutritionInline({
  mealTypeLabel,
  cookingTimeMinutes,
  nutrition,
  variant = "header",
  useSentence = false,
  className,
}: NutritionInlineProps) {
  const { kcal, protein, fat, carbs } = normalizeNutrition(nutrition);
  const hasKcal = kcal != null;
  const hasMacros = protein != null || fat != null || carbs != null;

  if (variant === "header") {
    const parts: string[] = [];
    if (mealTypeLabel?.trim()) parts.push(mealTypeLabel.trim());
    if (hasKcal) parts.push(formatKcal(kcal));
    if (cookingTimeMinutes != null && cookingTimeMinutes > 0) {
      parts.push(`${cookingTimeMinutes} мин`);
    }
    if (parts.length === 0) return null;
    return (
      <p className={cn(captionClass, "flex flex-wrap items-center gap-x-1 gap-y-0", className)}>
        {parts.join(metaSeparator)}
      </p>
    );
  }

  if (variant === "card") {
    if (!hasMacros) return null;
    const text = useSentence
      ? formatMacrosSentence(protein, fat, carbs)
      : formatMacrosInline(protein, fat, carbs);
    if (!text) return null;
    return (
      <p className={cn(captionClass, className)}>{text}</p>
    );
  }

  return null;
}
