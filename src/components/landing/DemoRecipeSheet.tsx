import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { DEMO_RECIPE } from "@/data/demoRecipe";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { trackLandingEvent } from "@/utils/landingAnalytics";

interface DemoRecipeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoRecipeSheet({ open, onOpenChange }: DemoRecipeSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSaveRecipe = () => {
    trackLandingEvent("landing_demo_save_click");
    if (user) {
      onOpenChange(false);
      toast({ title: "Сохранено", description: "Рецепт добавлен в избранное" });
      return;
    }
    onOpenChange(false);
    toast({
      title: "Создайте аккаунт",
      description: "Создайте аккаунт, чтобы сохранить рецепт и получить меню на неделю",
    });
    navigate("/auth", { replace: true });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90dvh] flex flex-col p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2 text-left border-b border-border/60">
          <SheetTitle className="text-xl font-semibold text-foreground">
            {DEMO_RECIPE.title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Ингредиенты
            </h3>
            <ul className="list-disc list-inside text-foreground space-y-1">
              {DEMO_RECIPE.ingredients.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Приготовление
            </h3>
            <ol className="list-decimal list-inside text-foreground space-y-2">
              {DEMO_RECIPE.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
          <ChefAdviceCard
            title="Совет шефа"
            body={DEMO_RECIPE.chefAdvice}
            isChefTip
          />
        </div>
        <SheetFooter className="p-4 border-t border-border/60">
          <Button
            className="w-full rounded-xl h-12 font-semibold"
            onClick={handleSaveRecipe}
          >
            Сохранить рецепт
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
