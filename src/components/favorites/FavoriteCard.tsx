import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toFavoriteCardViewModel } from "./favoriteCardViewModel";
import type { SavedFavorite } from "@/hooks/useFavorites";

interface FavoriteCardProps {
  favorite: SavedFavorite;
  onTap: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  index?: number;
  /** Premium/trial: hint, subtle highlight, star. Free: clean, no hint. */
  isPremium?: boolean;
}

export function FavoriteCard({ favorite, onTap, onToggleFavorite, index = 0, isPremium = false }: FavoriteCardProps) {
  const vm = toFavoriteCardViewModel(favorite.recipe);
  const maxChips = 4;
  const chips = vm.ingredientNames.slice(0, maxChips);
  const extraCount = vm.ingredientNames.length - maxChips;
  const showHint = isPremium && Boolean(vm.hint);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Card
        className={`overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] active:scale-[0.995] ${
          isPremium
            ? "border-amber-200/50 bg-amber-50/30"
            : "border-slate-200/60 bg-white"
        }`}
        onClick={onTap}
      >
        <CardContent className="p-4">
          {/* Header: Title + Favorite toggle */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-base text-foreground leading-snug line-clamp-2 flex-1 min-w-0 flex items-center gap-1.5">
              {isPremium && <span className="text-amber-500/80 shrink-0 text-sm" aria-hidden>⭐</span>}
              <span>{vm.title}</span>
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(e);
              }}
              aria-label="Убрать из избранного"
            >
              <Heart className="w-5 h-5 fill-rose-500" />
            </Button>
          </div>

          {/* Subtitle (1 line max, ellipsis) */}
          {vm.subtitle && (
            <p className="text-sm text-muted-foreground truncate mb-2">{vm.subtitle}</p>
          )}

          {/* Meta row: 👶 child | 🕒 cook time | 🍽 meal type */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <span>👶</span>
              <span>{vm.childLabel}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🕒</span>
              <span>{vm.cookTimeLabel}</span>
            </span>
            {vm.mealTypeLabel && (
              <span className="flex items-center gap-1">
                <span>🍽</span>
                <span>{vm.mealTypeLabel}</span>
              </span>
            )}
          </div>

          {/* Ingredients chips (max 4, names only) */}
          {(chips.length > 0 || extraCount > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {chips.map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60"
                >
                  {name}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                  +{extraCount}
                </span>
              )}
            </div>
          )}

          {/* Optional hint row — Premium only */}
          {showHint && (
            <p className="text-xs text-muted-foreground italic line-clamp-2 pt-1 border-t border-slate-100">
              💡 {vm.hint}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
