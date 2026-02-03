import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { Baby, Plus, Edit2, AlertTriangle, ChefHat, Heart, Calendar, Loader2, X, LogOut, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useMembers, birthDateToAgeMonths } from "@/hooks/useMembers";
import { useRecipes } from "@/hooks/useRecipes";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useToast } from "@/hooks/use-toast";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { ensureStringArray } from "@/utils/typeUtils";

const VEGETABLE_EMOJIS = ["🥕", "🥦", "🍅", "🥬", "🌽"];
function memberAvatar(_member: MembersRow, index: number): React.ReactNode {
  return <span className="text-2xl">{VEGETABLE_EMOJIS[index % VEGETABLE_EMOJIS.length]}</span>;
}

const allergyOptions = [
  "Молоко", "Яйца", "Глютен", "Орехи", "Соя", "Рыба", "Мед", "Цитрусы"
];

export default function ProfilePage() {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { children, isLoading, formatAge, selectedChildId, setSelectedChildId, selectedChild } = useSelectedChild();
  const { createMember, updateMember, deleteMember, isCreating, isUpdating } = useMembers();
  const { recipes } = useRecipes();
  const { getMealPlans } = useMealPlans();

  const [displayName, setDisplayName] = useState(user?.email?.split("@")[0] ?? "");

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<MembersRow | null>(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [sheetChild, setSheetChild] = useState<MembersRow | null>(null);
  const [sheetCreateMode, setSheetCreateMode] = useState(false);

  const recipesList = Array.isArray(recipes) ? recipes as { child_id?: string | null; is_favorite?: boolean }[] : [];
  const childRecipes = selectedChild ? recipesList.filter((r) => r.child_id === selectedChild.id) : [];
  const favoriteRecipes = childRecipes.filter((r) => r.is_favorite).length;

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const { data: mealPlans = [] } = getMealPlans(weekStart, weekEnd);
  const childMealPlans = selectedChild ? mealPlans.filter((mp: { child_id?: string | null }) => mp.child_id === selectedChild.id) : [];


  const handleCreateChild = () => {
    setEditingChild(null);
    setIsEditDialogOpen(true);
  };

  const handleEditChild = (child: MembersRow) => {
    setEditingChild(child);
    setIsEditDialogOpen(true);
  };

  const handleSaveChild = async (formData: {
    name: string;
    birthDate: string;
    likes: string[];
    dislikes: string[];
    allergies: string[];
  }) => {
    try {
      const likesArray = Array.isArray(formData.likes) ? formData.likes.filter(l => l?.trim()) : [];
      const dislikesArray = Array.isArray(formData.dislikes) ? formData.dislikes.filter(d => d?.trim()) : [];
      const allergiesArray = Array.isArray(formData.allergies) ? formData.allergies.filter(a => a?.trim()) : [];

      const ageMonths = formData.birthDate ? Math.max(0, birthDateToAgeMonths(formData.birthDate)) : null;
      if (editingChild) {
        await updateMember({
          id: editingChild.id,
          name: formData.name,
          age_months: ageMonths,
          likes: likesArray,
          dislikes: dislikesArray,
          allergies: allergiesArray,
        });
        toast({ title: "Профиль обновлен", description: "Данные сохранены" });
      } else {
        const newMember = await createMember({
          name: formData.name,
          type: "child",
          age_months: ageMonths,
          likes: likesArray,
          dislikes: dislikesArray,
          allergies: allergiesArray,
        });
        setSelectedChildId(newMember.id);
        toast({ title: "Профиль добавлен", description: "Профиль успешно создан" });
      }
      setIsEditDialogOpen(false);
      setEditingChild(null);
    } catch (error: unknown) {
      console.error("SYNC ERROR:", (error as Error).message, (error as Error).message);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (error as Error).message || "Не удалось сохранить данные",
      });
    }
  };

  const handleDeleteChild = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить профиль?")) return;

    try {
      await deleteMember(id);
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
    <MobileLayout title="Профиль">
      <div className="px-4 pt-6 space-y-6">
        {/* Top: Имя (редактируемое) + Email (только чтение) */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="profile-name" className="text-sm font-medium">Имя</Label>
            <Input
              id="profile-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ваше имя"
              className="h-11 border-2"
              readOnly
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Email</Label>
            <p className="text-sm text-muted-foreground" aria-readonly>{user?.email ?? ""}</p>
          </div>
        </div>

        {/* Моя семья: чипсы + Добавить + Редактировать (ProfileEditSheet из ЧАТА) */}
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left font-medium">
            <span>Моя семья</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 pt-3 pb-2">
              {children.map((child, index) => (
                <motion.button
                  key={child.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSelectedChildId(child.id);
                    setSheetChild(child);
                    setSheetCreateMode(false);
                    setShowProfileSheet(true);
                  }}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${selectedChildId === child.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
                >
                  {memberAvatar(child, index)}
                  <span className="font-medium">{child.name}</span>
                  <span className="text-xs opacity-80">{formatAge(child.age_months ?? null)}</span>
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSheetCreateMode(true);
                  setSheetChild(null);
                  setShowProfileSheet(true);
                }}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/50"
              >
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Добавить</span>
              </motion.button>
            </div>
            {children.length > 0 && selectedChild && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2"
                onClick={() => {
                  setSheetChild(selectedChild);
                  setSheetCreateMode(false);
                  setShowProfileSheet(true);
                }}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Редактировать
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        <ProfileEditSheet
          open={showProfileSheet}
          onOpenChange={setShowProfileSheet}
          child={sheetChild}
          createMode={sheetCreateMode}
          onAddNew={() => {
            setSheetCreateMode(true);
            setSheetChild(null);
            setShowProfileSheet(true);
          }}
          onCreated={(id) => setSelectedChildId(id)}
        />

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
                    <div className="w-24 h-24 rounded-3xl bg-card shadow-card flex items-center justify-center text-5xl border-4 border-card overflow-hidden">
                      <span>{VEGETABLE_EMOJIS[children.findIndex((c) => c.id === selectedChild.id) % VEGETABLE_EMOJIS.length]}</span>
                    </div>
                  </div>
                  <div className="pt-14 text-center">
                    <h2 className="text-2xl font-bold">{selectedChild.name}</h2>
                    <p className="text-muted-foreground flex items-center justify-center gap-2 mt-1">
                      <Baby className="w-4 h-4" />
                      {formatAge(selectedChild.age_months ?? null)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => selectedChild && (setSheetChild(selectedChild), setSheetCreateMode(false), setShowProfileSheet(true))}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedChild && (setSheetChild(selectedChild), setSheetCreateMode(false), setShowProfileSheet(true))}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Редактировать
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedChild && (setSheetChild(selectedChild), setSheetCreateMode(false), setShowProfileSheet(true))}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Редактировать
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedChild && (setSheetChild(selectedChild), setSheetCreateMode(false), setShowProfileSheet(true))}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Редактировать
                    </Button>
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

            {/* Не любит */}
            {Array.isArray(selectedChild.dislikes) && selectedChild.dislikes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card variant="default">
                  <CardContent className="p-5">
                    <h3 className="font-bold mb-4">Не любит</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedChild.dislikes.map((d) => (
                        <span
                          key={d}
                          className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                        >
                          {d}
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
              <Button
                variant="mint"
                onClick={() => (setSheetCreateMode(true), setSheetChild(null), setShowProfileSheet(true))}
              >
                <Plus className="w-4 h-4 mr-2" />
                Добавить ребенка
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Выйти из аккаунта */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="pt-4 pb-8"
        >
          <Button
            variant="outline"
            className="w-full text-muted-foreground border-muted-foreground/30"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Выйти из аккаунта
          </Button>
        </motion.div>
      </div>
    </MobileLayout>
  );
}

// Компонент диалога для создания/редактирования ребенка
function birthDateFromYearsMonths(years: number, months: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function ChildEditDialog({
  child,
  onSave,
  isLoading,
}: {
  child: MembersRow | null;
  onSave: (data: {
    name: string;
    birthDate: string;
    likes: string[];
    dislikes: string[];
    allergies: string[];
  }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(child?.name || "");
  const [likes, setLikes] = useState<string[]>(() => ensureStringArray(child?.likes));
  const [dislikes, setDislikes] = useState<string[]>(() => ensureStringArray(child?.dislikes));
  const [allergies, setAllergies] = useState<string[]>(() => ensureStringArray(child?.allergies));
  const [ageYears, setAgeYears] = useState(0);
  const [ageMonths, setAgeMonths] = useState(0);
  const [newAllergy, setNewAllergy] = useState("");
  const [newLike, setNewLike] = useState("");
  const [newDislike, setNewDislike] = useState("");

  // Вычислить годы и месяцы из birth_date
  const birthDateToYearsMonths = (birthDate: string): { years: number; months: number } => {
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { years: 0, months: 0 };
    const birth = new Date(birthDate);
    const now = new Date();
    let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (now.getDate() < birth.getDate()) months--;
    return { years: Math.floor(months / 12), months: months % 12 };
  };

  useEffect(() => {
    if (child) {
      setName(child.name || "");
      const total = child.age_months ?? 0;
      setAgeYears(Math.floor(total / 12));
      setAgeMonths(total % 12);
      setLikes(ensureStringArray(child.likes));
      setDislikes(ensureStringArray(child.dislikes));
      setAllergies(ensureStringArray(child.allergies));
    } else {
      setName("");
      setAgeYears(0);
      setAgeMonths(0);
      setLikes([]);
      setDislikes([]);
      setAllergies([]);
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
    const likesArray = Array.isArray(likes) ? likes.filter(l => l?.trim()) : [];
    const dislikesArray = Array.isArray(dislikes) ? dislikes.filter(d => d?.trim()) : [];
    const allergiesArray = Array.isArray(allergies) ? allergies.filter(a => a?.trim()) : [];
    const birthDateToSave = birthDateFromYearsMonths(ageYears, ageMonths);
    onSave({
      name,
      birthDate: birthDateToSave,
      likes: likesArray,
      dislikes: dislikesArray,
      allergies: allergiesArray,
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ageYears">Возраст: годы</Label>
            <Input
              id="ageYears"
              type="number"
              min={0}
              max={20}
              value={ageYears === 0 ? "" : ageYears}
              onChange={(e) => setAgeYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ageMonths">Месяцы (0–11)</Label>
            <Input
              id="ageMonths"
              type="number"
              min={0}
              max={11}
              value={ageMonths === 0 ? "" : ageMonths}
              onChange={(e) => setAgeMonths(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
              placeholder="0"
            />
          </div>
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
