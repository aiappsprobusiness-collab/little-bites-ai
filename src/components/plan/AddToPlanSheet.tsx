import { useState, useEffect, useMemo } from "react";
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
import { useMealPlans } from "@/hooks/useMealPlans";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRollingStartKey, getRollingEndKey } from "@/utils/dateRange";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { cn } from "@/lib/utils";

const MEAL_TYPES = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "snack", label: "Полдник" },
  { id: "dinner", label: "Ужин" },
] as const;

const MEAL_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;

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
  /** Дефолтный приём из рецепта или контекста (например, слот плана). */
  mealType?: string | null;
  /** Дефолтный профиль: из контекста (чат/избранное/план). */
  defaultMemberId: string | null;
  /** Дефолтный день (YYYY-MM-DD), например при переходе из пустого слота плана. */
  defaultDayKey?: string | null;
  onSuccess?: () => void;
}

function normMealType(v: string | null | undefined): string {
  const norm = v?.toLowerCase().trim();
  if (norm && MEAL_TYPES.some((m) => m.id === norm)) return norm;
  return "breakfast";
}

/** Заливка по заполненности дня (0..4). Оливковая палитра. */
function dayFillClass(filledCount: number): string {
  switch (filledCount) {
    case 0:
      return "bg-background border-border";
    case 1:
      return "bg-[hsl(75,37%,36%,0.06)] border-[hsl(75,37%,36%,0.2)]";
    case 2:
      return "bg-[hsl(75,37%,36%,0.12)] border-[hsl(75,37%,36%,0.3)]";
    case 3:
      return "bg-[hsl(75,37%,36%,0.2)] border-[hsl(75,37%,36%,0.4)]";
    case 4:
      return "bg-primary border-primary text-primary-foreground";
    default:
      return "bg-background border-border";
  }
}

