import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Plus, Trash2, Share2, Loader2, Heart, ChefHat } from "lucide-react";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useToast } from "@/hooks/use-toast";
import { formatAmountUnit, resolveUnit, detectCategory } from "@/utils/productUtils";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useChildren } from "@/hooks/useChildren";
import { useFavorites } from "@/hooks/useFavorites";
import { parseIngredient, cleanProductNameDisplay } from "@/utils/parseIngredient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Основные категории (без "Все" - это специальный фильтр)
const mainCategories = [
  { id: "vegetables", label: "Овощи", emoji: "🥬" },
  { id: "fruits", label: "Фрукты", emoji: "🍎" },
  { id: "dairy", label: "Молочное", emoji: "🥛" },
  { id: "meat", label: "Мясо", emoji: "🍖" },
  { id: "grains", label: "Крупы", emoji: "🌾" },
];

// Категория "Другое" для продуктов без определённой категории
const otherCategory = { id: "other", label: "Другое", emoji: "📦" };

// Все категории для отображения
const allCategories = [...mainCategories, otherCategory];

// Временный фильтр: не показывать в списке строки-инструкции (уже попавшие в БД)
function looksLikeInstruction(name: string | null | undefined): boolean {
  if (!name || name.length >= 60) return true;
  const lower = name.toLowerCase();
  const phrases = ["перед подачей", "по вкусу", "по желанию", "для подачи", "при подаче"];
  const verbs = ["посыпать", "полить", "смазать", "нарезать", "варить", "обжарить", "добавить", "смешать", "залить", "положить", "тушить", "запечь", "выложить"];
  return phrases.some((p) => lower.includes(p)) || verbs.some((v) => lower.includes(v));
}

