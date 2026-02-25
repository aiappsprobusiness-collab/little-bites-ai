import { Clock } from "lucide-react";
import { recipeMetaRow } from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export interface RecipeMetaRowProps {
  cookingTimeMinutes?: number | null;
  /** Дополнительные элементы (аудитория, профиль и т.д.) */
  children?: React.ReactNode;
  className?: string;
}

export function RecipeMetaRow({
  cookingTimeMinutes,
  children,
  className,
}: RecipeMetaRowProps) {
  const hasTime = cookingTimeMinutes != null && cookingTimeMinutes > 0;

  if (!hasTime && !children) return null;

  return (
    <div className={cn(recipeMetaRow, className)}>
      {hasTime && (
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>{cookingTimeMinutes} мин</span>
        </span>
      )}
      {children}
    </div>
  );
}
