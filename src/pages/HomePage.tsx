import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeListItem } from "@/components/recipes/RecipeListItem";
import { FamilyDashboard } from "@/components/family/FamilyDashboard";
import { ChefHat, Loader2, LayoutGrid, List, Grid3x3, Square, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFamily } from "@/contexts/FamilyContext";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMembers, birthDateToAgeMonths } from "@/hooks/useMembers";
import { useToast } from "@/hooks/use-toast";
import { FF_AUTO_FILL_AFTER_MEMBER_CREATE } from "@/config/featureFlags";
import { startFillDay, setJustCreatedMemberId, getPlanUrlForMember } from "@/services/planFill";

const allergyOptions = [
  "Молоко", "Яйца", "Глютен", "Орехи", "Соя", "Рыба", "Мед", "Цитрусы"
];

type ViewMode = 'list' | 'large' | 'medium' | 'small';

export default function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedMember } = useFamily();
  const { recentRecipes, isLoading: isLoadingRecipes } = useRecipes();
  const { favoriteRecipeIds } = useFavorites();
  const { createMember, isCreating } = useMembers();

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberBirthDate, setNewMemberBirthDate] = useState("");
  const [newMemberAllergies, setNewMemberAllergies] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('medium');

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberBirthDate) return;

    try {
      const ageMonths = birthDateToAgeMonths(newMemberBirthDate);
      const newMember = await createMember({
        name: newMemberName.trim(),
        type: "child",
        age_months: ageMonths || null,
        allergies: newMemberAllergies,
      });
      toast({
        title: "Член семьи добавлен",
        description: `${newMemberName} успешно добавлен`,
      });
      setIsAddMemberOpen(false);
      setNewMemberName("");
      setNewMemberBirthDate("");
      setNewMemberAllergies([]);

      if (FF_AUTO_FILL_AFTER_MEMBER_CREATE) {
        try {
          await startFillDay(newMember.id);
          setJustCreatedMemberId(newMember.id);
          navigate(getPlanUrlForMember(newMember.id));
        } catch (fillError) {
          toast({
            variant: "destructive",
            title: "Ошибка",
            description: "Не удалось подобрать меню. Попробуйте снова.",
          });
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось добавить",
      });
    }
  };

  const toggleAllergy = (allergy: string) => {
    setNewMemberAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    );
  };
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  // Фильтруем рецепты - исключаем рецепты из чата (они показываются только в плане питания)
  const recipesWithoutChat = (recentRecipes || []).filter(r => !r.tags || !Array.isArray(r.tags) || !r.tags.includes('chat'));

  // Форматируем рецепты для отображения
  const formattedRecipes = recipesWithoutChat.slice(0, 4).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    image: "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=400&h=300&fit=crop",
    cookTime: recipe.cooking_time_minutes ? `${recipe.cooking_time_minutes} мин` : "—",
    childName: selectedMember?.name || "—",
    rating: recipe.rating ? recipe.rating / 1 : undefined,
    isFavorite: favoriteRecipeIds.has(recipe.id),
  }));

  return (
    <MobileLayout>
      <div className="px-4 space-y-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold">Привет! 👋</h1>
            <p className="text-typo-body text-muted-foreground">
              Что приготовим сегодня для малыша?
            </p>
          </div>
          <button
            onClick={() => navigate("/profile")}
            className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <User className="w-6 h-6 text-foreground" />
          </button>
        </motion.div>

        {/* Family Dashboard with Carousel */}
        <FamilyDashboard onAddMember={() => setIsAddMemberOpen(true)} />

        {/* Recent Recipes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-typo-title font-semibold">Недавние рецепты</h2>
            <div className="flex items-center gap-2">
              {recipesWithoutChat.length > 0 && (
                <>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`h-7 px-2 rounded transition-colors ${viewMode === 'list'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('large')}
                      className={`h-7 px-2 rounded transition-colors ${viewMode === 'large'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('medium')}
                      className={`h-7 px-2 rounded transition-colors ${viewMode === 'medium'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('small')}
                      className={`h-7 px-2 rounded transition-colors ${viewMode === 'small'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <Grid3x3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/recipes")}>
                    Все →
                  </Button>
                </>
              )}
            </div>
          </div>
          {isLoadingRecipes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : formattedRecipes.length > 0 ? (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className={
                viewMode === 'list'
                  ? 'space-y-2'
                  : viewMode === 'large'
                    ? 'grid grid-cols-1 gap-4'
                    : viewMode === 'medium'
                      ? 'grid grid-cols-2 gap-3'
                      : 'grid grid-cols-3 gap-2'
              }
            >
              {formattedRecipes.map((recipe) => (
                <motion.div key={recipe.id} variants={item}>
                  {viewMode === 'list' ? (
                    <RecipeListItem
                      {...recipe}
                      onClick={() => navigate(`/recipe/${recipe.id}`)}
                    />
                  ) : (
                    <RecipeCard
                      {...recipe}
                      size={
                        viewMode === 'large'
                          ? 'large'
                          : viewMode === 'small'
                            ? 'small'
                            : 'medium'
                      }
                      onClick={() => navigate(`/recipe/${recipe.id}`)}
                    />
                  )}
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Card variant="default" className="p-5">
              <CardContent className="p-0 text-center">
                <p className="text-muted-foreground mb-4">
                  У вас пока нет рецептов
                </p>
                <Button
                  variant="mint"
                  onClick={() => navigate("/scan")}
                >
                  <ChefHat className="w-4 h-4 mr-2" />
                  Создать первый рецепт
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

      </div>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить ребенка</DialogTitle>
            <DialogDescription>
              Создайте профиль для вашего ребенка
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Введите имя"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate">Дата рождения</Label>
              <Input
                id="birthDate"
                type="date"
                value={newMemberBirthDate}
                onChange={(e) => setNewMemberBirthDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="space-y-2">
              <Label>Аллергии (необязательно)</Label>
              <div className="flex flex-wrap gap-2">
                {allergyOptions.map((allergy) => (
                  <button
                    key={allergy}
                    type="button"
                    onClick={() => toggleAllergy(allergy)}
                    className={`px-3 py-1.5 rounded-full text-typo-muted font-semibold transition-colors ${newMemberAllergies.includes(allergy)
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                  >
                    {allergy}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              variant="mint"
              onClick={handleAddMember}
              disabled={!newMemberName.trim() || !newMemberBirthDate || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Добавление...
                </>
              ) : (
                "Добавить ребенка"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MobileLayout>
  );
}
