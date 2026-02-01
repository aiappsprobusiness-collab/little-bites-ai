import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Puzzle } from "lucide-react";

export function PWAInstall() {
  const { canInstall, promptInstall, showModal, dismissModal } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <>
      {/* Модалка через 5 сек после загрузки (beforeinstallprompt) */}
      <Dialog open={showModal} onOpenChange={(open) => !open && dismissModal()}>
        <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={dismissModal}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Puzzle className="h-6 w-6 text-primary" />
              Little Bites — на главный экран
            </DialogTitle>
            <DialogDescription>
              Установите приложение, чтобы открывать его с иконки и пользоваться офлайн.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              onClick={() => {
                promptInstall();
                dismissModal();
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Установить
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissModal}>
              Позже
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