export default function ShoppingPage() {
  const { toast } = useToast();
  const { children } = useChildren();
  const selectedChild = children[0];
  const { getMealPlans } = useMealPlans(selectedChild?.id);
  const { favorites } = useFavorites();

  const {
    activeList,
    getListItems,
    isLoadingList,
    createList,
    addItem,
    addItemsFromRecipe,
    updateItem,
    deleteItem,
    toggleItemPurchased,
    generateFromMealPlans,
    clearCategoryItems,
    isCreating,
    isGenerating,
  } = useShoppingLists();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isFavoritesSheetOpen, setIsFavoritesSheetOpen] = useState(false);
  const [isEditAmountDialogOpen, setIsEditAmountDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [clearingCategoryId, setClearingCategoryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"byCategory" | "byRecipe">("byCategory");

  const { data: items = [], isLoading: isLoadingItems } = getListItems(
    activeList?.id || ""
  );

  // Фильтрация элементов в зависимости от выбранной категории (только для режима "по категориям")
  const filteredItems = viewMode === "byCategory"
    ? (selectedCategory === null
      ? items // "Все" - показываем всё
      : selectedCategory === "other"
        ? items.filter((item) => item.category === "other" || !item.category)
        : items.filter((item) => item.category === selectedCategory))
    : items;

  const checkedCount = items.filter((i) => i.is_purchased).length;
  const progress = items.length > 0 ? (checkedCount / items.length) * 100 : 0;

  // Группировка элементов для отображения
  const groupedItems = viewMode === "byCategory"
    ? // Режим "по категориям"
    (selectedCategory === null
      ? // "Все" - группируем по всем категориям
      allCategories
        .map((cat) => ({
          ...cat,
          items: items.filter(
            (item) =>
              (cat.id === "other"
                ? (item.category === "other" || !item.category)
                : item.category === cat.id) && !looksLikeInstruction(item.name)
          ),
        }))
        .filter((cat) => cat.items.length > 0)
      : // Конкретная категория - показываем только её (без строк-инструкций)
      allCategories
        .filter((cat) => cat.id === selectedCategory)
        .map((cat) => ({
          ...cat,
          items: filteredItems.filter((item) => !looksLikeInstruction(item.name)),
        }))
        .filter((cat) => cat.items.length > 0))
    : // Режим "по рецептам" — только товары с recipe_id, заголовок группы из recipes.title (join)
    (() => {
      const itemsWithRecipe = items.filter(
        (i: any) => i.recipe_id != null && String(i.recipe_id).trim() !== ""
      );
      const recipeGroups = new Map<string, { title: string; items: typeof items }>();
      itemsWithRecipe.forEach((item: any) => {
        const rid = String(item.recipe_id).trim();
        // Заголовок группы — из join recipes.title, иначе сохранённый recipe_title
        const title =
          item.recipes?.title ??
          item.recipeTitle ??
          item.recipe?.title ??
          item.recipe_title ??
          (item.recipe_id ? `Рецепт (${String(item.recipe_id).slice(0, 8)}…)` : "Рецепт");
        if (!recipeGroups.has(rid)) {
          recipeGroups.set(rid, { title, items: [] });
        }
        const group = recipeGroups.get(rid)!;
        if (!group.title && title !== "Рецепт") group.title = title;
        group.items.push(item);
      });

      return Array.from(recipeGroups.entries()).map(([recipeId, { title, items: groupItems }]) => ({
        id: recipeId,
        label: title,
        emoji: "recipe",
        // Временный фильтр: не показывать "мусор" — длинные инструкции и фразы типа "перед подачей"
        items: groupItems.filter((i: any) => (i.name?.length ?? 0) < 60 && !looksLikeInstruction(i.name)),
      }));
    })();

  const handleAddItem = async (name: string, amount: string, unit: string, category: string) => {
    try {
      if (!activeList) {
        await createList("Список покупок");
      }
      const resolvedUnit = resolveUnit(unit || null, name);
      let amt: number | null = amount ? parseFloat(amount) : null;
      if (amt == null && resolvedUnit === "шт") amt = 1;
      await addItem({
        name,
        amount: amt,
        unit: resolvedUnit,
        category: category as any,
        is_purchased: false,
      });
      setIsAddDialogOpen(false);
      toast({
        title: "Продукт добавлен",
        description: "Продукт успешно добавлен в список",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось добавить продукт",
      });
    }
  };

  const handleTogglePurchased = async (id: string, isPurchased: boolean) => {
    try {
      await toggleItemPurchased({ id, isPurchased: !isPurchased });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось обновить статус",
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id);
      toast({
        title: "Продукт удален",
        description: "Продукт удален из списка",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось удалить продукт",
      });
    }
  };

  const handleGenerateFromMealPlans = async () => {
    try {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      await generateFromMealPlans({ startDate: weekStart, endDate: weekEnd });
      toast({
        title: "Список создан",
        description: "Список покупок создан на основе планов питания",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось создать список",
      });
    }
  };

  const handleGenerateFromFavorites = async (favoriteId: string) => {
    try {
      const favorite = favorites.find((f) => f.id === favoriteId);
      if (!favorite) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Избранный рецепт не найден",
        });
        return;
      }

      const ingredients = favorite.recipe.ingredients || [];
      if (ingredients.length === 0) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "В рецепте нет ингредиентов",
        });
        return;
      }

      await addItemsFromRecipe({
        ingredients,
        listId: activeList?.id,
        recipeTitle: favorite.recipe.title,
      });

      setIsFavoritesSheetOpen(false);
      toast({
        title: "Список создан",
        description: `Ингредиенты из «${favorite.recipe.title}» добавлены в список покупок`,
      });
    } catch (error: unknown) {
      console.error("DB Error in handleGenerateFromFavorites:", (error as Error).message);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (error as Error).message || "Не удалось создать список из избранного",
      });
    }
  };

  const handleClearCategory = async (categoryId: string) => {
    if (!activeList) return;
    setClearingCategoryId(categoryId);
    try {
      await clearCategoryItems({ listId: activeList.id, category: categoryId });
      const cat = allCategories.find((c) => c.id === categoryId);
      toast({
        title: "Категория очищена",
        description: cat ? `Удалены продукты: ${cat.label}` : "Продукты удалены",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось очистить категорию",
      });
    } finally {
      setClearingCategoryId(null);
    }
  };

  const handleEditAmount = (item: any) => {
    setEditingItem(item);
    setIsEditAmountDialogOpen(true);
  };

  const handleSaveAmount = async (amount: number | null, unit: string) => {
    if (!editingItem) return;
    try {
      await updateItem({
        id: editingItem.id,
        amount,
        unit,
      });
      setIsEditAmountDialogOpen(false);
      setEditingItem(null);
      toast({
        title: "Обновлено",
        description: "Количество и единица измерения обновлены",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось обновить",
      });
    }
  };

  // Создать список, если его нет
  if (!activeList && !isLoadingList) {
    createList("Список покупок").catch(() => { });
  }

  return (
    <MobileLayout title="Список покупок">
      <div className="space-y-6">
        {/* Progress */}
        <div className="px-4 pt-4">
          <Card variant="elevated">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">Прогресс</span>
                <span className="text-sm text-muted-foreground">
                  {checkedCount} из {items.length}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full gradient-primary rounded-full"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Mode Toggle */}
        <div className="px-4">
          <div className="flex gap-2 mb-4">
            <Button
              variant={viewMode === "byCategory" ? "mint" : "outline"}
              size="sm"
              onClick={() => setViewMode("byCategory")}
              className="flex-1"
            >
              По категориям
            </Button>
            <Button
              variant={viewMode === "byRecipe" ? "mint" : "outline"}
              size="sm"
              onClick={() => setViewMode("byRecipe")}
              className="flex-1"
            >
              По рецептам
            </Button>
          </div>
        </div>

        {/* Category Filter - только для режима "по категориям" */}
        {viewMode === "byCategory" && (
          <div className="px-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                variant={selectedCategory === null ? "mint" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Все
              </Button>
              {mainCategories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "mint" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="whitespace-nowrap"
                >
                  {cat.emoji} {cat.label}
                </Button>
              ))}
              <Button
                variant={selectedCategory === "other" ? "mint" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("other")}
                className="whitespace-nowrap"
              >
                {otherCategory.emoji} {otherCategory.label}
              </Button>
            </div>
          </div>
        )}

        {/* Items: по категориям (Мясо, Фрукты…) или по рецептам (название рецепта → плоский список продуктов) */}
        {isLoadingItems ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groupedItems.length > 0 ? (
          <div className="px-4 space-y-6">
            {groupedItems.map((category) => (
              <div key={category.id}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {viewMode === "byRecipe" && category.emoji === "recipe" ? (
                      <ChefHat className="w-5 h-5 text-muted-foreground shrink-0" />
                    ) : (
                      <span className="text-xl">{category.emoji}</span>
                    )}
                    <h3 className="font-bold">
                      {viewMode === "byRecipe" ? `${category.label} (${category.items.length})` : category.label}
                    </h3>
                    {viewMode !== "byRecipe" && (
                      <span className="text-sm text-muted-foreground">
                        ({category.items.length})
                      </span>
                    )}
                  </div>
                  {viewMode === "byCategory" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClearCategory(category.id)}
                      disabled={clearingCategoryId !== null}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 gap-1 h-8"
                    >
                      {clearingCategoryId === category.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Очистить</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {/* Плоский список продуктов без подразделения по категориям */}
                <div className="space-y-2">
                  {category.items.map((item, index) => {
                    const amountUnit = formatAmountUnit(item.amount, item.unit);
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card
                          variant={item.is_purchased ? "default" : "elevated"}
                          className={`transition-all ${item.is_purchased ? "opacity-60" : ""
                            }`}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <button
                              onClick={() =>
                                handleTogglePurchased(item.id, item.is_purchased || false)
                              }
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${item.is_purchased
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30"
                                }`}
                            >
                              {item.is_purchased && (
                                <Check className="w-4 h-4 text-primary-foreground" />
                              )}
                            </button>
                            <div className="flex-1">
                              <p
                                className={`font-medium ${item.is_purchased ? "line-through" : ""
                                  }`}
                              >
                                {cleanProductNameDisplay(item.name)}
                              </p>
                            </div>
                            {amountUnit ? (
                              <button
                                onClick={() => handleEditAmount(item)}
                                className="text-sm font-medium text-foreground bg-muted px-2 py-1 rounded-md hover:bg-muted/80 transition-colors cursor-pointer"
                              >
                                {amountUnit}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEditAmount(item)}
                                className="text-sm font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
                              >
                                Добавить количество
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4">
            <Card variant="default" className="p-8 text-center">
              <CardContent className="p-0">
                <p className="text-muted-foreground">
                  {viewMode === "byRecipe"
                    ? "Добавьте ингредиенты из рецептов, чтобы увидеть их здесь"
                    : "Список покупок пуст"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pb-6 space-y-3">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="lg" className="w-full">
                <Plus className="w-5 h-5 mr-2" />
                Добавить продукт
              </Button>
            </DialogTrigger>
            <AddItemDialog
              onAdd={handleAddItem}
              isLoading={isCreating}
            />
          </Dialog>
          <Button
            variant="peach"
            size="lg"
            className="w-full"
            onClick={handleGenerateFromMealPlans}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Создание списка...
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5 mr-2" />
                Создать из планов питания
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setIsFavoritesSheetOpen(true)}
            disabled={favorites.length === 0}
          >
            <Heart className="w-5 h-5 mr-2" />
            Создать из Избранного
          </Button>
        </div>
      </div>

      {/* BottomSheet для выбора избранного */}
      <Sheet open={isFavoritesSheetOpen} onOpenChange={setIsFavoritesSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl flex flex-col max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>Выберите рецепт из избранного</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-2">
            {favorites.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Нет избранных рецептов</p>
              </div>
            ) : (
              favorites.map((favorite) => (
                <motion.div
                  key={favorite.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card
                    variant="elevated"
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleGenerateFromFavorites(favorite.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base">{favorite.recipe.title}</h3>
                          {favorite.recipe.ingredients && favorite.recipe.ingredients.length > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {favorite.recipe.ingredients.length} ингредиент(ов)
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateFromFavorites(favorite.id);
                          }}
                        >
                          Добавить
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Диалог редактирования количества/единицы */}
      <Dialog open={isEditAmountDialogOpen} onOpenChange={setIsEditAmountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать количество</DialogTitle>
            <DialogDescription>
              {editingItem ? cleanProductNameDisplay(editingItem.name) : ""}
            </DialogDescription>
          </DialogHeader>
          <EditAmountDialog
            item={editingItem}
            onSave={handleSaveAmount}
            onCancel={() => {
              setIsEditAmountDialogOpen(false);
              setEditingItem(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </MobileLayout>
  );
}

// Диалог для редактирования количества и единицы
function EditAmountDialog({
  item,
  onSave,
  onCancel,
}: {
  item: any;
  onSave: (amount: number | null, unit: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState<string>(
    item?.amount != null ? String(item.amount) : ""
  );
  const [unit, setUnit] = useState<string>(item?.unit || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = amount.trim() ? parseFloat(amount.replace(",", ".")) : null;
    const finalUnit = unit.trim() || resolveUnit(null, item?.name || "");
    onSave(amountNum, finalUnit);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit-amount">Количество</Label>
          <Input
            id="edit-amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-unit">Единица</Label>
          <Input
            id="edit-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="г, мл, шт"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Отмена
        </Button>
        <Button type="submit" variant="mint" className="flex-1">
          Сохранить
        </Button>
      </div>
    </form>
  );
}

// Диалог для добавления продукта
function AddItemDialog({
  onAdd,
  isLoading,
}: {
  onAdd: (name: string, amount: string, unit: string, category: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd(name, amount, unit, category);
      setName("");
      setAmount("");
      setUnit("");
      setCategory("other");
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Добавить продукт</DialogTitle>
        <DialogDescription>
          Добавьте продукт в список покупок
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Название</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Например: Молоко"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Количество</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Единица</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="г, мл, шт"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Категория</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          variant="mint"
          className="w-full"
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Добавление...
            </>
          ) : (
            "Добавить"
          )}
        </Button>
      </form>
    </DialogContent>
  );
}
