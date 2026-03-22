import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Heart, MessageCircle, Plus, Lock, ShoppingCart, ChevronLeft } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useFamily } from "@/contexts/FamilyContext";
import { useAppStore } from "@/store/useAppStore";
import { FavoriteCard } from "@/components/favorites/FavoriteCard";
import { MyRecipeCard } from "@/components/favorites/MyRecipeCard";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { IngredientFilterBar } from "@/components/favorites/IngredientFilterBar";
import { ShoppingListView } from "@/components/favorites/ShoppingListView";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { useRecipeIdsByIngredients } from "@/hooks/useRecipeIdsByIngredients";
import type { SavedFavorite } from "@/hooks/useFavorites";
import type { IngredientFilterMode } from "@/components/favorites/IngredientFilterBar";
import { safeError } from "@/utils/safeLogger";
import { cn } from "@/lib/utils";

type FavoritesTab = "favorites" | "my_recipes" | "shopping_list";

function getRecipeId(favorite: SavedFavorite): string | null {
  const f = favorite as { _recipeId?: string };
  return f._recipeId ?? (favorite.recipe as { id?: string })?.id ?? null;
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { members, selectedMemberId } = useFamily();
  const { hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const locationState = location.state as {
    tab?: FavoritesTab;
    fromPlanSlot?: boolean;
    plannedDate?: string;
    mealType?: string;
    memberId?: string;
  } | null;
  const stateTab = locationState?.tab;
  const planSlotFromNav =
    locationState?.fromPlanSlot && locationState.plannedDate && locationState.mealType
      ? {
          plannedDate: locationState.plannedDate,
          mealType: locationState.mealType,
          memberId: (locationState.memberId ?? null) as string | null,
        }
      : null;
  const [tab, setTab] = useState<FavoritesTab>("favorites");
  useEffect(() => {
    if (stateTab === "my_recipes") setTab("my_recipes");
    if (stateTab === "shopping_list") setTab("shopping_list");
  }, [stateTab]);

  const openShoppingList = () => {
    if (!hasAccess) {
      setPaywallCustomMessage("Список продуктов доступен в Premium");
      setShowPaywall(true);
      return;
    }
    setTab("shopping_list");
  };
  const favoritesFilter = selectedMemberId === null || selectedMemberId === "family" ? "family" : selectedMemberId;
  const { favorites, removeFavorite } = useFavorites(favoritesFilter, { queryEnabled: tab === "favorites" });
  const { myRecipes } = useMyRecipes();
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<{
    id: string;
    title: string;
    member_id: string | null;
    targetDayKey?: string;
    targetMealType?: string;
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formRecipeId, setFormRecipeId] = useState<string | null>(null);
  const [ingredientFilterTerms, setIngredientFilterTerms] = useState<string[]>([]);
  const [ingredientFilterMode, setIngredientFilterMode] = useState<IngredientFilterMode>("include");

  const scope = tab === "favorites" ? "favorites" : "my_recipes";
  const memberIdForFilter = favoritesFilter === "family" || favoritesFilter === "all" ? null : favoritesFilter;
  const { allowedRecipeIds } = useRecipeIdsByIngredients(ingredientFilterTerms, scope, {
    memberId: tab === "favorites" ? memberIdForFilter : null,
    mode: ingredientFilterMode,
    enabled: true,
  });

  const favoritesFiltered =
    allowedRecipeIds == null
      ? favorites
      : favorites.filter((f) => {
          const id = getRecipeId(f);
          return id != null && allowedRecipeIds.has(id);
        });
  const myRecipesFiltered =
    allowedRecipeIds == null
      ? myRecipes
      : myRecipes.filter((r) => allowedRecipeIds.has(r.id));

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
    const preloadedTitle = favorite.recipe?.title ?? undefined;
    if (recipeId) {
      navigate(`/recipe/${recipeId}`, {
        state: {
          fromFavorites: true,
          preloadedTitle,
          ...(planSlotFromNav
            ? {
                fromMealPlan: true,
                plannedDate: planSlotFromNav.plannedDate,
                mealType: planSlotFromNav.mealType,
                ...(planSlotFromNav.memberId != null ? { memberId: planSlotFromNav.memberId } : {}),
              }
            : {}),
        },
      });
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
    <MobileLayout>
      <div className="px-4 pb-4 overflow-x-hidden max-w-full">
        {/* Табы рецептов + вторичный вход к списку покупок (сборка — с экрана План). */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setTab("favorites")}
                className={cn(
                  "text-[13px] font-medium px-4 py-2.5 rounded-full border transition-colors",
                  tab === "favorites" ? "bg-[#6b7c3d]/15 border-[#6b7c3d]/40 text-foreground" : "bg-transparent border-border text-muted-foreground hover:text-foreground"
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
            {tab !== "shopping_list" && (
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={openShoppingList}
                  className="text-[13px] font-medium inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Покупки
                  {!hasAccess && <Lock className="w-3 h-3 opacity-70" aria-hidden />}
                </button>
                <MemberSelectorButton className="shrink-0" />
              </div>
            )}
          </div>
          {tab === "shopping_list" && (
            <button
              type="button"
              onClick={() => setTab("favorites")}
              className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground w-fit -mt-0.5"
            >
              <ChevronLeft className="w-4 h-4" />
              К избранному и рецептам
            </button>
          )}
        </div>

        {(tab === "favorites" || tab === "my_recipes") && (
        <IngredientFilterBar
          selectedIngredients={ingredientFilterTerms}
          onSelectedChange={setIngredientFilterTerms}
          mode={ingredientFilterMode}
          onModeChange={setIngredientFilterMode}
          className="mb-3"
        />
        )}

        {tab === "shopping_list" && hasAccess && <ShoppingListView />}

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
            ) : myRecipesFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                По выбранным ингредиентам ничего не найдено. Измените фильтр или сбросьте его.
              </p>
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
                {myRecipesFiltered.map((recipe, index) => (
                    <MyRecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      index={index}
                      onTap={() =>
                        navigate(`/recipe/${recipe.id}`, {
                          state: {
                            fromFavorites: true,
                            preloadedTitle: recipe.title ?? undefined,
                            ...(planSlotFromNav
                              ? {
                                  fromMealPlan: true,
                                  plannedDate: planSlotFromNav.plannedDate,
                                  mealType: planSlotFromNav.mealType,
                                  ...(planSlotFromNav.memberId != null ? { memberId: planSlotFromNav.memberId } : {}),
                                }
                              : {}),
                          },
                        })
                      }
                      onAddToPlan={
                        hasAccess
                          ? () =>
                              setAddToPlanRecipe({
                                id: recipe.id,
                                title: recipe.title ?? "",
                                member_id: planSlotFromNav?.memberId ?? null,
                                ...(planSlotFromNav
                                  ? { targetDayKey: planSlotFromNav.plannedDate, targetMealType: planSlotFromNav.mealType }
                                  : {}),
                              })
                          : undefined
                      }
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
            ) : favoritesFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                По выбранным ингредиентам ничего не найдено. Измените фильтр или сбросьте его.
              </p>
            ) : (
              <div className="space-y-3">
                {favoritesFiltered.map((favorite, index) => (
                  <FavoriteCard
                    key={favorite.id}
                    favorite={favorite}
                    index={index}
                    isPremium={hasAccess}
                    members={members}
                    onTap={() => handleCardTap(favorite)}
                    onToggleFavorite={(e) => handleRemove(e, favorite.id)}
                    onAddToPlan={
                      hasAccess
                        ? () => {
                            const id = getRecipeId(favorite);
                            const title = favorite.recipe?.title ?? "";
                            if (id) {
                              setAddToPlanRecipe({
                                id,
                                title,
                                member_id: planSlotFromNav?.memberId ?? favorite.member_id ?? null,
                                ...(planSlotFromNav
                                  ? { targetDayKey: planSlotFromNav.plannedDate, targetMealType: planSlotFromNav.mealType }
                                  : {}),
                              });
                            }
                          }
                        : undefined
                    }
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
          defaultDayKey={addToPlanRecipe.targetDayKey}
          mealType={addToPlanRecipe.targetMealType ?? null}
          targetSlot={
            addToPlanRecipe.targetDayKey && addToPlanRecipe.targetMealType
              ? { dayKey: addToPlanRecipe.targetDayKey, mealType: addToPlanRecipe.targetMealType }
              : null
          }
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
