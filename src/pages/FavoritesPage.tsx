import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { BookOpen, Heart, MessageCircle, Plus, Lock, ShoppingCart, ChevronLeft } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { TabEmptyState } from "@/components/ui/TabEmptyState";
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
  const { members } = useFamily();
  const { hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const locationState = location.state as {
    tab?: FavoritesTab;
    fromPlanSlot?: boolean;
    plannedDate?: string;
    mealType?: string;
    memberId?: string;
    /** Мягкий вход на вкладку списка после сборки с плана */
    shoppingListJustBuilt?: boolean;
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
  const [shoppingListFromPlanBuild] = useState(
    () => !!locationState?.shoppingListJustBuilt
  );
  const [shoppingPanelEntranceDone, setShoppingPanelEntranceDone] = useState(false);
  useEffect(() => {
    if (stateTab === "my_recipes") setTab("my_recipes");
    if (stateTab === "shopping_list") setTab("shopping_list");
  }, [stateTab]);

  useEffect(() => {
    if (!shoppingListFromPlanBuild) return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { tab: "shopping_list" as const },
    });
  }, [shoppingListFromPlanBuild, navigate, location.pathname, location.search]);

  const openShoppingList = () => {
    if (!hasAccess) {
      setPaywallReason("shopping_list");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      return;
    }
    setTab("shopping_list");
  };
  const { favorites, removeFavorite } = useFavorites("all", { queryEnabled: tab === "favorites" });
  const { myRecipes } = useMyRecipes();
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<{
    id: string;
    title: string;
    member_id: string | null;
    targetDayKey?: string;
    targetMealType?: string;
    /** `recipes.meal_type` для дефолта слота, если нет явного target из плана. */
    recipeMealType?: string | null;
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formRecipeId, setFormRecipeId] = useState<string | null>(null);
  const [ingredientFilterTerms, setIngredientFilterTerms] = useState<string[]>([]);
  const [ingredientFilterMode, setIngredientFilterMode] = useState<IngredientFilterMode>("include");

  const scope = tab === "favorites" ? "favorites" : "my_recipes";
  const { allowedRecipeIds } = useRecipeIdsByIngredients(ingredientFilterTerms, scope, {
    memberId: null,
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
        <div className="flex flex-col gap-3 mb-1">
          {tab !== "shopping_list" ? (
            <>
              <div
                className="flex rounded-xl bg-muted/35 p-1 gap-0.5"
                role="tablist"
                aria-label="Раздел коллекции рецептов"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "favorites"}
                  onClick={() => setTab("favorites")}
                  className={cn(
                    "flex-1 min-w-0 py-2.5 px-2 text-sm font-medium rounded-lg transition-all",
                    tab === "favorites"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/90"
                  )}
                >
                  Избранное
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "my_recipes"}
                  onClick={() => setTab("my_recipes")}
                  className={cn(
                    "flex-1 min-w-0 py-2.5 px-2 text-sm font-medium rounded-lg transition-all",
                    tab === "my_recipes"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/90"
                  )}
                >
                  Мои рецепты
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTab("favorites")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
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
          className="mb-4"
          endSlot={
            <button
              type="button"
              onClick={openShoppingList}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground/85 hover:text-foreground py-1.5 px-1 -mr-1 transition-colors whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden />
              Покупки
              {!hasAccess && <Lock className="w-3 h-3 opacity-50 shrink-0" aria-hidden />}
            </button>
          }
        />
        )}

        {tab === "shopping_list" && hasAccess && (
          <motion.div
            initial={
              shoppingListFromPlanBuild && !shoppingPanelEntranceDone
                ? { opacity: 0, y: 10 }
                : false
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.23, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => {
              if (shoppingListFromPlanBuild) setShoppingPanelEntranceDone(true);
            }}
          >
            <ShoppingListView />
          </motion.div>
        )}

        {tab === "my_recipes" && (
          <>
            {myRecipes.length === 0 ? (
              <TabEmptyState
                icon={BookOpen}
                title="Пока нет ваших рецептов"
                description="Добавьте свой рецепт, чтобы использовать его в плане"
                primaryAction={{
                  label: "Добавить рецепт",
                  icon: Plus,
                  onClick: openCreateForm,
                }}
              />
            ) : myRecipesFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                По выбранным ингредиентам ничего не найдено. Измените фильтр или сбросьте его.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground/80 mb-2.5">Свои рецепты в коллекции</p>
                <div className="flex justify-end mb-3">
                  <Button
                    onClick={openCreateForm}
                    className="rounded-full gap-2 bg-[#6b7c3d] hover:bg-[#6b7c3d]/90"
                  >
                    <Plus className="w-4 h-4" />
                    Создать свой рецепт
                  </Button>
                </div>
                <div className="space-y-4">
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
                                recipeMealType: recipe.mealType ?? null,
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
              <TabEmptyState
                icon={Heart}
                title="Пока нет сохранённых рецептов"
                description="Сохраняйте блюда, чтобы быстро добавлять их в план"
                primaryAction={{
                  label: "Перейти в чат",
                  icon: MessageCircle,
                  onClick: () => navigate("/chat"),
                }}
              />
            ) : favoritesFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                По выбранным ингредиентам ничего не найдено. Измените фильтр или сбросьте его.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground/80 mb-2.5">Сохранённые рецепты</p>
                <div className="space-y-4">
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
                                recipeMealType: favorite.recipe?.mealType ?? null,
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
              </>
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
          mealType={addToPlanRecipe.targetMealType ?? addToPlanRecipe.recipeMealType ?? null}
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
