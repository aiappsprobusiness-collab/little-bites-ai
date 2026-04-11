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
import type { MealPlanItemV2 } from "@/hooks/useMealPlans";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRollingStartKey, getRollingEndKey } from "@/utils/dateRange";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { cn } from "@/lib/utils";
import {
  normalizeRecipePlanMealType,
  RECIPE_PLAN_MEAL_LABELS_RU,
  RECIPE_PLAN_MEAL_TYPES,
  type RecipePlanMealType,
} from "@/utils/recipeMealSlots";

const MEAL_OPTIONS = RECIPE_PLAN_MEAL_TYPES.map((id) => ({
  id,
  label: RECIPE_PLAN_MEAL_LABELS_RU[id],
}));

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

function defaultMealTypeFromProp(v: string | null | undefined): RecipePlanMealType {
  return normalizeRecipePlanMealType(v) ?? "breakfast";
}

/** Заливка по заполненности дня (0..4). Оливковая палитра. */
function dayFillClass(filledCount: number): string {
  switch (filledCount) {
    case 0:
      return "bg-background border-border";
    case 1:
      return "bg-primary/[0.06] border-primary/20";
    case 2:
      return "bg-primary/[0.12] border-primary/30";
    case 3:
      return "bg-primary/20 border-primary/40";
    case 4:
      return "bg-primary border-primary text-primary-foreground";
    default:
      return "bg-background border-border";
  }
}

const MEAL_SLOT_FILLED_BG = "bg-primary/[0.12] border-primary/[0.35] text-foreground";

/** Как у выбранного дня и приёма пищи: зелёное кольцо, не наезжает на край при небольшом inset ряда. */
const SELECTED_CHIP_RING = "ring-2 ring-primary ring-offset-2 ring-offset-background";

/** Inset для рядов чипов: место под ring + ring-offset, чтобы не резалось у края sheet. */
const CHIP_ROW_INSET = "px-1.5 sm:px-2";

export interface AddToPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeTitle: string;
  /** Дефолтный приём из `recipes.meal_type` или контекста (например, слот плана). */
  mealType?: string | null;
  /** Дефолтный профиль: из контекста (чат/избранное/план). */
  defaultMemberId: string | null;
  /** Дефолтный день (YYYY-MM-DD), например при переходе из пустого слота плана. */
  defaultDayKey?: string | null;
  /** Явная цель из плана: всегда этот день+приём; слот можно заменить по подтверждению. */
  targetSlot?: { dayKey: string; mealType: string } | null;
  onSuccess?: () => void;
}

