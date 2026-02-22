import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ingredientDisplayLabel } from "@/types/recipe";
import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { getRecipeAudience } from "@/utils/recipeAudience";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

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
  /** Premium/trial: show hint. Free: no hint. */
  isPremium?: boolean;
  /** Family members for resolving recipe audience from recipe.member_id. */
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
  const mealType = (recipe as { mealType?: string })?.mealType;
  const mealLabel = mealType && MEAL_LABELS[mealType] ? MEAL_LABELS[mealType] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85dvh] rounded-t-3xl border-t px-4 pt-4 pb-8"
      >
        <SheetHeader className="text-left pb-3">
          <SheetTitle className="text-typo-title font-semibold text-foreground">{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(85vh-80px)] pr-2">
          <div className="space-y-5 pb-6">
            {/* Meta row: time | meal type | audience chip */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-typo-muted text-muted-foreground">
              {(Number.isFinite(numTime) && numTime != null) && (
                <span>🕒 {numTime} мин</span>
              )}
              {mealLabel && (
                <span>🍽 {mealLabel}</span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200/60 px-2 py-0.5 text-typo-caption font-medium text-slate-700">
                {audience.showChildEmoji && <span>👶</span>}
                <span>{audience.label}</span>
              </span>
            </div>

            {/* Description */}
            {description && (
              <div>
                <p className="text-typo-muted text-muted-foreground leading-relaxed">{description}</p>
              </div>
            )}

            {/* Совет: chefAdvice (Premium) или advice (Free) — правила как в ChatMessage */}
            {(() => {
              const chefAdvice = (recipe as { chefAdvice?: string }).chefAdvice;
              const advice = (recipe as { advice?: string }).advice;
              const tip = (isPremium && chefAdvice?.trim()) ? chefAdvice.trim() : (advice?.trim() ?? chefAdvice?.trim());
              return tip ? (
                <div>
                  <h3 className="text-typo-h2 font-bold text-foreground mb-2">
                    {isPremium && chefAdvice?.trim() ? "💡 Совет от шефа" : "💡 Мини-совет"}
                  </h3>
                  <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-snug">{tip}</p>
                </div>
              ) : null;
            })()}

            {/* Ingredients */}
            {ingredients.length > 0 && (
              <div>
                <h3 className="text-typo-h2 font-bold text-foreground mb-2">Ингредиенты</h3>
                <ul className="space-y-1.5">
                  {ingredients.map((ing, i) => {
                    const text = (typeof ing === "string" ? ing : ingredientDisplayLabel(ing)) || "Ингредиент";
                    return (
                      <li key={i} className="flex items-center gap-2 text-typo-muted text-foreground min-w-0">
                        <span className="text-muted-foreground shrink-0">•</span>
                        <span className="min-w-0 max-w-full truncate">{text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Steps */}
            {steps.length > 0 && (
              <div>
                <h3 className="text-typo-h2 font-bold text-foreground mb-2">Приготовление</h3>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <span className="text-typo-muted font-bold text-primary shrink-0">{idx + 1}.</span>
                      <p className="text-typo-muted text-foreground leading-relaxed flex-1">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
