import { useState, useEffect } from "react";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useShoppingList, type ShoppingListSyncMeta } from "@/hooks/useShoppingList";
import { loadPlanShoppingIngredients, planShoppingIngredientsQueryKey } from "@/hooks/usePlanShoppingIngredients";
import { loadPlanSignature, planSignatureQueryKey } from "@/hooks/usePlanSignature";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { markShoppingListEntranceStagger } from "@/utils/shopping/shoppingListEntrance";

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
  const { replaceItems, listId } = useShoppingList({ enabled: open });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setRange("today");
  }, [open]);

  useEffect(() => {
    if (open) {
      trackPaywallTextShown("build_shopping_list_sheet", { surface: "shopping_list_sheet" });
    }
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
        merge_key: ing.merge_key,
        source_contributions: ing.source_contributions?.length ? ing.source_contributions : undefined,
        aggregation_unit: ing.aggregation_unit,
        dual_display_amount_sum: ing.dual_display_amount_sum,
        dual_display_unit: ing.dual_display_unit,
      }));
      const newSyncMeta: ShoppingListSyncMeta = {
        last_synced_range: range,
        last_synced_member_id: planMemberId ?? null,
        last_synced_plan_signature: planSignature ?? "",
        last_synced_at: new Date().toISOString(),
      };
      await replaceItems({ items: payload, syncMeta: newSyncMeta });
      markShoppingListEntranceStagger();
      await queryClient.invalidateQueries({ queryKey: planShoppingIngredientsQueryKey(user.id, range, planMemberId) });
      await queryClient.invalidateQueries({ queryKey: planSignatureQueryKey(user.id, range, planMemberId) });
      toast({ title: "Список собран из меню", description: "Можно редактировать и отмечать купленное." });
      onOpenChange(false);
      if (navigateToShoppingTabOnSuccess) {
        navigate("/favorites", { state: { tab: "shopping_list", shoppingListJustBuilt: true } });
      }
    } catch {
      toast({ variant: "destructive", title: "Не удалось собрать список" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-6 pb-6">
        <SheetHeader className="text-left space-y-3 pr-10">
          <SheetTitle className="text-typo-body font-semibold text-foreground leading-tight">
            Собрать список продуктов
          </SheetTitle>
          <SheetDescription className="text-typo-body font-normal text-foreground/90 leading-relaxed">
            Соберём продукты из плана, суммируем одинаковые позиции. Список станет вашим черновиком: его можно менять вручную;
            изменения в плане не перезапишут его сами по себе.
          </SheetDescription>
        </SheetHeader>
        <div className="py-5 space-y-3">
          <p className="text-typo-body font-semibold text-foreground">Период</p>
          <div className="flex rounded-full border border-border overflow-hidden bg-muted/30">
            <button
              type="button"
              onClick={() => setRange("today")}
              className={cn(
                "flex-1 min-h-[48px] px-3 py-3 text-typo-body font-semibold transition-colors touch-manipulation",
                range === "today" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Сегодня
            </button>
            <button
              type="button"
              disabled={!hasAccess}
              onClick={() => setRange("week")}
              title={!hasAccess ? "Неделя — в полной версии" : undefined}
              className={cn(
                "flex-1 min-h-[48px] px-3 py-3 text-typo-body font-semibold transition-colors touch-manipulation",
                range === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                !hasAccess && "opacity-50 cursor-not-allowed"
              )}
            >
              Неделя {!hasAccess ? "· полная версия" : ""}
            </button>
          </div>
        </div>
        <SheetFooter className="flex-col sm:flex-row gap-3 pt-2 sm:pt-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto min-h-12 text-typo-body font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <motion.div
            className="w-full sm:flex-1"
            whileTap={pending || !listId ? undefined : { scale: 0.97 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
          >
            <Button
              type="button"
              className="w-full min-h-12 text-typo-body font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={pending || !listId}
              onClick={() => void handleBuild()}
            >
              {pending ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-90" aria-hidden />
                  Собираем список…
                </span>
              ) : (
                "Собрать список"
              )}
            </Button>
          </motion.div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
