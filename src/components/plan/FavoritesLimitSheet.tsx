import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";

const FAVORITES_FREE_LIMIT = 7;

export function FavoritesLimitSheet() {
  const showFavoritesLimitSheet = useAppStore((s) => s.showFavoritesLimitSheet);
  const setShowFavoritesLimitSheet = useAppStore((s) => s.setShowFavoritesLimitSheet);

  const handleOpenPremium = () => {
    setShowFavoritesLimitSheet(false);
    useAppStore.getState().setPaywallReason("favorites_limit");
    useAppStore.getState().setPaywallCustomMessage(null);
    useAppStore.getState().setShowPaywall(true);
  };

  return (
    <Sheet open={showFavoritesLimitSheet} onOpenChange={setShowFavoritesLimitSheet}>
      <SheetContent side="bottom" className="rounded-t-2xl flex flex-col gap-2 p-3 max-h-[70dvh] overflow-hidden">
        <SheetHeader className="space-y-0.5 pb-0">
          <SheetTitle className="text-left text-base font-semibold">
            Избранное: лимит {FAVORITES_FREE_LIMIT}
          </SheetTitle>
        </SheetHeader>
        <p className="text-muted-foreground text-[11px] leading-snug">
          В Free — до {FAVORITES_FREE_LIMIT} рецептов. В Premium — без лимита.
        </p>
        <div className="flex flex-col gap-1.5 mt-1">
          <Button size="sm" className="w-full h-9 rounded-lg text-sm font-semibold" onClick={handleOpenPremium}>
            Открыть Premium
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 rounded-lg text-xs"
            onClick={() => setShowFavoritesLimitSheet(false)}
          >
            Отмена
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
