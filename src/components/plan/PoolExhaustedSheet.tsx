import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";

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
  mealPlansKeyWeek: unknown[];
  mealPlansKeyDay: unknown[];
  queryClient: ReturnType<typeof useQueryClient>;
}

export function PoolExhaustedSheet({
  open,
  onOpenChange,
  selectedDayKey,
  mealType,
  memberId,
  memberName,
  allergies = [],
  likes = [],
  dislikes = [],
  mealPlansKeyWeek,
  mealPlansKeyDay,
  queryClient,
}: PoolExhaustedSheetProps) {
  const navigate = useNavigate();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;

  const handleAddFromFavorites = () => {
    onOpenChange(false);
    navigate("/favorites");
  };

  const handleGenerateInChat = () => {
    if (isFree) {
      setPaywallCustomMessage("Сгенерировать рецепт в чате доступно в Premium.");
      setShowPaywall(true);
      onOpenChange(false);
      return;
    }
    const prefillMessage =
      mealType === "breakfast"
        ? "Подбери завтрак."
        : mealType === "lunch"
          ? "Подбери обед."
          : mealType === "dinner"
            ? "Подбери ужин."
            : "Подбери перекус.";
    onOpenChange(false);
    navigate("/chat", { state: { prefillMessage, prefillOnly: false } });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle className="text-left">Нет подходящих рецептов</SheetTitle>
          </SheetHeader>
          <p className="text-muted-foreground text-sm">
            Выберите рецепт из избранного или сгенерируйте новый в чате.
          </p>
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
        </SheetContent>
      </Sheet>
    </>
  );
}
