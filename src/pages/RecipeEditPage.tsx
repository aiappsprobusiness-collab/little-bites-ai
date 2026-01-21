import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Loader2, Save } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useChildren } from "@/hooks/useChildren";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const productCategories = [
  { id: "vegetables", label: "Овощи" },
  { id: "fruits", label: "Фрукты" },
  { id: "dairy", label: "Молочное" },
  { id: "meat", label: "Мясо" },
  { id: "grains", label: "Крупы" },
  { id: "other", label: "Другое" },
];

export default function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { children } = useChildren();
  const { getRecipeById, createRecipe, updateRecipe } = useRecipes();
  const { data: existingRecipe, isLoading: isLoadingRecipe } = getRecipeById(id || "");

  const isEditing = !!id;
  const sourceProducts = (location.state as any)?.sourceProducts || [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cookingTime, setCookingTime] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [childId, setChildId] = useState<string>("");
  const [ingredients, setIngredients] = useState<
    Array<{ name: string; amount: string; unit: string; category: string }>
  >([]);
  const [steps, setSteps] = useState<Array<{ instruction: string; duration: string }>>([]);

  useEffect(() => {
    // Если есть продукты из ScanPage, добавляем их как ингредиенты
    if (sourceProducts.length > 0 && ingredients.length === 0) {
      setIngredients(
        sourceProducts.map((product: string) => ({
          name: product,
          amount: "",
          unit: "",
          category: "other",
        }))
      );
    }

    if (existingRecipe) {
      setTitle(existingRecipe.title);
      setDescription(existingRecipe.description || "");
      setCookingTime(existingRecipe.cooking_time_minutes?.toString() || "");
      setMinAge(existingRecipe.min_age_months?.toString() || "");
      setMaxAge(existingRecipe.max_age_months?.toString() || "");
      setImageUrl(existingRecipe.image_url || "");
      setChildId(existingRecipe.child_id || "");

      const existingIngredients = (existingRecipe as any).ingredients || [];
      setIngredients(
        existingIngredients.map((ing: any) => ({
          name: ing.name,
          amount: ing.amount?.toString() || "",
          unit: ing.unit || "",
          category: ing.category || "other",
        }))
      );

      const existingSteps = (existingRecipe as any).steps || [];
      setSteps(
        existingSteps.map((step: any) => ({
          instruction: step.instruction,
          duration: step.duration_minutes?.toString() || "",
        }))
      );
    }
  }, [existingRecipe]);

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", amount: "", unit: "", category: "other" }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const addStep = () => {
    setSteps([...steps, { instruction: "", duration: "" }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: string, value: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Название рецепта обязательно",
      });
      return;
    }

    try {
      const recipeData = {
        title: title.trim(),
        description: description.trim() || null,
        cooking_time_minutes: cookingTime ? parseInt(cookingTime) : null,
        min_age_months: minAge ? parseInt(minAge) : null,
        max_age_months: maxAge ? parseInt(maxAge) : null,
        image_url: imageUrl.trim() || null,
        child_id: childId || null,
      };

      const ingredientsData = ingredients
        .filter((ing) => ing.name.trim())
        .map((ing, index) => ({
          name: ing.name.trim(),
          amount: ing.amount ? parseFloat(ing.amount) : null,
          unit: ing.unit.trim() || null,
          category: ing.category as any,
          order_index: index,
        }));

      const stepsData = steps
        .filter((step) => step.instruction.trim())
        .map((step, index) => ({
          instruction: step.instruction.trim(),
          step_number: index + 1,
          duration_minutes: step.duration ? parseInt(step.duration) : null,
        }));

      if (isEditing && existingRecipe) {
        await updateRecipe({
          id: existingRecipe.id,
          ...recipeData,
        });
        toast({
          title: "Рецепт обновлен",
          description: "Изменения успешно сохранены",
        });
      } else {
        await createRecipe({
          recipe: recipeData,
          ingredients: ingredientsData,
          steps: stepsData,
        });
        toast({
          title: "Рецепт создан",
          description: "Новый рецепт успешно добавлен",
        });
      }

      navigate(-1);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось сохранить рецепт",
      });
    }
  };

  if (isLoadingRecipe && isEditing) {
    return (
      <MobileLayout title={isEditing ? "Редактировать рецепт" : "Новый рецепт"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title={isEditing ? "Редактировать рецепт" : "Новый рецепт"}>
      <form onSubmit={handleSubmit} className="space-y-6 pb-6">
        <div className="px-4 space-y-4">
          {/* Basic Info */}
          <Card variant="default">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Название рецепта *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Например: Пюре из тыквы"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Краткое описание рецепта"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cookingTime">Время приготовления (мин)</Label>
                  <Input
                    id="cookingTime"
                    type="number"
                    value={cookingTime}
                    onChange={(e) => setCookingTime(e.target.value)}
                    placeholder="20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minAge">Минимальный возраст (мес)</Label>
                  <Input
                    id="minAge"
                    type="number"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    placeholder="6"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">URL изображения</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              {children.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="childId">Для ребенка</Label>
                  <Select value={childId} onValueChange={setChildId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите ребенка (необязательно)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Не указано</SelectItem>
                      {children.map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          {child.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ingredients */}
          <Card variant="mint">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Ингредиенты</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addIngredient}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </div>

              {ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет ингредиентов. Нажмите "Добавить", чтобы добавить первый ингредиент.
                </p>
              ) : (
                <div className="space-y-3">
                  {ingredients.map((ing, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Название"
                          value={ing.name}
                          onChange={(e) =>
                            updateIngredient(index, "name", e.target.value)
                          }
                        />
                        <div className="flex gap-2">
                          <Input
                            placeholder="Количество"
                            type="number"
                            step="0.01"
                            value={ing.amount}
                            onChange={(e) =>
                              updateIngredient(index, "amount", e.target.value)
                            }
                            className="flex-1"
                          />
                          <Input
                            placeholder="Ед. (г, мл, шт)"
                            value={ing.unit}
                            onChange={(e) =>
                              updateIngredient(index, "unit", e.target.value)
                            }
                            className="w-24"
                          />
                        </div>
                        <Select
                          value={ing.category}
                          onValueChange={(value) =>
                            updateIngredient(index, "category", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {productCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeIngredient(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Steps */}
          <Card variant="default">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Шаги приготовления</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addStep}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </div>

              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет шагов. Нажмите "Добавить", чтобы добавить первый шаг.
                </p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step: any, index: number) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold mt-1">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Textarea
                          placeholder="Описание шага"
                          value={step.instruction}
                          onChange={(e) =>
                            updateStep(index, "instruction", e.target.value)
                          }
                          rows={2}
                        />
                        <Input
                          placeholder="Время (мин)"
                          type="number"
                          value={step.duration}
                          onChange={(e) =>
                            updateStep(index, "duration", e.target.value)
                          }
                          className="w-32"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="mint"
            size="lg"
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            {isEditing ? "Сохранить изменения" : "Создать рецепт"}
          </Button>
        </div>
      </form>
    </MobileLayout>
  );
}
