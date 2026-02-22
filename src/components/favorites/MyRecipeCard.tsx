import { motion } from "framer-motion";
import { CalendarPlus, Pencil } from "lucide-react";
import type { MyRecipePreview } from "@/hooks/useMyRecipes";
import { cn } from "@/lib/utils";

const MAX_INGREDIENT_CHIPS = 3;

export interface MyRecipeCardProps {
  recipe: MyRecipePreview;
  index?: number;
  onTap: () => void;
  onAddToPlan?: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  isPremium?: boolean;
}

export function MyRecipeCard({ recipe, index = 0, onTap, onAddToPlan, onEdit, isPremium }: MyRecipeCardProps) {
  const chips = (recipe.ingredientNames ?? []).slice(0, MAX_INGREDIENT_CHIPS);
  const extraCount = Math.max(0, (recipe.ingredientTotalCount ?? 0) - MAX_INGREDIENT_CHIPS);
  const cookTime = recipe.cookTimeMinutes;
  const cookTimeLabel = Number.isFinite(cookTime) && cookTime != null ? `${cookTime} мин` : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Открыть рецепт: ${recipe.title ?? "Рецепт"}`}
        onClick={onTap}
        onKeyDown={(e) => e.key === "Enter" && onTap()}
        className={cn(
          "w-full text-left rounded-2xl border border-border bg-card shadow-soft p-4",
          "min-h-[44px] flex flex-col gap-1.5",
          "active:opacity-95 transition-opacity touch-manipulation cursor-pointer"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-foreground leading-tight line-clamp-2">
                {recipe.title || "Рецепт"}
              </h3>
              <span
                className={cn(
                  "text-xs font-medium rounded-md px-2 py-0.5 shrink-0",
                  "bg-muted text-muted-foreground"
                )}
              >
                Мой рецепт
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              ⏱️ {cookTimeLabel}
            </div>
            {(chips.length > 0 || extraCount > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chips.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center max-w-[120px] px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs h-6 box-border truncate"
                  >
                    {name}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs h-6 shrink-0">
                    +{extraCount}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-start gap-1" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all shrink-0"
                aria-label="Редактировать"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onAddToPlan && isPremium && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToPlan();
                }}
                className="h-8 rounded-full px-2.5 flex items-center justify-center gap-1 text-sm text-muted-foreground border border-border hover:bg-muted/50 active:scale-95 transition-all shrink-0"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                В план
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
