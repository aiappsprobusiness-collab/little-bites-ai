import { motion } from "framer-motion";
import { Heart, CalendarPlus } from "lucide-react";
import { toFavoriteCardViewModel } from "./favoriteCardViewModel";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

interface FavoriteCardProps {
  favorite: SavedFavorite;
  onTap: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  index?: number;
  isPremium?: boolean;
  members: Array<{ id: string; name?: string; age_months?: number | null }>;
  onAddToPlan?: () => void;
}

const MAX_INGREDIENT_CHIPS = 3;

export function FavoriteCard({ favorite, onTap, onToggleFavorite, index = 0, isPremium = false, members, onAddToPlan }: FavoriteCardProps) {
  const vm = toFavoriteCardViewModel(favorite.recipe);
  const audienceLabel = favorite.member_id == null
    ? "Для семьи"
    : (members.find((m) => m.id === favorite.member_id) as { name?: string } | undefined)?.name ?? "Для профиля";
  const chips = vm.ingredientNames.slice(0, MAX_INGREDIENT_CHIPS);
  const extraCount = Math.max(0, vm.ingredientTotalCount - MAX_INGREDIENT_CHIPS);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Открыть рецепт: ${vm.title}`}
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
            <h3 className="text-base font-semibold text-foreground leading-tight line-clamp-2">
              {vm.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm text-muted-foreground">
              <span>⏱️ {vm.cookTimeLabel}</span>
              <span className="text-muted-foreground/70">·</span>
              <span>{audienceLabel}</span>
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(e);
              }}
              className="h-8 w-8 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/20 hover:opacity-90 active:scale-95 transition-all shrink-0"
              aria-label="Убрать из избранного"
            >
              <Heart className="h-4 w-4 fill-primary" />
            </button>
            {onAddToPlan && (
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
