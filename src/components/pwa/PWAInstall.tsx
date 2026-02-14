import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Puzzle } from "lucide-react";

export function PWAInstall() {
  const { canInstall, promptInstall, showModal, dismissModal, isIOSDevice } = usePWAInstall();

  if (!showModal) return null;

  return (
    <Dialog open={showModal} onOpenChange={(open) => !open && dismissModal()}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={dismissModal}>
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <img src="/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" />
          </div>
          <DialogTitle className="flex items-center justify-center gap-2 text-center">
            <Puzzle className="h-6 w-6 text-primary shrink-0" />
            Установить Mom Recipes на экран?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-center">
              <p>Установите приложение, чтобы открывать его с иконки и пользоваться офлайн.</p>
              {isIOSDevice && (
                <p className="text-typo-muted font-semibold text-foreground/90">
                  На iPhone: нажмите «Поделиться» в Safari → «На экран Домой».
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
          <Button variant="ghost" size="sm" onClick={dismissModal} className={canInstall ? "" : "w-full"}>
            Позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
