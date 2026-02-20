import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAssignRecipeToPlanSlot } from "@/hooks/useAssignRecipeToPlanSlot";
import { useFavorites } from "@/hooks/useFavorites";
import { useSubscription } from "@/hooks/useSubscription";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { useQueryClient } from "@tanstack/react-query";
import { applyReplaceSlotToPlanCache } from "@/utils/planCache";

const FAVORITES_FREE_LIMIT = 15;

function getRecipeId(f: SavedFavorite): string | null {
  return (f as { _recipeId?: string })._recipeId ?? (f.recipe as { id?: string })?.id ?? f.recipe_id ?? null;
}

function getRecipeTitle(f: SavedFavorite): string {
  const r = f.recipe;
  if (r && typeof r === "object" && "title" in r && typeof (r as { title?: string }).title === "string") {
    return (r as { title: string }).title;
  }
  return "Рецепт";
}

export interface PoolExhaustedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDayKey: string;
  mealType: string;
  memberId: string | null;
  memberName?: string;
  allergies?: string[];
  preferences?: string[];
  mealPlansKeyWeek: unknown[];
  mealPlansKeyDay: unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
}

export function PoolExhaustedSheet({
  open,
  onOpenChange,
  selectedDayKey,
  mealType,
  memberId,
  memberName,
  allergies = [],
  preferences = [],
  mealPlansKeyWeek,
  mealPlansKeyDay,
  queryClient,
}: PoolExhaustedSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;

  const [showFavoritesPicker, setShowFavoritesPicker] = useState(false);
  const { assignRecipeToPlanSlot, isAssigning } = useAssignRecipeToPlanSlot(memberId);
  const { favorites, isLoading: favoritesLoading } = useFavorites("all");

  const displayFavorites = isFree ? favorites.slice(0, FAVORITES_FREE_LIMIT) : favorites;

  const handlePickFavorite = async (recipeId: string, recipeTitle: string) => {
    try {
      await assignRecipeToPlanSlot({
        member_id: memberId,
        day_key: selectedDayKey,
        meal_type: mealType,
        recipe_id: recipeId,
        recipe_title: recipeTitle,
      });
      applyReplaceSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, {
        dayKey: selectedDayKey,
        mealType,
        newRecipeId: recipeId,
        title: recipeTitle,
        plan_source: "pool",
      }, memberId);
      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2"] });
      toast({ description: "Рецепт добавлен в план" });
      setShowFavoritesPicker(false);
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось добавить" });
    }
  };

  const handleGenerateInChat = () => {
    if (isFree) {
      setPaywallCustomMessage("Сгенерировать рецепт в чате доступно в Premium.");
      setShowPaywall(true);
      onOpenChange(false);
      return;
    }
    const mealLabel = mealType === "breakfast" ? "завтрака" : mealType === "lunch" ? "обеда" : mealType === "snack" ? "полдника" : "ужина";
    const profilePart = memberName ? ` для ${memberName}` : "";
    const allergyPart = allergies.length > 0 ? ` Аллергии: ${allergies.slice(0, 5).join(", ")}.` : "";
    const prefillMessage = `Придумай рецепт на ${mealLabel}${profilePart}.${allergyPart}${preferences.length > 0 ? ` Учтём: ${preferences.slice(0, 3).join(", ")}.` : ""}`;
    onOpenChange(false);
    navigate("/chat", { state: { prefillMessage, prefillOnly: false } });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle className="text-left">Нет подходящих рецептов</SheetTitle>
          </SheetHeader>
          <p className="text-muted-foreground text-sm">
            Выберите рецепт из избранного или сгенерируйте новый в чате.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full rounded-xl"
              onClick={() => setShowFavoritesPicker(true)}
            >
              Добавить из избранного
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={handleGenerateInChat}
            >
              {isFree ? "✨ Сгенерировать в чате (Premium)" : "Сгенерировать в чате"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showFavoritesPicker} onOpenChange={setShowFavoritesPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-left">Выберите рецепт из избранного</SheetTitle>
          </SheetHeader>
          {isFree && (
            <p className="text-muted-foreground text-xs">
              Free: до {FAVORITES_FREE_LIMIT} рецептов в избранном. Откройте Premium для безлимита.
            </p>
          )}
          <div className="flex-1 overflow-y-auto pb-4">
            {favoritesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayFavorites.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Нет рецептов в избранном</p>
            ) : (
              <ul className="space-y-2">
                {displayFavorites.map((favorite) => {
                  const recipeId = getRecipeId(favorite);
                  const title = getRecipeTitle(favorite);
                  if (!recipeId) return null;
                  return (
                    <li key={favorite.id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
                        onClick={() => handlePickFavorite(recipeId, title)}
                        disabled={isAssigning}
                      >
                        {title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
