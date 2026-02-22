import { motion } from "framer-motion";
import { CalendarPlus, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Card
        className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-card active:scale-[0.995]"
        onClick={onTap}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-typo-body font-semibold text-foreground leading-snug line-clamp-2 flex-1 min-w-0">
              {recipe.title || "Рецепт"}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                  aria-label="Редактировать"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              <span
                className={cn(
                  "text-[11px] font-medium rounded-full px-2.5 py-1",
                  "bg-[#6b7c3d]/15 text-[#6b7c3d] border border-[#6b7c3d]/30"
                )}
              >
                Мой рецепт
              </span>
            </div>
          </div>

          {recipe.description && (
            <p className="text-typo-muted text-muted-foreground line-clamp-2 mb-3">{recipe.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-typo-caption text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <span>🕒</span>
              <span>{cookTimeLabel}</span>
            </span>
            {onAddToPlan && isPremium && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-8 text-xs gap-1.5 ml-auto border-[#6b7c3d]/40 text-[#6b7c3d] hover:bg-[#6b7c3d]/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToPlan();
                }}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                В план
              </Button>
            )}
          </div>

          {(chips.length > 0 || extraCount > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-muted/80 text-typo-caption font-medium text-muted-foreground px-2 py-1"
                >
                  {name}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-muted/80 text-typo-caption font-medium text-muted-foreground px-2 py-1">
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
