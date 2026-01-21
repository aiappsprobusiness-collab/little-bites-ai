import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Plus, Trash2, Share2, Loader2 } from "lucide-react";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useToast } from "@/hooks/use-toast";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useChildren } from "@/hooks/useChildren";
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

const categories = [
  { id: "vegetables", label: "Овощи", emoji: "🥬" },
  { id: "fruits", label: "Фрукты", emoji: "🍎" },
  { id: "dairy", label: "Молочное", emoji: "🥛" },
  { id: "meat", label: "Мясо", emoji: "🍖" },
  { id: "grains", label: "Крупы", emoji: "🌾" },
  { id: "other", label: "Другое", emoji: "📦" },
];

export default function ShoppingPage() {
  const { toast } = useToast();
  const { children } = useChildren();
  const selectedChild = children[0];
  const { getMealPlans } = useMealPlans(selectedChild?.id);
  
  const {
    activeList,
    getListItems,
    isLoadingList,
    createList,
    addItem,
    updateItem,
    deleteItem,
    toggleItemPurchased,
    generateFromMealPlans,
    isCreating,
    isGenerating,
  } = useShoppingLists();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: items = [], isLoading: isLoadingItems } = getListItems(
    activeList?.id || ""
  );

  const filteredItems = selectedCategory
    ? items.filter((item) => item.category === selectedCategory)
    : items;

  const checkedCount = items.filter((i) => i.is_purchased).length;
  const progress = items.length > 0 ? (checkedCount / items.length) * 100 : 0;

  const groupedItems = categories
    .map((cat) => ({
      ...cat,
      items: filteredItems.filter((item) => item.category === cat.id),
    }))
    .filter((cat) => cat.items.length > 0);

  const handleAddItem = async (name: string, amount: string, unit: string, category: string) => {
    try {
      if (!activeList) {
        await createList("Список покупок");
      }
      await addItem({
        name,
        amount: parseFloat(amount) || null,
        unit: unit || null,
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

  // Создать список, если его нет
  if (!activeList && !isLoadingList) {
    createList("Список покупок").catch(() => {});
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

        {/* Category Filter */}
        <div className="px-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            <Button
              variant={selectedCategory === null ? "mint" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              Все
            </Button>
            {categories.map((cat) => (
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
          </div>
        </div>

        {/* Items by Category */}
        {isLoadingItems ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groupedItems.length > 0 ? (
          <div className="px-4 space-y-6">
            {groupedItems.map((category) => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{category.emoji}</span>
                  <h3 className="font-bold">{category.label}</h3>
                  <span className="text-sm text-muted-foreground">
                    ({category.items.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {category.items.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card
                        variant={item.is_purchased ? "default" : "elevated"}
                        className={`transition-all ${
                          item.is_purchased ? "opacity-60" : ""
                        }`}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <button
                            onClick={() =>
                              handleTogglePurchased(item.id, item.is_purchased || false)
                            }
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                              item.is_purchased
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
                              className={`font-medium ${
                                item.is_purchased ? "line-through" : ""
                              }`}
                            >
                              {item.name}
                            </p>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {item.amount && item.unit
                              ? `${item.amount} ${item.unit}`
                              : item.amount
                              ? `${item.amount}`
                              : ""}
                          </span>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4">
            <Card variant="default" className="p-8 text-center">
              <CardContent className="p-0">
                <p className="text-muted-foreground mb-4">
                  Список покупок пуст
                </p>
                <Button
                  variant="mint"
                  onClick={handleGenerateFromMealPlans}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Создание...
                    </>
                  ) : (
                    "Создать из планов питания"
                  )}
                </Button>
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
        </div>
      </div>
    </MobileLayout>
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
              {categories.map((cat) => (
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
