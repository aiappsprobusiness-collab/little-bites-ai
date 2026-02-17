import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeError } from "@/utils/safeLogger";

interface GeneratedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MealEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: GeneratedMeal | null;
  mealType: string;
  dayName: string;
  childData: {
    name: string;
    ageMonths: number;
    allergies: string[];
    goals: string[];
  };
  onSave: (meal: GeneratedMeal) => void;
}

const mealTypeLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Полдник",
  dinner: "Ужин",
};

export function MealEditDialog({
  open,
  onOpenChange,
  meal,
  mealType,
  dayName,
  childData,
  onSave,
}: MealEditDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editedMeal, setEditedMeal] = useState<GeneratedMeal | null>(meal);
  const [alternatives, setAlternatives] = useState<GeneratedMeal[]>([]);

  // Update edited meal when dialog opens with new meal
  useState(() => {
    setEditedMeal(meal);
    setAlternatives([]);
  });

  const generateAlternatives = async () => {
    if (!meal) return;

    setIsGenerating(true);
    setAlternatives([]);

    try {
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `https://hidgiyyunigqazssnydm.supabase.co/functions/v1/deepseek-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            type: "chat",
            messages: [
              {
                role: "user",
                content: `Предложи 3 альтернативных блюда вместо "${meal.name}" для ${mealTypeLabels[mealType]?.toLowerCase() || mealType}.

Контекст:
- Ребенок: ${childData.name}, ${childData.ageMonths} месяцев
- Цели: ${childData.goals.join(", ") || "сбалансированное питание"}
${childData.allergies.length ? `- ИСКЛЮЧИ (аллергия): ${childData.allergies.join(", ")}` : ""}

Верни ТОЛЬКО JSON массив без markdown:
[
  {"name": "Название 1", "calories": 250, "protein": 10, "carbs": 30, "fat": 8},
  {"name": "Название 2", "calories": 280, "protein": 12, "carbs": 35, "fat": 6},
  {"name": "Название 3", "calories": 220, "protein": 8, "carbs": 28, "fat": 7}
]`,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate alternatives");
      }

      const data = await response.json();

      // Parse JSON from response
      const jsonMatch = data.message.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as GeneratedMeal[];
        setAlternatives(parsed);
      }
    } catch (err) {
      safeError("Error generating alternatives:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (editedMeal) {
      onSave(editedMeal);
      onOpenChange(false);
    }
  };

  const selectAlternative = (alt: GeneratedMeal) => {
    setEditedMeal(alt);
  };

  if (!meal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-typo-title">
              {mealTypeLabels[mealType] || mealType}
            </span>
            <span className="text-muted-foreground font-normal text-typo-muted">
              • {dayName}
            </span>
          </DialogTitle>
          <DialogDescription>Измените блюдо или удалите его из плана</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Meal Edit */}
          <div className="space-y-3">
            <Label htmlFor="meal-name">Название блюда</Label>
            <Input
              id="meal-name"
              value={editedMeal?.name || ""}
              onChange={(e) =>
                setEditedMeal((prev) =>
                  prev ? { ...prev, name: e.target.value } : null
                )
              }
            />

            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-typo-caption text-muted-foreground">Ккал</Label>
                <Input
                  type="number"
                  value={editedMeal?.calories || 0}
                  onChange={(e) =>
                    setEditedMeal((prev) =>
                      prev ? { ...prev, calories: Number(e.target.value) } : null
                    )
                  }
                  className="h-9 text-typo-muted"
                />
              </div>
              <div>
                <Label className="text-typo-caption text-muted-foreground">Белки</Label>
                <Input
                  type="number"
                  value={editedMeal?.protein || 0}
                  onChange={(e) =>
                    setEditedMeal((prev) =>
                      prev ? { ...prev, protein: Number(e.target.value) } : null
                    )
                  }
                  className="h-9 text-typo-muted"
                />
              </div>
              <div>
                <Label className="text-typo-caption text-muted-foreground">Углев</Label>
                <Input
                  type="number"
                  value={editedMeal?.carbs || 0}
                  onChange={(e) =>
                    setEditedMeal((prev) =>
                      prev ? { ...prev, carbs: Number(e.target.value) } : null
                    )
                  }
                  className="h-9 text-typo-muted"
                />
              </div>
              <div>
                <Label className="text-typo-caption text-muted-foreground">Жиры</Label>
                <Input
                  type="number"
                  value={editedMeal?.fat || 0}
                  onChange={(e) =>
                    setEditedMeal((prev) =>
                      prev ? { ...prev, fat: Number(e.target.value) } : null
                    )
                  }
                  className="h-9 text-typo-muted"
                />
              </div>
            </div>
          </div>

          {/* Generate Alternatives */}
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={generateAlternatives}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Генерируем варианты...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Предложить альтернативы
                </>
              )}
            </Button>
          </div>

          {/* Alternatives List */}
          {alternatives.length > 0 && (
            <div className="space-y-2">
              <Label className="text-typo-muted">Выберите замену:</Label>
              {alternatives.map((alt, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => selectAlternative(alt)}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${editedMeal?.name === alt.name
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                    }`}
                >
                  <p className="text-typo-muted font-semibold">{alt.name}</p>
                  <p className="text-typo-caption text-muted-foreground mt-1">
                    {alt.calories} ккал • Б:{alt.protein}г У:{alt.carbs}г Ж:{alt.fat}г
                  </p>
                </motion.button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button className="flex-1 bg-primary hover:opacity-90 text-white border-0" onClick={handleSave}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Заменить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
