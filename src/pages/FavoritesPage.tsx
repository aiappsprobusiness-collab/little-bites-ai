import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Heart, MessageCircle, Plus } from "lucide-react";
import { APP_HEADER_ICON, APP_HEADER_TITLE, MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { useFavorites, type FavoritesFilter } from "@/hooks/useFavorites";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useFamily } from "@/contexts/FamilyContext";
import { FavoriteCard } from "@/components/favorites/FavoriteCard";
import { MyRecipeCard } from "@/components/favorites/MyRecipeCard";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { safeError } from "@/utils/safeLogger";
import { cn } from "@/lib/utils";

type FavoritesTab = "favorites" | "my_recipes";

function getRecipeId(favorite: SavedFavorite): string | null {
  const f = favorite as { _recipeId?: string };
  return f._recipeId ?? (favorite.recipe as { id?: string })?.id ?? null;
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { members } = useFamily();
  const { hasAccess } = useSubscription();
  const stateTab = (location.state as { tab?: FavoritesTab } | null)?.tab;
  const [tab, setTab] = useState<FavoritesTab>("favorites");
  useEffect(() => {
    if (stateTab === "my_recipes") setTab("my_recipes");
  }, [stateTab]);
  const [filter, setFilter] = useState<FavoritesFilter>("all");
  const { favorites, removeFavorite } = useFavorites(filter, { queryEnabled: tab === "favorites" });
  const { myRecipes } = useMyRecipes();
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<{ id: string; title: string; member_id: string | null } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formRecipeId, setFormRecipeId] = useState<string | null>(null);

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

  const openCreateForm = () => {
    setFormRecipeId(null);
    setFormOpen(true);
  };
  const openEditForm = (recipeId: string) => {
    setFormRecipeId(recipeId);
    setFormOpen(true);
  };

  return (
    <MobileLayout
      title={APP_HEADER_TITLE}
      headerTitleIcon={APP_HEADER_ICON}
      headerRight={
        tab === "favorites" && favorites.length > 0
          ? (
            <span className="text-typo-caption font-medium text-muted-foreground tabular-nums">
              {favorites.length}
            </span>
          )
          : tab === "my_recipes" && myRecipes.length > 0
            ? (
              <span className="text-typo-caption font-medium text-muted-foreground tabular-nums">
                {myRecipes.length}
              </span>
            )
            : undefined
      }
    >
      <div className="px-4 pb-4">
        <div className="sticky top-0 z-10 -mx-4 px-4 py-0.5 bg-background/95 backdrop-blur flex gap-2 mb-0.5 border-b border-border/50 pb-0.5">
          <button
            type="button"
            onClick={() => setTab("favorites")}
            className={cn(
              "text-[13px] font-medium px-4 py-2.5 rounded-full border transition-colors",
              tab === "favorites" ? "bg-primary/[0.08] border-primary/20 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Избранное
          </button>
          <button
            type="button"
            onClick={() => setTab("my_recipes")}
            className={cn(
              "text-[13px] font-medium px-4 py-2.5 rounded-full border transition-colors",
              tab === "my_recipes" ? "bg-[#6b7c3d]/15 border-[#6b7c3d]/40 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Мои рецепты
          </button>
        </div>

        {tab === "my_recipes" && (
          <>
            {myRecipes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center justify-center text-center py-12 px-4"
              >
                <div className="rounded-2xl border border-border bg-card shadow-soft p-8 w-full max-w-sm">
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Пока нет своих рецептов
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    Создайте рецепт — он будет храниться только у вас и его можно добавлять в план.
                  </p>
                  <Button
                    onClick={openCreateForm}
                    className="gap-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                    Создать свой рецепт
                  </Button>
                </div>
              </motion.div>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <Button
                    onClick={openCreateForm}
                    className="rounded-full gap-2 bg-[#6b7c3d] hover:bg-[#6b7c3d]/90"
                  >
                    <Plus className="w-4 h-4" />
                    Создать свой рецепт
                  </Button>
                </div>
<div className="space-y-3">
                {myRecipes.map((recipe, index) => (
                    <MyRecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      index={index}
                      onTap={() => navigate(`/recipe/${recipe.id}`)}
                      onAddToPlan={hasAccess ? () => setAddToPlanRecipe({ id: recipe.id, title: recipe.title ?? "", member_id: null }) : undefined}
                      onEdit={(e) => { e.stopPropagation(); openEditForm(recipe.id); }}
                      isPremium={hasAccess}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "favorites" && (
          <>
            {favorites.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
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
                className="flex flex-col items-center justify-center text-center py-12 px-4"
              >
                <div className="rounded-2xl border border-border bg-card shadow-soft p-8 w-full max-w-sm">
                  <div className="flex justify-center mb-2">
                    <Heart className="w-10 h-10 text-primary/40 stroke-[1.5]" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Пока нет избранных рецептов
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    Добавляйте понравившиеся рецепты сердечком — они появятся здесь.
                  </p>
                  <Button
                    onClick={() => navigate("/chat")}
                    className="gap-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Перейти в чат
                  </Button>
                </div>
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
          </>
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

      <MyRecipeFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        recipeId={formRecipeId}
        onSuccess={() => { setFormOpen(false); setFormRecipeId(null); }}
      />
    </MobileLayout>
  );
}
