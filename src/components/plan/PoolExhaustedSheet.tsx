import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { getPlanSlotChatPrefillMessage } from "@/utils/planChatPrefill";
import type { InfantPoolExhaustedReason } from "@/utils/infantAutoreplace";

export interface PoolExhaustedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDayKey: string;
  mealType: string;
  memberId: string | null;
  memberName?: string;
  allergies?: string[];
  likes?: string[];
  dislikes?: string[];
  infantMode?: boolean;
  infantReason?: InfantPoolExhaustedReason;
  infantMatchedOptions?: Array<{ recipeId: string; title: string }>;
  onSelectInfantOption?: (option: { recipeId: string; title: string }) => Promise<void> | void;
}

export function PoolExhaustedSheet({
  open,
  onOpenChange,
  selectedDayKey,
  mealType,
  memberId,
  infantMode = false,
  infantReason,
  infantMatchedOptions = [],
  onSelectInfantOption,
}: PoolExhaustedSheetProps) {
  const navigate = useNavigate();
  const [showInfantOptions, setShowInfantOptions] = useState(false);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;

  const planSlotChatState = {
    fromPlanSlot: true as const,
    plannedDate: selectedDayKey,
    mealType,
    /** null — семейный план; не сбрасывать в undefined через ?? */
    memberId: memberId === undefined ? undefined : memberId,
  };

  const handleAddFromFavorites = () => {
    onOpenChange(false);
    navigate("/favorites", { state: planSlotChatState });
  };

  const handleGenerateInChat = () => {
    if (isFree) {
      setPaywallReason("generate_recipe");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      onOpenChange(false);
      return;
    }
    const prefillMessage = getPlanSlotChatPrefillMessage(mealType);
    onOpenChange(false);
    navigate("/chat", {
      state: {
        ...planSlotChatState,
        prefillMessage,
        /** Только вставка в input; отправка — вручную */
        prefillOnly: true,
      },
    });
  };

  const infantDescription =
    infantReason === "limit_reached"
      ? "Для этого блока на сегодня достигнут лимит автозамен. Можно вернуть один из вариантов, которые уже подходили, или заглянуть в план завтра."
      : "Свободных новых вариантов по правилам прикорма на сегодня больше нет (уже учтены блюда этого дня и недавние подборы). Выберите из уже подходивших или попробуйте позже.";

  const handleShowInfantOptions = () => {
    setShowInfantOptions(true);
  };

  useEffect(() => {
    if (!open) setShowInfantOptions(false);
  }, [open]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle className="text-left">
              {infantMode ? "Подходящие варианты закончились" : "Нет подходящих рецептов"}
            </SheetTitle>
          </SheetHeader>
          <p className="text-muted-foreground text-sm">
            {infantMode
              ? infantDescription
              : "Выберите рецепт из избранного или сгенерируйте новый в чате."}
          </p>
          {infantMode ? (
            <div className="flex flex-col gap-2">
              <Button className="w-full rounded-xl" onClick={handleShowInfantOptions}>
                Показать подходившие варианты
              </Button>
              {showInfantOptions && infantMatchedOptions.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2">
                  <div className="text-xs text-muted-foreground px-2 py-1">Подходившие варианты</div>
                  <div className="flex flex-col gap-1">
                    {infantMatchedOptions.map((option) => (
                      <Button
                        key={option.recipeId}
                        variant="ghost"
                        className="w-full justify-start rounded-lg h-auto py-2 px-2"
                        onClick={async () => {
                          await onSelectInfantOption?.(option);
                          onOpenChange(false);
                        }}
                      >
                        {option.title}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {showInfantOptions && infantMatchedOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">
                  Пока нет сохранённых вариантов для этого слота.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full rounded-xl"
                onClick={handleAddFromFavorites}
              >
                Добавить из избранного
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={handleGenerateInChat}
              >
                {isFree ? "✨ Сгенерировать в чате (Premium)" : "Сгенерировать в чате"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
