import { useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { getPaywallReasonCopy } from "@/utils/paywallReasonCopy";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";

export function FavoritesLimitSheet() {
  const showFavoritesLimitSheet = useAppStore((s) => s.showFavoritesLimitSheet);
  const setShowFavoritesLimitSheet = useAppStore((s) => s.setShowFavoritesLimitSheet);
  const copy = useMemo(() => getPaywallReasonCopy("favorites_limit"), []);

  useEffect(() => {
    if (showFavoritesLimitSheet) {
      trackPaywallTextShown("favorites_limit", { surface: "favorites_limit_sheet" });
    }
  }, [showFavoritesLimitSheet]);

  const handleOpenPremium = () => {
    setShowFavoritesLimitSheet(false);
    useAppStore.getState().setPaywallReason("favorites_limit");
    useAppStore.getState().setPaywallCustomMessage(null);
    useAppStore.getState().setShowPaywall(true);
  };

  return (
    <Sheet open={showFavoritesLimitSheet} onOpenChange={setShowFavoritesLimitSheet}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl flex flex-col gap-3 p-5 max-h-[85dvh] overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader className="space-y-1.5 pb-0 text-left">
          <SheetTitle className="text-lg font-semibold leading-snug text-balance">
            {copy.title}
          </SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground leading-relaxed text-balance whitespace-pre-line">{copy.body}</p>
        <div className="flex flex-col gap-3 mt-2 shrink-0">
          <Button
            size="sm"
            className="w-full h-12 rounded-xl text-sm font-semibold"
            onClick={handleOpenPremium}
          >
            Открыть полную версию
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-10 rounded-xl text-sm"
            onClick={() => setShowFavoritesLimitSheet(false)}
          >
            Отмена
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
