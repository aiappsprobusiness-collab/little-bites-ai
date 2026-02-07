import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Listens for sw-update-available (dispatched from main.tsx when a new SW is installed).
 * Shows a toast "Доступна новая версия" with a Refresh button that triggers skipWaiting + reload.
 */
export function PWAUpdateToast() {
  const { toast } = useToast();

  useEffect(() => {
    const onUpdate = () => {
      toast({
        title: "Доступна новая версия",
        description: "Нажмите «Обновить», чтобы загрузить изменения.",
        action: (
          <ToastAction
            altText="Обновить"
            onClick={() => {
              window.__skipWaitingTriggered = true;
              window.__swRegistration?.waiting?.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Обновить
          </ToastAction>
        ),
      });
    };

    window.addEventListener("sw-update-available", onUpdate);
    return () => window.removeEventListener("sw-update-available", onUpdate);
  }, [toast]);

  return null;
}
