import { motion } from "framer-motion";
import { Heart, CalendarPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toFavoriteCardViewModel } from "./favoriteCardViewModel";
import type { SavedFavorite } from "@/hooks/useFavorites";

interface FavoriteCardProps {
  favorite: SavedFavorite;
  onTap: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  index?: number;
  /** Premium/trial: subtle highlight, star. */
  isPremium?: boolean;
  /** Family members for resolving recipe audience and "Для {name}" pill. */
  members: Array<{ id: string; name?: string; age_months?: number | null }>;
  /** Premium: show "В план" button. */
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Card
        className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-card active:scale-[0.995]"
        onClick={onTap}
      >
        <CardContent className="p-5">
          {/* Top row: Title (2 lines max) + heart */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-typo-body font-semibold text-foreground leading-snug line-clamp-2 flex-1 min-w-0">
              {vm.title}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-primary hover:bg-primary/10 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(e);
              }}
              aria-label="Убрать из избранного"
            >
              <Heart className="w-5 h-5 fill-primary" />
            </Button>
          </div>

          {/* Second row: description (1–2 lines, muted) */}
          {vm.subtitle && (
            <p className="text-typo-muted text-muted-foreground line-clamp-2 mb-3">{vm.subtitle}</p>
          )}

          {/* Meta row: time + "Для кого" pill + Add to plan */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-typo-caption text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <span>🕒</span>
              <span>{vm.cookTimeLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-typo-caption font-medium text-foreground/80 px-2.5 py-1">
              {audienceLabel}
            </span>
            {onAddToPlan && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-8 text-xs gap-1.5 ml-auto"
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

          {/* Ingredients: max 2–3 chips + "+N" (informational only) */}
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
