import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Plus, Trash2, Share2 } from "lucide-react";

const categories = [
  { id: "vegetables", label: "Овощи", emoji: "🥬" },
  { id: "fruits", label: "Фрукты", emoji: "🍎" },
  { id: "dairy", label: "Молочное", emoji: "🥛" },
  { id: "meat", label: "Мясо", emoji: "🍖" },
  { id: "grains", label: "Крупы", emoji: "🌾" },
  { id: "other", label: "Другое", emoji: "📦" },
];

const mockItems = [
  { id: "1", name: "Тыква", quantity: "500г", category: "vegetables", checked: false },
  { id: "2", name: "Яблоки", quantity: "4 шт", category: "fruits", checked: true },
  { id: "3", name: "Морковь", quantity: "300г", category: "vegetables", checked: false },
  { id: "4", name: "Индейка филе", quantity: "400г", category: "meat", checked: false },
  { id: "5", name: "Рис", quantity: "200г", category: "grains", checked: true },
  { id: "6", name: "Брокколи", quantity: "300г", category: "vegetables", checked: false },
  { id: "7", name: "Груши", quantity: "3 шт", category: "fruits", checked: false },
];

export default function ShoppingPage() {
  const [items, setItems] = useState(mockItems);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const filteredItems = selectedCategory
    ? items.filter(item => item.category === selectedCategory)
    : items;

  const checkedCount = items.filter(i => i.checked).length;
  const progress = (checkedCount / items.length) * 100;

  const groupedItems = categories.map(cat => ({
    ...cat,
    items: filteredItems.filter(item => item.category === cat.id),
  })).filter(cat => cat.items.length > 0);

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
            {categories.map(cat => (
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
                      variant={item.checked ? "default" : "elevated"}
                      className={`transition-all ${item.checked ? "opacity-60" : ""}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <button
                          onClick={() => toggleItem(item.id)}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                            item.checked
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {item.checked && (
                            <Check className="w-4 h-4 text-primary-foreground" />
                          )}
                        </button>
                        <div className="flex-1">
                          <p className={`font-medium ${item.checked ? "line-through" : ""}`}>
                            {item.name}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {item.quantity}
                        </span>
                        <button className="p-1 text-muted-foreground hover:text-destructive">
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

        {/* Actions */}
        <div className="px-4 pb-6 space-y-3">
          <Button variant="outline" size="lg" className="w-full">
            <Plus className="w-5 h-5 mr-2" />
            Добавить продукт
          </Button>
          <Button variant="peach" size="lg" className="w-full">
            <Share2 className="w-5 h-5 mr-2" />
            Поделиться списком
          </Button>
        </div>
      </div>
    </MobileLayout>
  );
}