export function AddToPlanSheet({
  open,
  onOpenChange,
  recipeId,
  recipeTitle,
  mealType: initialMealType,
  defaultMemberId,
  defaultDayKey,
  targetSlot,
  onSuccess,
}: AddToPlanSheetProps) {
  const { members } = useFamily();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(defaultMemberId ?? null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<RecipePlanMealType>(() =>
    defaultMealTypeFromProp(initialMealType)
  );

  const dayKeys = useMemo(() => getRollingDayKeys(), [open]);

  const { toast } = useToast();
  const memberIdForRpc = selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId;
  const { assignRecipeToPlanSlot, isAssigning } = useAssignRecipeToPlanSlot(memberIdForRpc);

  const rollingStart = getRollingStartKey();
  const rollingEnd = getRollingEndKey();
  const startDate = useMemo(() => new Date(rollingStart + "T12:00:00"), [rollingStart]);
  const endDate = useMemo(() => new Date(rollingEnd + "T12:00:00"), [rollingEnd]);
  const { data: weekPlans } = useMealPlans(memberIdForRpc).getMealPlans(startDate, endDate);

  /** По каждому дню: сколько слотов заполнено (0..4). */
  const filledCountByDay = useMemo(() => {
    const count: Record<string, number> = {};
    for (const key of dayKeys) count[key] = 0;
    for (const p of weekPlans ?? []) {
      if (p.planned_date && normalizeRecipePlanMealType(p.meal_type) != null) {
        count[p.planned_date] = (count[p.planned_date] ?? 0) + 1;
      }
    }
    return count;
  }, [weekPlans, dayKeys]);

  const planEntryForSelectedSlot = useMemo((): MealPlanItemV2 | null => {
    if (!selectedDayKey) return null;
    const found = (weekPlans ?? []).find(
      (p) => p.planned_date === selectedDayKey && p.meal_type === selectedMealType
    );
    return found ?? null;
  }, [weekPlans, selectedDayKey, selectedMealType]);

  const isSelectedSlotFilled = planEntryForSelectedSlot != null;

  const slotTitleHint = useMemo(() => {
    if (!selectedDayKey) return "";
    if (!planEntryForSelectedSlot) return "Слот свободен";
    const t = planEntryForSelectedSlot.recipe?.title?.trim();
    if (t) return t;
    return planEntryForSelectedSlot.recipe_id ? "Блюдо" : "Слот свободен";
  }, [selectedDayKey, planEntryForSelectedSlot]);

  const isSlotFilledForDay = (dayKey: string, mealType: RecipePlanMealType): boolean => {
    return (weekPlans ?? []).some((p) => p.planned_date === dayKey && p.meal_type === mealType);
  };

  const canSubmit = selectedDayKey != null && !isAssigning;

  useEffect(() => {
    if (!open) return;
    setSelectedMemberId(defaultMemberId ?? null);
    if (targetSlot && dayKeys.includes(targetSlot.dayKey)) {
      setSelectedMealType(defaultMealTypeFromProp(targetSlot.mealType));
      setSelectedDayKey(targetSlot.dayKey);
      return;
    }
    const meal = defaultMealTypeFromProp(initialMealType);
    setSelectedMealType(meal);
    const preferredDay =
      defaultDayKey && dayKeys.includes(defaultDayKey) ? defaultDayKey : null;
    setSelectedDayKey(preferredDay ?? dayKeys[0] ?? null);
  }, [open, defaultMemberId, defaultDayKey, initialMealType, dayKeys, targetSlot]);

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
    if (targetSlot && key !== targetSlot.dayKey) return;
    setSelectedDayKey(key);
  };

  const replaceConfirmTitle = `На этот день уже назначен ${RECIPE_PLAN_MEAL_LABELS_RU[selectedMealType].toLowerCase()}. Заменить его новым блюдом?`;

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
            <div className={cn("flex flex-wrap gap-2", CHIP_ROW_INSET)}>
              <button
                type="button"
                onClick={() => setSelectedMemberId("family")}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                  (selectedMemberId === "family" || !selectedMemberId)
                    ? cn("bg-primary/10 border-primary/30 text-foreground", SELECTED_CHIP_RING)
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
                      ? cn("bg-primary/10 border-primary/30 text-foreground", SELECTED_CHIP_RING)
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {(m as { name?: string }).name ?? m.id}
                </button>
              ))}
            </div>
          </div>

          {/* 2) Когда */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Когда</p>
            <div className={cn("flex flex-wrap gap-2", CHIP_ROW_INSET)}>
              {dayKeys.map((key) => {
                const filledCount = filledCountByDay[key] ?? 0;
                const isPinnedTargetDay = targetSlot?.dayKey === key;
                const isSelected = selectedDayKey === key;
                const isDisabled = !!targetSlot && !isPinnedTargetDay;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDayClick(key)}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1 min-w-0",
                      dayFillClass(filledCount),
                      isDisabled && "opacity-50 cursor-not-allowed",
                      isSelected && SELECTED_CHIP_RING
                    )}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{getDayLabel(key)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3) Приём пищи */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Приём пищи</p>
            <div className={cn("flex flex-wrap gap-2", CHIP_ROW_INSET)}>
              {MEAL_OPTIONS.map((m) => {
                const slotFilled = selectedDayKey != null && isSlotFilledForDay(selectedDayKey, m.id);
                const isSelected = selectedMealType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!!targetSlot}
                    onClick={() => setSelectedMealType(m.id)}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium border transition-colors",
                      slotFilled ? MEAL_SLOT_FILLED_BG : "bg-transparent border-border text-muted-foreground",
                      isSelected && cn(SELECTED_CHIP_RING, "text-foreground"),
                      targetSlot && "opacity-80 cursor-default"
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {selectedDayKey ? (
              <p className="text-xs text-muted-foreground mt-2 min-h-[1rem]">{slotTitleHint}</p>
            ) : null}
          </div>

          <Button className="w-full rounded-xl" onClick={handleAssign} disabled={!canSubmit}>
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
        title={replaceConfirmTitle}
        description="Текущее блюдо в этом слоте будет заменено выбранным рецептом."
        confirmText="Заменить"
        cancelText="Отмена"
        onConfirm={performAssign}
      />
    </Sheet>
  );
}
