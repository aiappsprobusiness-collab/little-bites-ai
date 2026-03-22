import { useMemo, useState } from "react";
import { Copy, MoreVertical, Filter, ShoppingCart, X, ChevronDown, ChevronRight, ListPlus, Carrot, Apple, Milk, Fish, Wheat, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconBadge, type IconBadgeVariant } from "@/components/ui/IconBadge";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import {
  useShoppingList,
  getSourceRecipesFromItem,
  type ProductCategory,
  type ShoppingListItemRow,
  type SourceRecipe,
  type ShoppingListSyncMeta,
} from "@/hooks/useShoppingList";
import { usePlanShoppingIngredients } from "@/hooks/usePlanShoppingIngredients";
import { usePlanSignature } from "@/hooks/usePlanSignature";
import { useSubscription } from "@/hooks/useSubscription";
import { useFamily } from "@/contexts/FamilyContext";
import { mealPlanMemberIdForShoppingSync } from "@/utils/mealPlanMemberScope";
import { BuildShoppingListFromPlanSheet } from "@/components/plan/BuildShoppingListFromPlanSheet";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { formatShoppingListForCopy } from "@/utils/shoppingListTextFormatter";
import { formatAmountForDisplay, normalizeIngredientDisplayName } from "@/utils/shopping/normalizeIngredientForShopping";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capitalizeIngredientName, normalizeUnitForDisplay } from "@/utils/ingredientDisplay";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const CATEGORY_ORDER: ProductCategory[] = ["vegetables", "fruits", "dairy", "meat", "grains", "other"];
const CATEGORY_LABEL: Record<ProductCategory, string> = {
  vegetables: "Овощи",
  fruits: "Фрукты",
  dairy: "Молочное",
  meat: "Мясо и рыба",
  grains: "Крупы и злаки",
  other: "Прочее",
};

/** Иконка и вариант плашки для заголовка категории (premium icon system). */
const CATEGORY_ICON: Record<ProductCategory, import("react").ComponentType<{ className?: string }>> = {
  vegetables: Carrot,
  fruits: Apple,
  dairy: Milk,
  meat: Fish,
  grains: Wheat,
  other: Package,
};
const CATEGORY_BADGE_VARIANT: Record<ProductCategory, IconBadgeVariant> = {
  vegetables: "sage",
  fruits: "sage",
  dairy: "mint",
  meat: "apricot",
  grains: "sand",
  other: "amber",
};

function formatItemShort(item: ShoppingListItemRow): string {
  const name = normalizeIngredientDisplayName(item.name) || capitalizeIngredientName(item.name);
  const a = item.amount != null && item.amount > 0 ? item.amount : null;
  const u = normalizeUnitForDisplay(item.unit);
  const amountStr = a != null ? formatAmountForDisplay(a, item.unit) : "";
  if (a != null && u) return `${name}, ${amountStr} ${u}`;
  if (a != null) return `${name}, ${amountStr}`;
  return name;
}

