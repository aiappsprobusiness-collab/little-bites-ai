import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePWAInstall, type A2HSTriggerSource } from "@/hooks/usePWAInstall";
import { useSubscription } from "@/hooks/useSubscription";
import { Download, Puzzle } from "lucide-react";

function getInstallPromptDescription(triggerSource: "" | A2HSTriggerSource, hasAccess: boolean): string {
  const withShoppingList = hasAccess && triggerSource === "week";
  if (withShoppingList) {
    return "Меню и список продуктов уже готовы. Добавьте приложение на экран, чтобы всё было под рукой.";
  }
  if (triggerSource === "recipe") {
    return "Добавьте приложение на экран — рецепты будут открываться как обычное приложение.";
  }
  if (triggerSource === "day" || triggerSource === "week" || triggerSource === "plan") {
    return "Добавьте приложение на экран — меню будет всегда под рукой.";
  }
  return "Добавьте приложение на экран — рецепты и меню будут открываться как обычное приложение.";
}

export function PWAInstall() {
  const { canInstall, promptInstall, showModal, dismissModal, isIOSDevice, installPromptTriggerSource } = usePWAInstall();
  const { hasAccess } = useSubscription();

  if (!showModal) return null;

  const description = getInstallPromptDescription(installPromptTriggerSource, hasAccess);

  return (
    <Dialog open={showModal} onOpenChange={(open) => !open && dismissModal()}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={dismissModal}>
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <img src="/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" />
          </div>
          <DialogTitle className="flex items-center justify-center gap-2 text-center">
            <Puzzle className="h-6 w-6 text-primary shrink-0" />
            Установите MomRecipes на экран телефона
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-center">
              <p>{description}</p>
              {isIOSDevice && (
                <p className="text-typo-muted font-semibold text-foreground/90">
                  В Safari нажмите Поделиться → На экран Домой
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          {canInstall && (
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              onClick={() => {
                promptInstall();
                dismissModal({ skipIncrement: true });
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Установить
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => dismissModal()} className={canInstall ? "" : "w-full"}>
            Позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
