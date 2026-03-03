import { useEffect, useState } from "react";
import { Copy, Share2, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useShoppingList, type ProductCategory } from "@/hooks/useShoppingList";
import { usePlanShoppingIngredients } from "@/hooks/usePlanShoppingIngredients";
import { useFamily } from "@/contexts/FamilyContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: ProductCategory[] = ["vegetables", "fruits", "dairy", "meat", "grains", "other"];
const CATEGORY_LABEL: Record<ProductCategory, string> = {
  vegetables: "Овощи",
  fruits: "Фрукты",
  dairy: "Молочное",
  meat: "Мясо и рыба",
  grains: "Крупы и злаки",
  other: "Прочее",
};

function formatItemLine(item: { name: string; amount: number | null; unit: string | null }): string {
  const a = item.amount != null && item.amount > 0 ? item.amount : null;
  const u = item.unit?.trim();
  if (a != null && u) return `${item.name} — ${a} ${u}`;
  if (a != null) return `${item.name} — ${a}`;
  return item.name;
}

export function ShoppingListView() {
  const { toast } = useToast();
  const { selectedMemberId } = useFamily();
  const memberId = selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId;
  const [range, setRange] = useState<"today" | "week">("today");

  const {
    listId,
    items,
    isLoading: listLoading,
    setItemPurchased,
    clearList,
    replaceItems,
  } = useShoppingList();

  const { data: planIngredients, isLoading: planLoading } = usePlanShoppingIngredients(range, memberId);

  // Синхронизация списка с планом при смене дня/недели или профиля (только когда данные плана загружены)
  useEffect(() => {
    if (!listId || planIngredients === undefined) return;
    if (planIngredients.length === 0) {
      clearList().catch(() => {});
      return;
    }
    const payload = planIngredients.map((ing) => ({
      name: ing.name,
      amount: ing.displayAmount ?? ing.amount,
      unit: ing.displayUnit ?? ing.unit,
      category: ing.category,
    }));
    replaceItems(payload).catch(() => toast({ variant: "destructive", title: "Не удалось обновить список" }));
  }, [range, memberId, listId, planIngredients, replaceItems, clearList, toast]);

  const handleCopy = () => {
    const lines = items.map((i) => (i.is_purchased ? `☑ ${formatItemLine(i)}` : `☐ ${formatItemLine(i)}`));
    const text = lines.join("\n") || "Список пуст";
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Скопировано" }),
      () => toast({ variant: "destructive", title: "Не удалось скопировать" })
    );
  };

  const handleShare = () => {
    const lines = items.map((i) => `• ${formatItemLine(i)}`);
    const text = `Список покупок\n\n${lines.join("\n")}` || "Список пуст";
    if (navigator.share) {
      navigator.share({ title: "Список покупок", text }).then(
        () => toast({ title: "Поделились" }),
        (e: unknown) => {
          if ((e as Error)?.name !== "AbortError") toast({ variant: "destructive", title: "Не удалось поделиться" });
        }
      );
    } else {
      navigator.clipboard?.writeText(text).then(
        () => toast({ title: "Скопировано" }),
        () => toast({ variant: "destructive", title: "Не удалось скопировать" })
      );
    }
  };

  const handleClear = () => {
    clearList()
      .then(() => toast({ title: "Список очищен" }))
      .catch(() => toast({ variant: "destructive", title: "Не удалось очистить" }));
  };

  const loading = listLoading || planLoading;
  const hasPlanData = (planIngredients?.length ?? 0) > 0;
  const emptyState = !loading && items.length === 0;

  const byCategory = items.reduce((acc, item) => {
    const cat = (item.category ?? "other") as ProductCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<ProductCategory, typeof items>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border overflow-hidden bg-muted/30">
          <button
            type="button"
            onClick={() => setRange("today")}
            className={cn(
              "px-3 py-2 text-[13px] font-medium transition-colors",
              range === "today" ? "bg-[#6b7c3d] text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => setRange("week")}
            className={cn(
              "px-3 py-2 text-[13px] font-medium transition-colors",
              range === "week" ? "bg-[#6b7c3d] text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Неделя
          </button>
        </div>
        <MemberSelectorButton className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full h-9" onClick={handleCopy}>
          <Copy className="w-3.5 h-3.5" />
          Скопировать
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full h-9" onClick={handleShare}>
          <Share2 className="w-3.5 h-3.5" />
          Поделиться
        </Button>
        {items.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full h-9 text-muted-foreground" onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5" />
            Очистить
          </Button>
        )}
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
      )}

      {emptyState && (
        <div className="rounded-2xl border border-border bg-card shadow-soft p-8 text-center">
          <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {hasPlanData ? "Список пуст. Обновите из плана." : "Добавьте блюда в План — и мы соберём список покупок."}
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0).map((cat) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABEL[cat]}
              </h3>
              <ul className="space-y-1.5">
                {byCategory[cat].map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
                      item.is_purchased && "opacity-60"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setItemPurchased({ itemId: item.id, is_purchased: !item.is_purchased })}
                      className={cn(
                        "w-5 h-5 rounded border shrink-0 flex items-center justify-center transition-colors",
                        item.is_purchased ? "bg-[#6b7c3d] border-[#6b7c3d]" : "border-border bg-background"
                      )}
                      aria-label={item.is_purchased ? "Отметить не купленным" : "Отметить купленным"}
                    >
                      {item.is_purchased && <span className="text-white text-xs">✓</span>}
                    </button>
                    <span className={cn("text-sm flex-1", item.is_purchased && "line-through text-muted-foreground")}>
                      {formatItemLine(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
