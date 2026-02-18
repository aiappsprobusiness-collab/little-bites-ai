import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useFamily } from "@/contexts/FamilyContext";
import { FavoriteCard } from "@/components/favorites/FavoriteCard";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { safeError } from "@/utils/safeLogger";

function getRecipeId(favorite: SavedFavorite): string | null {
  const f = favorite as { _recipeId?: string };
  return f._recipeId ?? (favorite.recipe as { id?: string })?.id ?? null;
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members } = useFamily();
  const { hasAccess } = useSubscription();
  const { favorites, removeFavorite } = useFavorites();

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
              />
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
