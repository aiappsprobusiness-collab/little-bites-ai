import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useFamily } from "@/contexts/FamilyContext";
import { useAssignRecipeToPlanSlot, getRollingDayKeys } from "@/hooks/useAssignRecipeToPlanSlot";
import { formatLocalDate } from "@/utils/dateUtils";
import { cn } from "@/lib/utils";

const MEAL_TYPES = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "snack", label: "Полдник" },
  { id: "dinner", label: "Ужин" },
] as const;

function getDayLabel(dayKey: string): string {
  const d = new Date(dayKey + "T12:00:00");
  const today = new Date();
  const isToday = formatLocalDate(d) === formatLocalDate(today);
  if (isToday) return "Сегодня";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (formatLocalDate(d) === formatLocalDate(tomorrow)) return "Завтра";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  return d.toLocaleDateString("ru-RU", opts);
}

export interface AddToPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeTitle: string;
  /** Дефолтный приём из рецепта. */
  mealType?: string | null;
  /** Дефолтный профиль: из контекста (чат/избранное). */
  defaultMemberId: string | null;
  onSuccess?: () => void;
}

export function AddToPlanSheet({
  open,
  onOpenChange,
  recipeId,
  recipeTitle,
  mealType: initialMealType,
  defaultMemberId,
  onSuccess,
}: AddToPlanSheetProps) {
  const { members } = useFamily();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(defaultMemberId ?? null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => getRollingDayKeys()[0] ?? formatLocalDate(new Date()));
  const [selectedMealType, setSelectedMealType] = useState<string>(() => {
    const norm = initialMealType?.toLowerCase();
    if (norm && MEAL_TYPES.some((m) => m.id === norm)) return norm;
    return "breakfast";
  });

  const { toast } = useToast();
  const memberIdForRpc = selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId;
  const { assignRecipeToPlanSlot, isAssigning } = useAssignRecipeToPlanSlot(memberIdForRpc);

  const dayKeys = getRollingDayKeys();

  const handleAssign = async () => {
    try {
      await assignRecipeToPlanSlot({
        member_id: memberIdForRpc,
        day_key: selectedDayKey,
        meal_type: selectedMealType,
        recipe_id: recipeId,
        recipe_title: recipeTitle,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось добавить в план" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">Добавить в план</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 pb-6 overflow-y-auto">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Кому</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedMemberId("family")}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                  (selectedMemberId === "family" || !selectedMemberId)
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                )}
              >
                Семья
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    selectedMemberId === m.id
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {(m as { name?: string }).name ?? m.id}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Когда</p>
            <div className="flex flex-wrap gap-2">
              {dayKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDayKey(key)}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1",
                    selectedDayKey === key
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {getDayLabel(key)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Приём пищи</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMealType(m.id)}
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                    selectedMealType === m.id
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleAssign}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Добавляем…
              </>
            ) : (
              "Добавить в план"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
