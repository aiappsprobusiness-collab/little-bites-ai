import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Baby, Plus, Edit2, AlertTriangle, ChefHat, Heart, Calendar, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useChildren } from "@/hooks/useChildren";
import { useRecipes } from "@/hooks/useRecipes";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useToast } from "@/hooks/use-toast";

import type { Tables } from "@/integrations/supabase/types";

const allergyOptions = [
  "Молоко", "Яйца", "Глютен", "Орехи", "Соя", "Рыба", "Мед", "Цитрусы"
];

type Child = Tables<'children'>;

export default function ProfilePage() {
  const { toast } = useToast();
  const {
    children,
    isLoading,
    formatAge,
    createChild,
    updateChild,
    deleteChild,
    isCreating,
    isUpdating,
  } = useChildren();
  const { recipes } = useRecipes();
  const { getMealPlans } = useMealPlans();


  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);

  // Обновляем selectedChildId когда загружаются children
  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  const selectedChild = children.find(c => c.id === selectedChildId);

  // Статистика для выбранного ребенка
  const childRecipes = selectedChild ? recipes.filter(r => r.child_id === selectedChild.id) : [];
  const favoriteRecipes = childRecipes.filter(r => r.is_favorite).length;


  // Планы питания (примерно, можно улучшить)
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const { data: mealPlans = [] } = getMealPlans(weekStart, weekEnd);
  const childMealPlans = selectedChild ? mealPlans.filter(mp => mp.child_id === selectedChild.id) : [];


  const handleCreateChild = () => {
    setEditingChild(null);
    setIsEditDialogOpen(true);
  };

  const handleEditChild = (child: Child) => {
    setEditingChild(child);
    setIsEditDialogOpen(true);
  };

  const handleSaveChild = async (formData: {
    name: string;
    birthDate: string;
    likes: string[];
    dislikes: string[];
    allergies: string[];
    preferences: string[];
  }) => {
    try {
      // Убеждаемся, что передаем массивы строк, а не строки
      const likesArray = Array.isArray(formData.likes) ? formData.likes.filter(l => l?.trim()) : [];
      const dislikesArray = Array.isArray(formData.dislikes) ? formData.dislikes.filter(d => d?.trim()) : [];
      const allergiesArray = Array.isArray(formData.allergies) ? formData.allergies.filter(a => a?.trim()) : [];
      const preferencesArray = Array.isArray(formData.preferences) ? formData.preferences.filter(p => p?.trim()) : [];
      
      if (editingChild) {
        await updateChild({
          id: editingChild.id,
          name: formData.name,
          birth_date: formData.birthDate,
          likes: likesArray,
          dislikes: dislikesArray,
          allergies: allergiesArray,
          preferences: preferencesArray,
        });
        toast({
          title: "Профиль обновлен",
          description: "Данные ребенка успешно сохранены",
        });
      } else {
        const newChild = await createChild({
          name: formData.name,
          birth_date: formData.birthDate,
          likes: likesArray,
          dislikes: dislikesArray,
          allergies: allergiesArray,
          preferences: preferencesArray,
        });
        setSelectedChildId(newChild.id);
        toast({
          title: "Ребенок добавлен",
          description: "Профиль успешно создан",
        });
      }
      setIsEditDialogOpen(false);
      setEditingChild(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось сохранить данные",
      });
    }
  };

  const handleDeleteChild = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить профиль ребенка?")) return;

    try {
      await deleteChild(id);
      if (selectedChildId === id) {
        setSelectedChildId(children.find(c => c.id !== id)?.id || null);
      }
      toast({
        title: "Профиль удален",
        description: "Профиль ребенка успешно удален",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось удалить профиль",
      });
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="Семья">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Семья">
      <div className="px-4 pt-6 space-y-6">
        {/* Child Selector */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {children.map((child) => (
            <motion.button
              key={child.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedChildId(child.id)}
              className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${selectedChildId === child.id
                  ? "bg-primary text-primary-foreground shadow-button"
                  : "bg-card shadow-soft"
                }`}
            >
              <span className="text-2xl">{child.avatar_url || "👶"}</span>
              <div className="text-left">
                <p className="font-semibold">{child.name}</p>
                <p className="text-xs opacity-80">{formatAge(child.birth_date)}</p>
              </div>
            </motion.button>
          ))}
          <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
            <DialogTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleCreateChild}
                className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30"
              >
                <Plus className="w-6 h-6 text-muted-foreground" />
              </motion.button>
            </DialogTrigger>
            <ChildEditDialog
              key={editingChild?.id || 'new'}
              child={editingChild}
              onSave={handleSaveChild}
              isLoading={isCreating || isUpdating}
            />
          </Dialog>
        </div>

        {selectedChild ? (
          <>
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card variant="elevated" className="overflow-hidden">
                <div className="h-24 gradient-primary" />
                <CardContent className="relative pt-0">
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                    <div className="w-24 h-24 rounded-3xl bg-card shadow-card flex items-center justify-center text-5xl border-4 border-card">
                      {selectedChild.avatar_url || "👶"}
                    </div>
                  </div>
                  <div className="pt-14 text-center">
                    <h2 className="text-2xl font-bold">{selectedChild.name}</h2>
                    <p className="text-muted-foreground flex items-center justify-center gap-2 mt-1">
                      <Baby className="w-4 h-4" />
                      {formatAge(selectedChild.birth_date)}
                    </p>
                    <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => selectedChild && handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        key={editingChild?.id || 'new'}
                        child={editingChild}
                        onSave={handleSaveChild}
                        isLoading={isCreating || isUpdating}
                      />
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-3 gap-3"
            >
              {[
                { icon: ChefHat, label: "Рецепты", value: childRecipes.length, color: "mint" },
                { icon: Heart, label: "Избранное", value: favoriteRecipes, color: "peach" },
                { icon: Calendar, label: "Запланировано", value: childMealPlans.length, color: "lavender" },
              ].map((stat) => (
                <Card key={stat.label} variant={stat.color as any} className="text-center">
                  <CardContent className="p-4">
                    <stat.icon className="w-6 h-6 mx-auto mb-2 opacity-80" />
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {/* Likes */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card variant="default">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-primary" />
                      <h3 className="font-bold">Любит</h3>
                    </div>
                    <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectedChild && handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        key={editingChild?.id || 'new'}
                        child={editingChild}
                        onSave={handleSaveChild}
                        isLoading={isCreating || isUpdating}
                      />
                    </Dialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(selectedChild.likes) && selectedChild.likes.length > 0 ? (
                      selectedChild.likes.map((like) => (
                        <span
                          key={like}
                          className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                        >
                          {like}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Не указано</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Dislikes */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card variant="default">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <X className="w-5 h-5 text-muted-foreground" />
                      <h3 className="font-bold">Не любит</h3>
                    </div>
                    <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectedChild && handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        key={editingChild?.id || 'new'}
                        child={editingChild}
                        onSave={handleSaveChild}
                        isLoading={isCreating || isUpdating}
                      />
                    </Dialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(selectedChild.dislikes) && selectedChild.dislikes.length > 0 ? (
                      selectedChild.dislikes.map((dislike) => (
                        <span
                          key={dislike}
                          className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium"
                        >
                          {dislike}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Не указано</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Allergies */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card variant="default">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <h3 className="font-bold">Аллергии и ограничения</h3>
                    </div>
                    <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectedChild && handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        key={editingChild?.id || 'new'}
                        child={editingChild}
                        onSave={handleSaveChild}
                        isLoading={isCreating || isUpdating}
                      />
                    </Dialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(selectedChild.allergies) && selectedChild.allergies.length > 0 ? (
                      selectedChild.allergies.map((allergy) => (
                        <span
                          key={allergy}
                          className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium"
                        >
                          {allergy}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Нет аллергий</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Preferences */}
            {Array.isArray(selectedChild.preferences) && selectedChild.preferences.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card variant="default">
                  <CardContent className="p-5">
                    <h3 className="font-bold mb-4">Предпочтения</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedChild.preferences.map((pref) => (
                        <span
                          key={pref}
                          className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                        >
                          {pref}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}


            {/* Delete Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => selectedChild && handleDeleteChild(selectedChild.id)}
            >
              Удалить профиль
            </Button>
            </motion.div>
          </>
        ) : (
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <Baby className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет профилей детей</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте профиль ребенка, чтобы начать использовать приложение
              </p>
              <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingChild(null);
          }}>
                <DialogTrigger asChild>
                  <Button variant="mint" onClick={handleCreateChild}>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить ребенка
                  </Button>
                </DialogTrigger>
                <ChildEditDialog
                  key={editingChild?.id || 'new'}
                  child={editingChild}
                  onSave={handleSaveChild}
                  isLoading={isCreating}
                />
              </Dialog>
            </CardContent>
          </Card>
        )}
      </div>
    </MobileLayout>
  );
}

// Компонент диалога для создания/редактирования ребенка
function ChildEditDialog({
  child,
  onSave,
  isLoading,
}: {
  child: Child | null;
  onSave: (data: {
    name: string;
    birthDate: string;
    likes: string[];
    dislikes: string[];
    allergies: string[];
    preferences: string[];
  }) => void;
  isLoading: boolean;
}) {
  // Безопасная функция для преобразования в массив строк
  const ensureStringArray = (value: any): string[] => {
    if (Array.isArray(value)) {
      // Если это массив, проверяем каждый элемент
      return value
        .map((item) => {
          // Если элемент - строка, которая является JSON-массивом, парсим её
          if (typeof item === 'string' && item.trim().startsWith('[') && item.trim().endsWith(']')) {
            try {
              const parsed = JSON.parse(item);
              return Array.isArray(parsed) ? parsed : [item];
            } catch {
              return item;
            }
          }
          return item;
        })
        .flat()
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim());
    }
    if (typeof value === 'string' && value.trim()) {
      // Если это строка, которая является JSON-массивом, парсим её
      if (value.trim().startsWith('[') && value.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
          }
        } catch {
          // Если не JSON, разбиваем по запятым
        }
      }
      // Если не JSON-массив, разбиваем по запятым
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };

  const [name, setName] = useState(child?.name || "");
  const [birthDate, setBirthDate] = useState(
    child?.birth_date || new Date().toISOString().split("T")[0]
  );
  const [likes, setLikes] = useState<string[]>(() => ensureStringArray(child?.likes));
  const [dislikes, setDislikes] = useState<string[]>(() => ensureStringArray(child?.dislikes));
  const [allergies, setAllergies] = useState<string[]>(() => ensureStringArray(child?.allergies));
  const [preferences, setPreferences] = useState<string[]>(() => ensureStringArray(child?.preferences));
  const [newAllergy, setNewAllergy] = useState("");
  const [newLike, setNewLike] = useState("");
  const [newDislike, setNewDislike] = useState("");

  // Синхронизируем состояние с пропсом child при его изменении
  useEffect(() => {
    if (child) {
      setName(child.name || "");
      setBirthDate(child.birth_date || new Date().toISOString().split("T")[0]);
      // Убеждаемся, что likes/dislikes/allergies - это массивы (безопасное преобразование)
      setLikes(ensureStringArray(child.likes));
      setDislikes(ensureStringArray(child.dislikes));
      setAllergies(ensureStringArray(child.allergies));
      setPreferences(ensureStringArray(child.preferences));
    } else {
      // Сброс для создания нового профиля
      setName("");
      setBirthDate(new Date().toISOString().split("T")[0]);
      setLikes([]);
      setDislikes([]);
      setAllergies([]);
      setPreferences([]);
    }
    setNewAllergy("");
    setNewLike("");
    setNewDislike("");
  }, [child]);

  const toggleAllergy = (allergy: string) => {
    setAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    );
  };

  const addCustomAllergy = () => {
    const trimmed = newAllergy.trim();
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies([...allergies, trimmed]);
      setNewAllergy("");
    }
  };

  const removeAllergy = (allergy: string) => {
    setAllergies(allergies.filter((a) => a !== allergy));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Убеждаемся, что передаем массивы, а не строки
    const likesArray = Array.isArray(likes) ? likes.filter(l => l?.trim()) : [];
    const dislikesArray = Array.isArray(dislikes) ? dislikes.filter(d => d?.trim()) : [];
    const allergiesArray = Array.isArray(allergies) ? allergies.filter(a => a?.trim()) : [];
    const preferencesArray = Array.isArray(preferences) ? preferences.filter(p => p?.trim()) : [];
    
    onSave({ 
      name, 
      birthDate, 
      likes: likesArray, 
      dislikes: dislikesArray, 
      allergies: allergiesArray, 
      preferences: preferencesArray 
    });
  };

  const addLike = () => {
    const trimmed = newLike.trim();
    const safeLikes = Array.isArray(likes) ? likes : [];
    if (trimmed && !safeLikes.includes(trimmed)) {
      setLikes([...safeLikes, trimmed]);
      setNewLike("");
    }
  };

  const removeLike = (like: string) => {
    const safeLikes = Array.isArray(likes) ? likes : [];
    setLikes(safeLikes.filter((l) => l !== like));
  };

  const addDislike = () => {
    const trimmed = newDislike.trim();
    const safeDislikes = Array.isArray(dislikes) ? dislikes : [];
    if (trimmed && !safeDislikes.includes(trimmed)) {
      setDislikes([...safeDislikes, trimmed]);
      setNewDislike("");
    }
  };

  const removeDislike = (dislike: string) => {
    const safeDislikes = Array.isArray(dislikes) ? dislikes : [];
    setDislikes(safeDislikes.filter((d) => d !== dislike));
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{child ? "Редактировать профиль" : "Добавить ребенка"}</DialogTitle>
        <DialogDescription>
          {child
            ? "Обновите информацию о ребенке"
            : "Создайте профиль для вашего ребенка"}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Имя</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Введите имя"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthDate">Дата рождения</Label>
          <Input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            max={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div className="space-y-2">
          <Label>Любит</Label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Введите продукт, который любит"
                value={newLike}
                onChange={(e) => setNewLike(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLike();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addLike}
                disabled={!newLike.trim() || (Array.isArray(likes) && likes.includes(newLike.trim()))}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {Array.isArray(likes) && likes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {likes.map((like) => (
                  <span
                    key={like}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                  >
                    {like}
                    <button
                      type="button"
                      onClick={() => removeLike(like)}
                      className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Не любит</Label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Введите продукт, который не любит"
                value={newDislike}
                onChange={(e) => setNewDislike(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDislike();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addDislike}
                disabled={!newDislike.trim() || (Array.isArray(dislikes) && dislikes.includes(newDislike.trim()))}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {Array.isArray(dislikes) && dislikes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dislikes.map((dislike) => (
                  <span
                    key={dislike}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium"
                  >
                    {dislike}
                    <button
                      type="button"
                      onClick={() => removeDislike(dislike)}
                      className="ml-1 hover:bg-muted/80 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Аллергии и ограничения</Label>

          {/* Предустановленные аллергии */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Выберите из списка:</p>
            <div className="flex flex-wrap gap-2">
              {allergyOptions.map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  onClick={() => toggleAllergy(allergy)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${allergies.includes(allergy)
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                >
                  {allergy}
                </button>
              ))}
            </div>
          </div>

          {/* Добавление кастомной аллергии */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">Или добавьте свою:</p>
            <div className="flex gap-2">
              <Input
                placeholder="Введите название аллергии"
                value={newAllergy}
                onChange={(e) => setNewAllergy(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAllergy();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomAllergy}
                disabled={!newAllergy.trim() || allergies.includes(newAllergy.trim())}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Список выбранных аллергий */}
          {allergies.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground">Выбранные аллергии:</p>
              <div className="flex flex-wrap gap-2">
                {allergies.map((allergy) => (
                  <span
                    key={allergy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium"
                  >
                    {allergy}
                    <button
                      type="button"
                      onClick={() => removeAllergy(allergy)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="mint"
            disabled={isLoading || !name}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
