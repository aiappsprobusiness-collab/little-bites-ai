import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Listens for sw-update-available (dispatched from main.tsx when a new SW is installed).
 * Shows a toast "Доступна новая версия" with a Refresh button that triggers skipWaiting + reload.
 */
export function PWAUpdateToast() {
  const { toast } = useToast();
  const shownRef = useRef(false);

  useEffect(() => {
    const onUpdate = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      toast({
        title: "Доступна новая версия",
        description: "Нажмите «Обновить», чтобы загрузить изменения.",
        /** Пока не обновили или не закрыли свайпом/крестиком — не гасим (Radix Toast). */
        duration: Number.POSITIVE_INFINITY,
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
