import { useEffect, useMemo, useState } from "react";
import { Copy, Trash2, ShoppingCart, X, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useShoppingList, getSourceRecipesFromItem, type ProductCategory, type ShoppingListItemRow, type SourceRecipe } from "@/hooks/useShoppingList";
import { usePlanShoppingIngredients } from "@/hooks/usePlanShoppingIngredients";
import { useFamily } from "@/contexts/FamilyContext";
import { ShareIosIcon } from "@/components/icons/ShareIosIcon";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { capitalizeIngredientName } from "@/utils/ingredientDisplay";
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

const OLIVE_ACTIVE = "bg-[#6b7c3d] text-white";
const CHIP_BASE = "px-3 py-1.5 text-[13px] font-medium rounded-full border transition-colors";

function formatItemLine(item: { name: string; amount: number | null; unit: string | null }): string {
  const name = capitalizeIngredientName(item.name);
  const a = item.amount != null && item.amount > 0 ? item.amount : null;
  const u = item.unit?.trim();
  if (a != null && u) return `${name} — ${a} ${u}`;
  if (a != null) return `${name} — ${a}`;
  return name;
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
    deleteItem,
    insertItem,
  } = useShoppingList();

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | "all">("all");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [recipeSheetOpen, setRecipeSheetOpen] = useState(false);
  const [draftAllRecipes, setDraftAllRecipes] = useState(true);
  const [draftRecipeIds, setDraftRecipeIds] = useState<Set<string>>(new Set());
  const [recipeSearch, setRecipeSearch] = useState("");

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
      source_recipes: ing.source_recipes?.length ? ing.source_recipes : undefined,
    }));
    replaceItems(payload).catch(() => toast({ variant: "destructive", title: "Не удалось обновить список" }));
  }, [range, memberId, listId, planIngredients, replaceItems, clearList, toast]);

  const handleCopy = () => {
    const lines = filteredItems.map((i) => (i.is_purchased ? `☑ ${formatItemLine(i)}` : `☐ ${formatItemLine(i)}`));
    const text = lines.join("\n") || "Список пуст";
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Скопировано" }),
      () => toast({ variant: "destructive", title: "Не удалось скопировать" })
    );
  };

  const handleShare = () => {
    const lines = filteredItems.map((i) => `• ${formatItemLine(i)}`);
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

  const uniqueRecipes = useMemo(() => {
    const byId = new Map<string, SourceRecipe>();
    for (const item of items) {
      for (const r of getSourceRecipesFromItem(item)) {
        if (r.id && !byId.has(r.id)) byId.set(r.id, r);
      }
    }
    return [...byId.values()];
  }, [items]);

  useEffect(() => {
    if (recipeSheetOpen) {
      setDraftAllRecipes(selectedRecipeIds.size === 0);
      setDraftRecipeIds(new Set(selectedRecipeIds));
      setRecipeSearch("");
    }
  }, [recipeSheetOpen, selectedRecipeIds]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedCategory !== "all") {
      const cat = selectedCategory;
      list = list.filter((i) => {
        const raw = i.category ?? "other";
        const normalized: ProductCategory = CATEGORY_ORDER.includes(raw as ProductCategory) ? (raw as ProductCategory) : "other";
        return normalized === cat;
      });
    }
    if (selectedRecipeIds.size > 0) {
      list = list.filter((i) => {
        const sources = getSourceRecipesFromItem(i);
        return sources.some((s) => selectedRecipeIds.has(s.id));
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCategory, selectedRecipeIds, searchQuery]);

  const byCategory = filteredItems.reduce((acc, item) => {
    const raw = item.category ?? "other";
    const cat: ProductCategory = CATEGORY_ORDER.includes(raw as ProductCategory) ? (raw as ProductCategory) : "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<ProductCategory, ShoppingListItemRow[]>);

  const filteredRecipesForSheet = useMemo(() => {
    if (!recipeSearch.trim()) return uniqueRecipes;
    const q = recipeSearch.trim().toLowerCase();
    return uniqueRecipes.filter((r) => (r.title ?? "").toLowerCase().includes(q));
  }, [uniqueRecipes, recipeSearch]);

  const handleApplyRecipeFilter = () => {
    if (draftAllRecipes || draftRecipeIds.size === 0) setSelectedRecipeIds(new Set());
    else setSelectedRecipeIds(new Set(draftRecipeIds));
    setRecipeSheetOpen(false);
  };

  const handleResetRecipeFilter = () => {
    setSelectedRecipeIds(new Set());
    setDraftAllRecipes(true);
    setDraftRecipeIds(new Set());
    setRecipeSheetOpen(false);
  };

  const toggleDraftRecipe = (recipeId: string) => {
    setDraftAllRecipes(false);
    setDraftRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  };

  const setDraftAllRecipesChecked = (checked: boolean) => {
    setDraftAllRecipes(checked);
    if (checked) setDraftRecipeIds(new Set());
  };

  const handleDeleteItem = (item: ShoppingListItemRow) => {
    const sources = getSourceRecipesFromItem(item);
    const payload = {
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      category: item.category ?? "other",
      source_recipes: sources.length ? sources : undefined,
    };
    deleteItem(item.id).then(() => {
      const t = toast({
        title: "Удалено",
        action: (
          <ToastAction
            altText="Отменить"
            onClick={() => {
              insertItem(payload).catch(() => toast({ variant: "destructive", title: "Не удалось вернуть" }));
            }}
          >
            Отменить
          </ToastAction>
        ),
      });
      setTimeout(() => t.dismiss(), 4000);
    }).catch(() => toast({ variant: "destructive", title: "Не удалось удалить" }));
  };

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
          <ShareIosIcon className="w-3.5 h-3.5" />
          Поделиться
        </Button>
        {items.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full h-9 text-muted-foreground" onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5" />
            Очистить
          </Button>
        )}
      </div>

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={cn(CHIP_BASE, "border-border bg-muted/30", selectedCategory === "all" ? OLIVE_ACTIVE : "text-muted-foreground hover:text-foreground")}
              >
                Все
              </button>
              {CATEGORY_ORDER.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(CHIP_BASE, "border-border bg-muted/30", selectedCategory === cat ? OLIVE_ACTIVE : "text-muted-foreground hover:text-foreground")}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
            <div className="flex flex-col items-start shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 rounded-full gap-1.5 border-border",
                  selectedRecipeIds.size > 0 && "border-[#6b7c3d] bg-[#6b7c3d]/10 text-[#6b7c3d] hover:bg-[#6b7c3d]/15"
                )}
                onClick={() => setRecipeSheetOpen(true)}
              >
                <Filter className="w-3.5 h-3.5" />
                Рецепты
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {selectedRecipeIds.size === 0 ? "Все рецепты" : `Выбрано: ${selectedRecipeIds.size}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Поиск по ингредиентам…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-9 w-full max-w-[220px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Поиск по ингредиентам"
            />
          </div>
        </div>
      )}

      <Sheet open={recipeSheetOpen} onOpenChange={setRecipeSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col p-0">
          <SheetHeader className="p-4 pb-2 text-left">
            <SheetTitle>Фильтр по рецептам</SheetTitle>
            <SheetDescription>Выберите рецепты, ингредиенты которых показать</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-4">
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draftAllRecipes}
                onChange={(e) => setDraftAllRecipesChecked(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm font-medium">Все рецепты</span>
            </label>
            <input
              type="search"
              placeholder="Поиск по названию рецепта…"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mb-2"
              aria-label="Поиск по рецептам"
            />
            <ul className="flex-1 overflow-y-auto space-y-0.5 pb-2 -mx-1">
              {filteredRecipesForSheet.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!draftAllRecipes && draftRecipeIds.has(r.id)}
                      onChange={() => toggleDraftRecipe(r.id)}
                      disabled={draftAllRecipes}
                      className="h-4 w-4 rounded border-border shrink-0"
                    />
                    <span className="text-sm truncate min-w-0">{r.title || "Без названия"}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <SheetFooter className="p-4 pt-2 border-t gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={handleResetRecipeFilter}>
              Сбросить
            </Button>
            <Button
              type="button"
              className="bg-[#6b7c3d] hover:bg-[#5a6b32] text-white"
              onClick={handleApplyRecipeFilter}
            >
              Применить
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">По выбранным фильтрам ничего не найдено.</p>
          ) : (
            CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0).map((cat) => (
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
                      <span className={cn("text-sm flex-1 min-w-0", item.is_purchased && "line-through text-muted-foreground")}>
                        {formatItemLine(item)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item)}
                        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 touch-manipulation"
                        aria-label="Удалить из списка"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
