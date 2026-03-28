import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { getPaywallReasonCopy } from "@/utils/paywallReasonCopy";

const FAVORITES_FREE_LIMIT = 7;

export function FavoritesLimitSheet() {
  const showFavoritesLimitSheet = useAppStore((s) => s.showFavoritesLimitSheet);
  const setShowFavoritesLimitSheet = useAppStore((s) => s.setShowFavoritesLimitSheet);
  const copy = useMemo(() => getPaywallReasonCopy("favorites_limit"), []);

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
        <p className="text-sm text-muted-foreground leading-relaxed text-balance">
          В Free — до {FAVORITES_FREE_LIMIT} рецептов. {copy.body}
        </p>
        <ul className="space-y-2.5 min-w-0 shrink-0">
          {copy.bullets.map((text, index) => (
            <li key={`${text}-${index}`} className="flex items-start gap-2.5 text-xs leading-relaxed min-w-0">
              <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-primary" strokeWidth={3} />
              </span>
              <span className="text-foreground/95 min-w-0 flex-1">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 mt-2 shrink-0">
          <Button
            size="sm"
            className="w-full h-12 rounded-xl text-sm font-semibold"
            onClick={handleOpenPremium}
          >
            Открыть Premium
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