export function AddToPlanSheet({
  open,
  onOpenChange,
  recipeId,
  recipeTitle,
  mealType: initialMealType,
  defaultMemberId,
  defaultDayKey,
  onSuccess,
}: AddToPlanSheetProps) {
  const { members } = useFamily();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(defaultMemberId ?? null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>(() => normMealType(initialMealType));

  const dayKeys = useMemo(() => getRollingDayKeys(), [open]);

  const { toast } = useToast();
  const memberIdForRpc = selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId;
  const { assignRecipeToPlanSlot, isAssigning } = useAssignRecipeToPlanSlot(memberIdForRpc);

  const rollingStart = getRollingStartKey();
  const rollingEnd = getRollingEndKey();
  const startDate = useMemo(() => new Date(rollingStart + "T12:00:00"), [rollingStart]);
  const endDate = useMemo(() => new Date(rollingEnd + "T12:00:00"), [rollingEnd]);
  const { data: weekPlans } = useMealPlans(memberIdForRpc).getMealPlans(startDate, endDate);

  /** По каждому дню: сколько слотов заполнено (0..4). 4-slot model: завтрак, обед, полдник, ужин. */
  const filledCountByDay = useMemo(() => {
    const count: Record<string, number> = {};
    for (const key of dayKeys) count[key] = 0;
    for (const p of weekPlans ?? []) {
      if (p.planned_date && MEAL_SLOTS.includes(p.meal_type as (typeof MEAL_SLOTS)[number])) {
        count[p.planned_date] = (count[p.planned_date] ?? 0) + 1;
      }
    }
    return count;
  }, [weekPlans, dayKeys]);

  /** Дни, где слот выбранного приёма пищи уже занят. */
  const daysWithSlotFilled = useMemo(() => {
    const filled = new Set<string>();
    for (const p of weekPlans ?? []) {
      if (p.planned_date && p.meal_type === selectedMealType) filled.add(p.planned_date);
    }
    return filled;
  }, [weekPlans, selectedMealType]);

  /** Дни, доступные для выбранного приёма пищи (слот свободен). */
  const availableDayKeys = useMemo(() => {
    return dayKeys.filter((key) => !daysWithSlotFilled.has(key));
  }, [dayKeys, daysWithSlotFilled]);

  /** Первый доступный день: сегодня если свободен, иначе ближайший по порядку в rolling 7. */
  const firstAvailableDayKey = useMemo(() => availableDayKeys[0] ?? null, [availableDayKeys]);

  const isSelectedSlotFilled = useMemo(() => {
    if (!selectedDayKey) return false;
    return (weekPlans ?? []).some(
      (p) => p.planned_date === selectedDayKey && p.meal_type === selectedMealType
    );
  }, [weekPlans, selectedDayKey, selectedMealType]);

  const isSelectedDayAvailable = selectedDayKey != null && availableDayKeys.includes(selectedDayKey);
  const canSubmit = selectedDayKey != null && (isSelectedDayAvailable || isSelectedSlotFilled) && !isAssigning;

  useEffect(() => {
    if (!open) return;
    setSelectedMemberId(defaultMemberId ?? null);
    const meal = normMealType(initialMealType);
    setSelectedMealType(meal);
    const filledForMeal = new Set<string>();
    for (const p of weekPlans ?? []) {
      if (p.planned_date && p.meal_type === meal) filledForMeal.add(p.planned_date);
    }
    const available = dayKeys.filter((d) => !filledForMeal.has(d));
    const firstAvailable = available[0] ?? null;
    const preferredDay =
      defaultDayKey && dayKeys.includes(defaultDayKey) && !filledForMeal.has(defaultDayKey)
        ? defaultDayKey
        : null;
    setSelectedDayKey(preferredDay ?? firstAvailable);
  }, [open, defaultMemberId, defaultDayKey, initialMealType, dayKeys, weekPlans]);

  useEffect(() => {
    if (!open) return;
    if (selectedDayKey != null && !availableDayKeys.includes(selectedDayKey)) {
      setSelectedDayKey(firstAvailableDayKey ?? null);
    }
  }, [
    open,
    selectedMealType,
    selectedMemberId,
    availableDayKeys,
    firstAvailableDayKey,
    selectedDayKey,
  ]);

  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  const performAssign = async () => {
    if (!selectedDayKey) return;
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
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message ?? "Не удалось добавить в план",
      });
    }
  };

  const handleAssign = () => {
    if (isSelectedSlotFilled) {
      setReplaceConfirmOpen(true);
      return;
    }
    void performAssign();
  };

  const handleDayClick = (key: string) => {
    if (daysWithSlotFilled.has(key)) return;
    if (filledCountByDay[key] === 4) return;
    setSelectedDayKey(key);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">Добавить в план</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 pb-6 overflow-y-auto">
          {/* 1) Кому */}
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

          {/* 2) Приём пищи */}
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

          {/* 3) Когда */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Когда</p>
            <p className="text-xs text-muted-foreground mb-2">
              Выберите день для блюда. Чем темнее день, тем больше меню уже заполнено.
            </p>
            {availableDayKeys.length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                Для выбранного приёма пищи свободных дней нет. Освободите слот в плане, чтобы добавить блюдо.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {dayKeys.map((key) => {
                const filledCount = filledCountByDay[key] ?? 0;
                const slotFilled = daysWithSlotFilled.has(key);
                const isFull = filledCount === 4;
                const isAvailable = !slotFilled && !isFull;
                const isSelected = selectedDayKey === key;

                let state: "A" | "B" | "C" | "D";
                if (isFull) state = "C";
                else if (slotFilled) state = "D";
                else if (filledCount === 0) state = "A";
                else state = "B";

                const isDisabled = state === "C" || state === "D";

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDayClick(key)}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1 min-w-0",
                      state !== "D" && dayFillClass(filledCount),
                      state === "D" &&
                        "bg-muted/70 text-muted-foreground border-border cursor-not-allowed opacity-80",
                      state === "C" && "cursor-not-allowed",
                      isSelected && isAvailable && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{getDayLabel(key)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleAssign}
            disabled={!canSubmit}
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

      <ConfirmActionModal
        open={replaceConfirmOpen}
        onOpenChange={setReplaceConfirmOpen}
        title="В этот день блюдо уже заполнено. Заменить?"
        description="Текущее блюдо в выбранном слоте будет заменено на новое."
        confirmText="Да"
        cancelText="Нет"
        onConfirm={performAssign}
      />
    </Sheet>
  );
}
