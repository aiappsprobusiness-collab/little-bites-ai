import { useState } from "react";
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

  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id || null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);

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
    allergies: string[];
    preferences: string[];
    dislikes: string[];
  }) => {
    try {
      if (editingChild) {
        await updateChild({
          id: editingChild.id,
          name: formData.name,
          birth_date: formData.birthDate,
          allergies: formData.allergies,
          preferences: formData.preferences,
          dislikes: formData.dislikes,
        });
        toast({
          title: "Профиль обновлен",
          description: "Данные ребенка успешно сохранены",
        });
      } else {
        const newChild = await createChild({
          name: formData.name,
          birth_date: formData.birthDate,
          allergies: formData.allergies,
          preferences: formData.preferences,
          dislikes: formData.dislikes,
        });
        setSelectedChildId(newChild.id);
        toast({
          title: "Ребенок добавлен",
          description: "Профиль успешно создан",
        });
      }
      setIsEditDialogOpen(false);
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
      <MobileLayout title="Профиль">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Профиль">
      <div className="px-4 pt-6 space-y-6">
        {/* Child Selector */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {children.map((child) => (
            <motion.button
              key={child.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedChildId(child.id)}
              className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                selectedChildId === child.id
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
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        child={selectedChild}
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

            {/* Allergies */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card variant="default">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <h3 className="font-bold">Аллергии и ограничения</h3>
                    </div>
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditChild(selectedChild)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>
                      </DialogTrigger>
                      <ChildEditDialog
                        child={selectedChild}
                        onSave={handleSaveChild}
                        isLoading={isCreating || isUpdating}
                      />
                    </Dialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedChild.allergies || []).map((allergy) => (
                      <span
                        key={allergy}
                        className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium"
                      >
                        {allergy}
                      </span>
                    ))}
                    {(selectedChild.allergies || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">Нет аллергий</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Preferences */}
            {(selectedChild.preferences || []).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card variant="default">
                  <CardContent className="p-5">
                    <h3 className="font-bold mb-4">Предпочтения</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedChild.preferences!.map((pref) => (
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
                onClick={() => handleDeleteChild(selectedChild.id)}
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
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="mint" onClick={handleCreateChild}>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить ребенка
                  </Button>
                </DialogTrigger>
                <ChildEditDialog
                  child={null}
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
    allergies: string[];
    preferences: string[];
    dislikes: string[];
  }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(child?.name || "");
  const [birthDate, setBirthDate] = useState(
    child?.birth_date || new Date().toISOString().split("T")[0]
  );
  const [allergies, setAllergies] = useState<string[]>(child?.allergies || []);
  const [preferences, setPreferences] = useState<string[]>(child?.preferences || []);
  const [dislikes, setDislikes] = useState<string[]>(child?.dislikes || []);
  const [newAllergy, setNewAllergy] = useState("");

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
    onSave({ name, birthDate, allergies, preferences, dislikes });
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
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    allergies.includes(allergy)
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
