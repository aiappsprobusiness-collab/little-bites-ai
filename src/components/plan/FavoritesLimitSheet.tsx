import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";

const FAVORITES_FREE_LIMIT = 15;

export function FavoritesLimitSheet() {
  const showFavoritesLimitSheet = useAppStore((s) => s.showFavoritesLimitSheet);
  const setShowFavoritesLimitSheet = useAppStore((s) => s.setShowFavoritesLimitSheet);

  const handleOpenPremium = () => {
    setShowFavoritesLimitSheet(false);
    useAppStore.getState().setPaywallCustomMessage("В Free можно сохранить до 15 рецептов. В Premium — без лимита.");
    useAppStore.getState().setShowPaywall(true);
  };

  return (
    <Sheet open={showFavoritesLimitSheet} onOpenChange={setShowFavoritesLimitSheet}>
      <SheetContent side="bottom" className="rounded-t-2xl flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="text-left">Лимит избранного Free: {FAVORITES_FREE_LIMIT}</SheetTitle>
        </SheetHeader>
        <p className="text-muted-foreground text-sm">
          В Free можно сохранить до {FAVORITES_FREE_LIMIT} рецептов. Откройте Premium, чтобы сохранять без лимита.
        </p>
        <div className="flex flex-col gap-2">
          <Button className="w-full rounded-xl" onClick={handleOpenPremium}>
            Открыть Premium
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => setShowFavoritesLimitSheet(false)}
          >
            Отмена
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