/** Один пункт списка: чекбокс, название, количество, удалить; по тапу — раскрыть рецепты. */
function ShoppingListItem({
  item,
  onTogglePurchased,
  onDelete,
}: {
  item: ShoppingListItemRow;
  onTogglePurchased: (itemId: string, is_purchased: boolean) => void;
  onDelete: (item: ShoppingListItemRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sources = getSourceRecipesFromItem(item);
  const hasSources = sources.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-card overflow-hidden",
        item.is_purchased && "opacity-60"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 min-h-[44px]",
          hasSources && "cursor-pointer"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePurchased(item.id, !item.is_purchased);
          }}
          className={cn(
            "w-5 h-5 rounded border shrink-0 flex items-center justify-center transition-colors touch-manipulation",
            item.is_purchased ? "bg-[#6b7c3d] border-[#6b7c3d]" : "border-border bg-background"
          )}
          aria-label={item.is_purchased ? "Отметить не купленным" : "Отметить купленным"}
        >
          {item.is_purchased && <span className="text-white text-xs">✓</span>}
        </button>
        <button
          type="button"
          onClick={() => hasSources && setExpanded((e) => !e)}
          className={cn(
            "flex-1 min-w-0 text-left flex items-center gap-2",
            !hasSources && "cursor-default"
          )}
        >
          <span
            className={cn(
              "text-sm flex-1 min-w-0",
              item.is_purchased && "line-through text-muted-foreground"
            )}
          >
            {formatItemShort(item)}
          </span>
          {hasSources && (
            <span className="shrink-0 text-muted-foreground">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item);
          }}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 touch-manipulation"
          aria-label="Удалить из списка"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {expanded && hasSources && (
        <div className="px-3 pb-2 pt-0 border-t border-border/50 mt-0 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Из рецептов:</p>
          <ul className="text-xs space-y-0.5">
            {sources.map((r) => (
              <li key={r.id}>{r.title || "Без названия"}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ShoppingListView() {
  const { toast } = useToast();
  const { selectedMemberId, members } = useFamily();
  const { hasAccess } = useSubscription();
  const memberId = mealPlanMemberIdForShoppingSync({ hasAccess, selectedMemberId, members });
  const [range, setRange] = useState<"today" | "week">("today");
  const [buildSheetOpen, setBuildSheetOpen] = useState(false);

  const {
    listId,
    listMeta,
    items,
    isLoading: listLoading,
    setItemPurchased,
    clearList,
    replaceItems,
    deleteItem,
    insertItem,
    removePurchased,
  } = useShoppingList();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [addProductSheetOpen, setAddProductSheetOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | "all">("all");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [filterOnlyUnpurchased, setFilterOnlyUnpurchased] = useState(false);
  const [draftAllRecipes, setDraftAllRecipes] = useState(true);
  const [draftRecipeIds, setDraftRecipeIds] = useState<Set<string>>(new Set());
  const [recipeSearch, setRecipeSearch] = useState("");

  const { data: planIngredients, isLoading: planLoading } = usePlanShoppingIngredients(range, memberId);
  const { data: planSignature } = usePlanSignature(range, memberId);

  const syncMetaStored = listMeta as ShoppingListSyncMeta | undefined;
  /** План на экране разошёлся с подписью последней сборки — без автоперезаписи списка. */
  const planDrift = useMemo(() => {
    if (planSignature == null || planSignature === "") return false;
    if (syncMetaStored?.last_synced_range !== range) return true;
    const storedMember = syncMetaStored?.last_synced_member_id ?? null;
    if (storedMember !== (memberId ?? null)) return true;
    return syncMetaStored?.last_synced_plan_signature !== planSignature;
  }, [planSignature, syncMetaStored, range, memberId]);

  const handleRebuildFromPlan = async () => {
    if (!listId || planIngredients === undefined) return;
    if (planIngredients.length === 0) {
      toast({
        title: "Нет блюд в меню за выбранный период",
        description: "Переключите «Сегодня» / «Неделя» или добавьте рецепты в план.",
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
      last_synced_member_id: memberId ?? null,
      last_synced_plan_signature: planSignature ?? "",
      last_synced_at: new Date().toISOString(),
    };
    try {
      if (payload.length === 0) {
        await replaceItems({ items: [], syncMeta: newSyncMeta });
      } else {
        await replaceItems({ items: payload, syncMeta: newSyncMeta });
      }
      toast({ title: "Список собран заново из меню" });
    } catch {
      toast({ variant: "destructive", title: "Не удалось собрать список" });
    }
  };

  const handleCopy = () => {
    const itemsForFormat = items.map((i) => ({
      name: normalizeIngredientDisplayName(i.name) || i.name,
      amount: i.amount,
      unit: i.unit,
      category: i.category,
    }));
    const text = formatShoppingListForCopy(itemsForFormat, range);
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Скопировано" }),
      () => toast({ variant: "destructive", title: "Не удалось скопировать" })
    );
  };

  const handleClear = () => {
    clearList()
      .then(() => toast({ title: "Список очищен" }))
      .catch(() => toast({ variant: "destructive", title: "Не удалось очистить" }));
  };

  const handleRemovePurchased = () => {
    removePurchased()
      .then(() => toast({ title: "Купленные убраны" }))
      .catch(() => toast({ variant: "destructive", title: "Не удалось убрать" }));
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
    if (filterOnlyUnpurchased) {
      list = list.filter((i) => !i.is_purchased);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCategory, selectedRecipeIds, filterOnlyUnpurchased, searchQuery]);

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

  const handleApplyFilter = () => {
    if (draftAllRecipes || draftRecipeIds.size === 0) setSelectedRecipeIds(new Set());
    else setSelectedRecipeIds(new Set(draftRecipeIds));
    setFilterSheetOpen(false);
  };

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedRecipeIds(new Set());
    setFilterOnlyUnpurchased(false);
    setDraftAllRecipes(true);
    setDraftRecipeIds(new Set());
    setFilterSheetOpen(false);
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

  const handleDeleteItem = (item: ShoppingListItemRow) => {
    const sources = getSourceRecipesFromItem(item);
    const payload = {
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      category: item.category ?? "other",
      source_recipes: sources.length ? sources : undefined,
    };
    deleteItem(item.id)
      .then(() => {
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
      })
      .catch(() => toast({ variant: "destructive", title: "Не удалось удалить" }));
  };

  const filterActiveCount = [selectedCategory !== "all", selectedRecipeIds.size > 0, filterOnlyUnpurchased].filter(
    Boolean
  ).length;

  const listHasContent = items.length > 0;

  const periodHeadline =
    range === "today" ? "Список покупок на сегодня" : "Список покупок на неделю";
  const periodSubline = listHasContent
    ? null
    : syncMetaStored?.last_synced_at
      ? "Соберите снова из плана или добавьте вручную."
      : "Соберите из плана или добавьте продукты вручную.";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{periodHeadline}</h2>
        {periodSubline != null && (
          <p className="text-xs text-muted-foreground mt-1">{periodSubline}</p>
        )}
      </div>

      <BuildShoppingListFromPlanSheet
        open={buildSheetOpen}
        onOpenChange={setBuildSheetOpen}
        planMemberId={memberId}
        hasAccess={hasAccess}
        navigateToShoppingTabOnSuccess={false}
      />

      {/* Верхний ряд: Сегодня/Неделя + селектор профиля */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-full border border-border overflow-hidden bg-muted/30 shrink-0">
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
        <MemberSelectorButton className="shrink-0 ml-auto" />
      </div>

      {!loading && items.length > 0 && planDrift && (
        <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">В меню есть изменения после последней сборки.</p>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs shrink-0 border-border/60"
            onClick={() => void handleRebuildFromPlan()}
          >
            Собрать заново
          </Button>
        </div>
      )}

      {/* Поиск, фильтр и меню — одна строка, если список не пустой; иначе только «Ещё» */}
      {!loading && (
        <div className={cn("flex items-center gap-2", items.length === 0 && "justify-end")}>
          {items.length > 0 && (
            <>
              <Input
                type="search"
                placeholder="Поиск…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 flex-1 min-w-0 text-sm"
                aria-label="Поиск по ингредиентам"
              />
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 shrink-0 gap-1.5 px-2.5 text-muted-foreground font-normal hover:text-foreground",
                  filterActiveCount > 0 && "text-[#6b7c3d] hover:text-[#5a6b32]"
                )}
                onClick={() => setFilterSheetOpen(true)}
              >
                <Filter className="w-3.5 h-3.5 opacity-80" />
                <span className="text-xs">Фильтр</span>
                {filterActiveCount > 0 && <span className="text-xs font-medium">({filterActiveCount})</span>}
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0 text-muted-foreground">
                <MoreVertical className="w-4 h-4" aria-label="Ещё" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => void handleRebuildFromPlan()}>Собрать заново из меню</DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy} disabled={items.length === 0}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                Скопировать список
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddProductSheetOpen(true)}>
                <ListPlus className="w-3.5 h-3.5 mr-2" />
                Добавить продукт вручную
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRemovePurchased} disabled={!items.some((i) => i.is_purchased)}>
                Убрать купленные
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClear} disabled={items.length === 0} className="text-destructive focus:text-destructive">
                Очистить список
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Filter sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col p-0">
          <SheetHeader className="p-5 pb-3 text-left space-y-1">
            <SheetTitle className="text-base">Фильтр</SheetTitle>
            <SheetDescription className="sr-only">Настройка отображения списка покупок</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-5 space-y-6 pb-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2.5">Категория</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium rounded-full border",
                    selectedCategory === "all" ? "bg-[#6b7c3d] text-white border-[#6b7c3d]" : "border-border bg-muted/30"
                  )}
                >
                  Все
                </button>
                {CATEGORY_ORDER.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-medium rounded-full border",
                      selectedCategory === cat ? "bg-[#6b7c3d] text-white border-[#6b7c3d]" : "border-border bg-muted/30"
                    )}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/90 mb-2.5">
                Рецепты
              </p>
              <input
                type="search"
                placeholder="Поиск по рецепту…"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-background/80 px-2.5 py-1 text-xs mb-2.5"
              />
              <label className="flex items-center gap-2.5 py-1 cursor-pointer min-h-9">
                <input
                  type="checkbox"
                  checked={draftAllRecipes}
                  onChange={(e) => {
                    setDraftAllRecipes(e.target.checked);
                    if (e.target.checked) setDraftRecipeIds(new Set());
                  }}
                  className="h-4 w-4 rounded border-border shrink-0"
                />
                <span className="text-sm text-foreground/90">Все рецепты</span>
              </label>
              <ul className="max-h-36 overflow-y-auto space-y-1 mt-1">
                {filteredRecipesForSheet.map((r) => (
                  <li key={r.id}>
                    <label className="flex items-center gap-2.5 py-1 min-h-8 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!draftAllRecipes && draftRecipeIds.has(r.id)}
                        onChange={() => toggleDraftRecipe(r.id)}
                        disabled={draftAllRecipes}
                        className="h-4 w-4 rounded border-border shrink-0"
                      />
                      <span className="text-sm text-foreground/85 truncate min-w-0 flex-1" title={r.title || undefined}>
                        {r.title || "Без названия"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <label className="flex items-center gap-2.5 py-1 cursor-pointer min-h-10">
              <input
                type="checkbox"
                checked={filterOnlyUnpurchased}
                onChange={(e) => setFilterOnlyUnpurchased(e.target.checked)}
                className="h-4 w-4 rounded border-border shrink-0"
              />
              <span className="text-sm">Только некупленные</span>
            </label>
          </div>
          <SheetFooter className="p-5 pt-3 border-t flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground py-2 sm:py-0 self-center sm:self-auto"
              onClick={handleResetFilters}
            >
              Сбросить фильтры
            </button>
            <Button className="w-full sm:w-auto bg-[#6b7c3d] hover:bg-[#5a6b32] text-white" onClick={handleApplyFilter}>
              Применить
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Add product sheet */}
      <AddProductSheet
        open={addProductSheetOpen}
        onOpenChange={setAddProductSheetOpen}
        onAdd={async (fields) => {
          await insertItem({
            name: fields.name.trim(),
            amount: fields.amount ?? null,
            unit: fields.unit?.trim() || null,
            category: fields.category ?? "other",
          });
          setAddProductSheetOpen(false);
          toast({ title: "Продукт добавлен" });
        }}
        onError={() => toast({ variant: "destructive", title: "Не удалось добавить" })}
      />

      {loading && (
        <div className="py-8 text-center text-sm text-muted-foreground">Загрузка…</div>
      )}

      {emptyState && (
        <div className="rounded-2xl border border-border bg-card shadow-soft p-8 text-center">
          <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            {hasPlanData
              ? "Соберите список из текущего меню — ингредиенты с разных блюд объединятся."
              : "Добавьте блюда в План или начните с пустого списка и добавьте продукты вручную."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center items-stretch">
            <Button
              size="sm"
              className="gap-1.5 bg-[#6b7c3d] hover:bg-[#5a6b32] text-white"
              onClick={() => setBuildSheetOpen(true)}
            >
              <ListPlus className="w-3.5 h-3.5" />
              Собрать из меню
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddProductSheetOpen(true)}>
              <ListPlus className="w-3.5 h-3.5" />
              Добавить вручную
            </Button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="space-y-5">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">По выбранным фильтрам ничего не найдено.</p>
            ) : (
              CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0).map((cat) => (
                <div key={cat}>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground tracking-wide mb-2.5">
                    <IconBadge icon={CATEGORY_ICON[cat]} variant={CATEGORY_BADGE_VARIANT[cat]} size="sm" />
                    <span className="text-foreground">{CATEGORY_LABEL[cat]}</span>
                  </h3>
                  <ul className="space-y-2">
                    {byCategory[cat].map((item) => (
                      <li key={item.id}>
                        <ShoppingListItem
                          item={item}
                          onTogglePurchased={(id, is_purchased) => setItemPurchased({ itemId: id, is_purchased })}
                          onDelete={(it) => handleDeleteItem(it)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2 -mt-1"
            >
              <Copy className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
              Скопировать список
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Sheet для ручного добавления продукта. */
function AddProductSheet({
  open,
  onOpenChange,
  onAdd,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (fields: { name: string; amount: number | null; unit: string | null; category: ProductCategory }) => Promise<void>;
  onError: () => void;
}) {
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<ProductCategory | "">("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const amount = amountStr.trim() ? parseFloat(amountStr) : null;
    const num = amount != null && Number.isFinite(amount) ? amount : null;
    try {
      await onAdd({
        name: trimmed,
        amount: num,
        unit: unit.trim() || null,
        category: (category as ProductCategory) || "other",
      });
      setName("");
      setAmountStr("");
      setUnit("");
      setCategory("");
    } catch {
      onError();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Добавить продукт</SheetTitle>
          <SheetDescription>Название обязательно; количество и категория — по желанию.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Название</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Молоко"
              className="w-full"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Количество</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Единица</label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="г, мл, шт."
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategory | "")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <SheetFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" className="bg-[#6b7c3d] hover:bg-[#5a6b32] text-white" disabled={!name.trim()}>
              Добавить
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
