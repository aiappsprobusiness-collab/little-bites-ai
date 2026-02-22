import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const MEAL_OPTIONS = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "snack", label: "Полдник" },
  { id: "dinner", label: "Ужин" },
  { id: "other", label: "Другое" },
] as const;

export interface MyRecipeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, edit mode; otherwise create. */
  recipeId?: string | null;
  /** Prefill for create; required when editing (loaded from getRecipeById). */
  initialData?: {
    title: string;
    description?: string | null;
    meal_type?: string | null;
    chef_advice?: string | null;
    steps: { instruction: string; step_number?: number }[];
    ingredients: { name: string; amount?: number | null; unit?: string | null; display_text?: string | null }[];
  } | null;
  onSuccess?: () => void;
}

export function MyRecipeFormSheet({
  open,
  onOpenChange,
  recipeId,
  initialData,
  onSuccess,
}: MyRecipeFormSheetProps) {
  const { toast } = useToast();
  const { createUserRecipe, updateUserRecipe, isCreating, isUpdating } = useMyRecipes();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState<string>("");
  const [chefAdvice, setChefAdvice] = useState("");
  const [steps, setSteps] = useState<{ instruction: string; step_number?: number }[]>([{ instruction: "" }]);
  const [ingredients, setIngredients] = useState<{ name: string; amount?: number | null; unit?: string | null }[]>([
    { name: "", amount: null, unit: "" },
  ]);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (recipeId && initialData) {
      setTitle(initialData.title ?? "");
      setDescription(initialData.description ?? "");
      setMealType(initialData.meal_type ?? "");
      setChefAdvice(initialData.chef_advice ?? "");
      setSteps(
        initialData.steps?.length
          ? initialData.steps.map((s, i) => ({ instruction: s.instruction ?? "", step_number: s.step_number ?? i + 1 }))
          : [{ instruction: "" }]
      );
      setIngredients(
        initialData.ingredients?.length
          ? initialData.ingredients.map((ing) => ({
              name: ing.name ?? "",
              amount: ing.amount ?? null,
              unit: ing.unit ?? "",
            }))
          : [{ name: "", amount: null, unit: "" }]
      );
    } else if (recipeId && !initialData) {
      setEditLoading(true);
      (async () => {
        try {
          const [fullRes, ingRes] = await Promise.all([
            supabase.rpc("get_recipe_full", { p_recipe_id: recipeId }),
            supabase.from("recipe_ingredients").select("name, amount, unit, display_text").eq("recipe_id", recipeId).order("order_index"),
          ]);
          const row = Array.isArray(fullRes.data) ? fullRes.data[0] : fullRes.data;
          const ingRows = (ingRes.data ?? []) as { name?: string; amount?: number | null; unit?: string | null; display_text?: string | null }[];
          if (row) {
            setTitle((row as { title?: string }).title ?? "");
            setDescription((row as { description?: string }).description ?? "");
            setMealType((row as { meal_type?: string }).meal_type ?? "");
            setChefAdvice((row as { chef_advice?: string }).chef_advice ?? "");
            const stepsJson = (row as { steps_json?: { instruction?: string; step_number?: number }[] }).steps_json;
            const stepList = Array.isArray(stepsJson) ? stepsJson : [];
            setSteps(stepList.length ? stepList.map((s) => ({ instruction: s.instruction ?? "", step_number: s.step_number })) : [{ instruction: "" }]);
            setIngredients(
              ingRows.length
                ? ingRows.map((ing) => ({ name: ing.name ?? "", amount: ing.amount ?? null, unit: ing.unit ?? "" }))
                : [{ name: "", amount: null, unit: "" }]
            );
          }
        } finally {
          setEditLoading(false);
        }
      })();
    } else {
      setTitle("");
      setDescription("");
      setMealType("");
      setChefAdvice("");
      setSteps([{ instruction: "" }]);
      setIngredients([{ name: "", amount: null, unit: "" }]);
    }
  }, [open, recipeId, initialData]);

  const addStep = () => setSteps((prev) => [...prev, { instruction: "" }]);
  const removeStep = (i: number) =>
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  const setStepInstruction = (i: number, v: string) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, instruction: v } : s)));

  const addIngredient = () => setIngredients((prev) => [...prev, { name: "", amount: null, unit: "" }]);
  const removeIngredient = (i: number) =>
    setIngredients((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  const setIngredient = (i: number, field: "name" | "amount" | "unit", value: string | number | null) => {
    setIngredients((prev) =>
      prev.map((ing, idx) => {
        if (idx !== i) return ing;
        if (field === "amount") return { ...ing, amount: value === "" || value === null ? null : Number(value) };
        return { ...ing, [field]: value };
      })
    );
  };

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t) {
      toast({ variant: "destructive", title: "Введите название" });
      return;
    }
    const stepsFiltered = steps.map((s, i) => ({ instruction: (s.instruction ?? "").trim(), step_number: i + 1 })).filter((s) => s.instruction);
    if (stepsFiltered.length === 0) {
      toast({ variant: "destructive", title: "Добавьте хотя бы один шаг" });
      return;
    }
    const ingsFiltered = ingredients
      .map((ing, idx) => ({
        name: (ing.name ?? "").trim(),
        amount: ing.amount ?? null,
        unit: (ing.unit ?? "").trim() || null,
        order_index: idx,
      }))
      .filter((ing) => ing.name);
    if (ingsFiltered.length === 0) {
      toast({ variant: "destructive", title: "Добавьте хотя бы один ингредиент" });
      return;
    }

    try {
      if (recipeId) {
        await updateUserRecipe({
          recipe_id: recipeId,
          title: t,
          description: description.trim() || null,
          meal_type: mealType.trim() || null,
          tags: [],
          chef_advice: chefAdvice.trim() || null,
          steps: stepsFiltered,
          ingredients: ingsFiltered,
        });
        toast({ title: "Рецепт обновлён" });
      } else {
        await createUserRecipe({
          title: t,
          description: description.trim() || null,
          meal_type: mealType.trim() || null,
          tags: [],
          chef_advice: chefAdvice.trim() || null,
          steps: stepsFiltered,
          ingredients: ingsFiltered,
        });
        toast({ title: "Рецепт создан" });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось сохранить" });
    }
  };

  const isSaving = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">
            {recipeId ? "Редактировать рецепт" : "Создать свой рецепт"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 pb-6 overflow-y-auto flex-1 min-h-0">
          {editLoading && (
            <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Загрузка…</span>
            </div>
          )}
          {!editLoading && (
          <>
          <div>
            <Label htmlFor="my-recipe-title">Название *</Label>
            <Input
              id="my-recipe-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название блюда"
              className="mt-1.5 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="my-recipe-desc">Описание</Label>
            <Input
              id="my-recipe-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Кратко о блюде"
              className="mt-1.5 rounded-xl"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Тип приёма пищи</Label>
            <div className="flex flex-wrap gap-2">
              {MEAL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMealType(m.id)}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    mealType === m.id
                      ? "bg-[#6b7c3d]/15 border-[#6b7c3d]/40 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="my-recipe-chef">Совет от шефа</Label>
            <Input
              id="my-recipe-chef"
              value={chefAdvice}
              onChange={(e) => setChefAdvice(e.target.value)}
              placeholder="Необязательно: совет/заметка…"
              className="mt-1.5 rounded-xl"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Ингредиенты *</Label>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-[#6b7c3d]" onClick={addIngredient}>
                <Plus className="w-3.5 h-3.5" />
                Добавить
              </Button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    value={ing.name}
                    onChange={(e) => setIngredient(i, "name", e.target.value)}
                    placeholder="Название"
                    className="flex-1 rounded-xl"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={ing.amount ?? ""}
                    onChange={(e) => setIngredient(i, "amount", e.target.value === "" ? null : e.target.value)}
                    placeholder="Кол-во"
                    className="w-20 rounded-xl"
                  />
                  <Input
                    value={ing.unit ?? ""}
                    onChange={(e) => setIngredient(i, "unit", e.target.value)}
                    placeholder="ед."
                    className="w-16 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() => removeIngredient(i)}
                    disabled={ingredients.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Шаги приготовления *</Label>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-[#6b7c3d]" onClick={addStep}>
                <Plus className="w-3.5 h-3.5" />
                Добавить
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-typo-caption text-muted-foreground pt-2.5 shrink-0">{i + 1}.</span>
                  <Input
                    value={s.instruction}
                    onChange={(e) => setStepInstruction(i, e.target.value)}
                    placeholder="Описание шага"
                    className="flex-1 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() => removeStep(i)}
                    disabled={steps.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full rounded-xl bg-[#6b7c3d] hover:bg-[#6b7c3d]/90"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Сохраняем…
              </>
            ) : recipeId ? (
              "Сохранить изменения"
            ) : (
              "Создать рецепт"
            )}
          </Button>
          </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
