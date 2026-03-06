import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import { DEMO_RECIPE } from "@/data/demoRecipe";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { trackLandingEvent } from "@/utils/landingAnalytics";

interface DemoRecipeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const demoRecipeHeader = {
  mealLabel: null as string | null,
  cookingTimeMinutes: null as number | null,
  title: DEMO_RECIPE.title,
  benefitLabel: null as string | null,
  description: null as string | null,
};

export function DemoRecipeSheet({ open, onOpenChange }: DemoRecipeSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showValueStep, setShowValueStep] = useState(false);

  const handleSaveRecipe = () => {
    trackLandingEvent("landing_demo_save_click");
    if (user) {
      onOpenChange(false);
      toast({ title: "Сохранено", description: "Рецепт добавлен в избранное" });
      return;
    }
    setShowValueStep(true);
  };

  const goToSignup = () => {
    onOpenChange(false);
    setShowValueStep(false);
    navigate("/auth", { replace: true, state: { tab: "signup" } });
  };

  const goToLogin = () => {
    onOpenChange(false);
    setShowValueStep(false);
    navigate("/auth", { replace: true, state: { tab: "login" } });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setShowValueStep(false);
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90dvh] flex flex-col p-0"
      >
        {showValueStep ? (
          <>
            <SheetHeader className="px-4 pt-4 pb-2 text-left border-b border-border/60 shrink-0">
              <SheetTitle className="text-xl font-semibold text-foreground">
                Сохраним рецепт и подберём меню под вашего ребёнка
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">✓ учтём аллергии</li>
                <li className="flex items-center gap-2">✓ запомним что ребёнок не любит</li>
                <li className="flex items-center gap-2">✓ подберём блюда по возрасту</li>
              </ul>
              <div className="flex flex-col gap-3">
                <Button className="w-full rounded-xl h-12 font-semibold" onClick={goToSignup}>
                  Создать аккаунт
                </Button>
                <Button variant="outline" className="w-full rounded-xl h-12 font-semibold" onClick={goToLogin}>
                  У меня уже есть аккаунт
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="px-4 pt-4 pb-2 text-left border-b border-border/60 shrink-0">
              <SheetTitle className="text-xl font-semibold text-foreground">
                {DEMO_RECIPE.title}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <RecipeCard
                variant="full"
                header={demoRecipeHeader}
                ingredients={DEMO_RECIPE.ingredients}
                steps={DEMO_RECIPE.steps}
                chefAdvice={DEMO_RECIPE.chefAdvice}
                showChefTip
                showIngredientChips
                className="border-0 shadow-none bg-transparent p-0"
              />
            </div>
            <SheetFooter className="p-4 border-t border-border/60 shrink-0">
              <Button
                className="w-full rounded-xl h-12 font-semibold"
                onClick={handleSaveRecipe}
              >
                Сохранить рецепт
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
