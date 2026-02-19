import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFavorites, type FavoritesFilter } from "@/hooks/useFavorites";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useFamily } from "@/contexts/FamilyContext";
import { FavoriteCard } from "@/components/favorites/FavoriteCard";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { safeError } from "@/utils/safeLogger";
import { cn } from "@/lib/utils";

function getRecipeId(favorite: SavedFavorite): string | null {
  const f = favorite as { _recipeId?: string };
  return f._recipeId ?? (favorite.recipe as { id?: string })?.id ?? null;
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members } = useFamily();
  const { hasAccess } = useSubscription();
  const [filter, setFilter] = useState<FavoritesFilter>("all");
  const { favorites, removeFavorite } = useFavorites(filter);
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<{ id: string; title: string; member_id: string | null } | null>(null);

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await removeFavorite(id);
      toast({ title: "Рецепт удалён из избранного" });
    } catch (e: unknown) {
      safeError("DB Error in FavoritesPage handleRemove:", (e as Error).message);
      toast({ title: "Не удалось удалить", variant: "destructive" });
    }
  };

  const handleCardTap = (favorite: SavedFavorite) => {
    const recipeId = getRecipeId(favorite);
    if (recipeId) {
      navigate(`/recipe/${recipeId}`);
    }
  };

  return (
    <MobileLayout
      title="Избранное"
      headerMeta="Любимые рецепты для вашей семьи"
      headerRight={
        favorites.length > 0 ? (
          <span className="text-typo-caption font-medium text-muted-foreground tabular-nums">
            {favorites.length}
          </span>
        ) : undefined
      }
    >
      <div className="px-4 pb-6">
        {favorites.length > 0 && (
          <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "text-[13px] font-medium px-3 py-2 rounded-full border transition-colors",
                filter === "all" ? "bg-primary/[0.08] border-primary/20 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setFilter("family")}
              className={cn(
                "text-[13px] font-medium px-3 py-2 rounded-full border transition-colors",
                filter === "family" ? "bg-primary/[0.08] border-primary/20 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Семья
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setFilter(m.id)}
                className={cn(
                  "text-[13px] font-medium px-3 py-2 rounded-full border transition-colors",
                  filter === m.id ? "bg-primary/[0.08] border-primary/20 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {(m as { name?: string }).name ?? m.id}
              </button>
            ))}
          </div>
        )}

        {favorites.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
              <CardContent className="p-8 text-center">
                <div className="flex justify-center mb-4">
                  <Heart className="w-12 h-12 text-primary/40 stroke-[1.5]" />
                </div>
                <h3 className="text-typo-title font-semibold text-foreground mb-2">
                  Пока нет избранных рецептов
                </h3>
                <p className="text-typo-muted text-muted-foreground mb-6 leading-relaxed max-w-[260px] mx-auto">
                  Добавляйте понравившиеся рецепты сердечком — они появятся здесь.
                </p>
                <Button
                  onClick={() => navigate("/chat")}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <MessageCircle className="w-4 h-4" />
                  Перейти в чат
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {favorites.map((favorite, index) => (
              <FavoriteCard
                key={favorite.id}
                favorite={favorite}
                index={index}
                isPremium={hasAccess}
                members={members}
                onTap={() => handleCardTap(favorite)}
                onToggleFavorite={(e) => handleRemove(e, favorite.id)}
                onAddToPlan={hasAccess ? () => {
                  const id = getRecipeId(favorite);
                  const title = favorite.recipe?.title ?? "";
                  if (id) setAddToPlanRecipe({ id, title, member_id: favorite.member_id ?? null });
                } : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {addToPlanRecipe && (
        <AddToPlanSheet
          open={!!addToPlanRecipe}
          onOpenChange={(open) => !open && setAddToPlanRecipe(null)}
          recipeId={addToPlanRecipe.id}
          recipeTitle={addToPlanRecipe.title}
          defaultMemberId={addToPlanRecipe.member_id ?? null}
          onSuccess={() => toast({ title: "Добавлено в план" })}
        />
      )}
    </MobileLayout>
  );
}
