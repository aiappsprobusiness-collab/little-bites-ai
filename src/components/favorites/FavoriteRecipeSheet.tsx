import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { getRecipeAudience } from "@/utils/recipeAudience";
import { getBenefitLabel } from "@/utils/ageCategory";
import { getMealLabel } from "@/data/mealLabels";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { IngredientChips } from "@/components/recipe/IngredientChips";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
import { RecipeMetaRow } from "@/components/recipe/RecipeMetaRow";

function normalizeIngredients(raw: unknown): ParsedIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (typeof item === "string") return item.trim() ? item : null;
      if (item && typeof item === "object" && "name" in item && typeof (item as { name: string }).name === "string") {
        return item as { name: string; amount?: string; substitute?: string };
      }
      const s = String(item).trim();
      return s ? s : null;
    })
    .filter(Boolean) as ParsedIngredient[];
}

function normalizeSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
      .filter((t: string) => t.trim().length > 0);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

interface FavoriteRecipeSheetProps {
  favorite: SavedFavorite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPremium?: boolean;
  members: Array<{ id: string; age_months?: number | null }>;
}

export function FavoriteRecipeSheet({ favorite, open, onOpenChange, isPremium = false, members }: FavoriteRecipeSheetProps) {
  if (!favorite) return null;

  const audience = getRecipeAudience(favorite.recipe, members);
  const recipe = favorite.recipe;
  const title = typeof recipe?.title === "string" ? recipe.title.trim() : "Рецепт";
  const description = typeof recipe?.description === "string" ? recipe.description.trim() : "";
  const cookingTime = recipe?.cookingTime ?? (recipe as { cooking_time?: number })?.cooking_time;
  const numTime = typeof cookingTime === "number" ? cookingTime : typeof cookingTime === "string" ? parseInt(String(cookingTime), 10) : undefined;
  const ingredients = normalizeIngredients(recipe?.ingredients);
  const steps = normalizeSteps(recipe?.steps);
  const mealLabel = getMealLabel((recipe as { mealType?: string })?.mealType) ?? null;
  const ageMonths = favorite.member_id != null
    ? members.find((m) => m.id === favorite.member_id)?.age_months ?? undefined
    : undefined;
  const chefAdvice = (recipe as { chefAdvice?: string }).chefAdvice;
  const advice = (recipe as { advice?: string }).advice;
  const tip = (isPremium && chefAdvice?.trim()) ? chefAdvice.trim() : (advice?.trim() ?? chefAdvice?.trim());
  const isChefTip = isPremium && chefAdvice?.trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85dvh] rounded-t-3xl border-t px-4 pt-4 pb-8 overflow-x-hidden"
      >
        <SheetHeader className="text-left pb-3">
          <SheetTitle className="text-typo-title font-semibold text-foreground">{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(85vh-80px)] pr-2">
          <div className="space-y-4 pb-6 max-w-[100%]">
            <RecipeHeader
              variant="chat"
              hideTitle
              mealLabel={mealLabel}
              cookingTimeMinutes={numTime ?? null}
              title={title}
              benefitLabel={description ? getBenefitLabel(ageMonths) : null}
              description={description || null}
            />
            <IngredientChips ingredients={ingredients} variant="full" />
            <RecipeMetaRow>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-light border border-primary-border px-2 py-0.5 text-[11px] font-medium text-foreground">
                {audience.showChildEmoji && <span>👶</span>}
                <span>{audience.label}</span>
              </span>
            </RecipeMetaRow>
            {tip && (
              isChefTip ? (
                <ChefAdviceCard title="Совет от шефа" body={tip} isChefTip />
              ) : (
                <ChefAdviceCard title="Мини-совет" body={tip} isChefTip={false} />
              )
            )}
            <RecipeSteps steps={steps} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
