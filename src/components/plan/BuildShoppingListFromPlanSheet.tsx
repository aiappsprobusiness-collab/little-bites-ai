import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useShoppingList, type ShoppingListSyncMeta } from "@/hooks/useShoppingList";
import { loadPlanShoppingIngredients, planShoppingIngredientsQueryKey } from "@/hooks/usePlanShoppingIngredients";
import { loadPlanSignature, planSignatureQueryKey } from "@/hooks/usePlanSignature";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type BuildShoppingListFromPlanSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Как в meal_plans_v2 для видимого плана (см. mealPlanMemberScope). */
  planMemberId: string | null;
  hasAccess: boolean;
  /** После успешной сборки открыть вкладку списка в Избранном. */
  navigateToShoppingTabOnSuccess?: boolean;
};

/**
 * Явная сборка списка покупок из текущего меню (снимок). Не синхронизирует список автоматически при смене плана.
 */
export function BuildShoppingListFromPlanSheet({
  open,
  onOpenChange,
  planMemberId,
  hasAccess,
  navigateToShoppingTabOnSuccess = false,
}: BuildShoppingListFromPlanSheetProps) {
  const [range, setRange] = useState<"today" | "week">("today");
  const [pending, setPending] = useState(false);
  const { user } = useAuth();
  const { replaceItems, listId } = useShoppingList();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setRange("today");
  }, [open]);

  const handleBuild = async () => {
    if (!user?.id || !listId || !hasAccess) return;
    setPending(true);
    try {
      const planIngredients = await loadPlanShoppingIngredients(user.id, range, planMemberId);
      const planSignature = await loadPlanSignature(user.id, range, planMemberId);
      if (planIngredients.length === 0) {
        toast({
          title: "В меню нет блюд за выбранный период",
          description: "Добавьте рецепты в план и соберите список снова.",
        });
        return;
      }
      const payload = planIngredients.map((ing) => ({
        name: ing.name,
        amount: ing.displayAmount ?? ing.amount,
        unit: ing.displayUnit ?? ing.unit,
        category: ing.category,
        source_recipes: ing.source_recipes?.length ? ing.source_recipes : undefined,
      }));
      const newSyncMeta: ShoppingListSyncMeta = {
        last_synced_range: range,
        last_synced_member_id: planMemberId ?? null,
        last_synced_plan_signature: planSignature ?? "",
        last_synced_at: new Date().toISOString(),
      };
      await replaceItems({ items: payload, syncMeta: newSyncMeta });
      await queryClient.invalidateQueries({ queryKey: planShoppingIngredientsQueryKey(user.id, range, planMemberId) });
      await queryClient.invalidateQueries({ queryKey: planSignatureQueryKey(user.id, range, planMemberId) });
      toast({ title: "Список собран из меню", description: "Можно редактировать и отмечать купленное." });
      onOpenChange(false);
      if (navigateToShoppingTabOnSuccess) {
        navigate("/favorites", { state: { tab: "shopping_list" } });
      }
    } catch {
      toast({ variant: "destructive", title: "Не удалось собрать список" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Собрать список продуктов</SheetTitle>
          <SheetDescription>
            Соберём продукты из плана, суммируем одинаковые позиции. Список станет вашим черновиком: его можно менять вручную;
            изменения в плане не перезапишут его сами по себе.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Период</p>
          <div className="flex rounded-full border border-border overflow-hidden bg-muted/30">
            <button
              type="button"
              onClick={() => setRange("today")}
              className={cn(
                "flex-1 px-3 py-2.5 text-[13px] font-medium transition-colors",
                range === "today" ? "bg-[#6b7c3d] text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Сегодня
            </button>
            <button
              type="button"
              disabled={!hasAccess}
              onClick={() => setRange("week")}
              title={!hasAccess ? "Доступно в Premium" : undefined}
              className={cn(
                "flex-1 px-3 py-2.5 text-[13px] font-medium transition-colors",
                range === "week" ? "bg-[#6b7c3d] text-white" : "text-muted-foreground hover:text-foreground",
                !hasAccess && "opacity-50 cursor-not-allowed"
              )}
            >
              Неделя {!hasAccess ? "· Premium" : ""}
            </button>
          </div>
        </div>
        <SheetFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            className="w-full sm:flex-1 bg-[#6b7c3d] hover:bg-[#5a6b32] text-white"
            disabled={pending || !listId}
            onClick={() => void handleBuild()}
          >
            {pending ? "Собираем…" : "Собрать список"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
