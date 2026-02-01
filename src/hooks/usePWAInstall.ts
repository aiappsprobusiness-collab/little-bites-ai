import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const MODAL_DELAY_MS = 5000;

/** Приложение уже запущено с главного экрана (standalone), не показываем предложение установки. */
function isRunningAsInstalledPWA(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true; // iOS Safari
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || ((navigator as { platform?: string }).platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledPWA);
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setShowModal(false);
      setDeferredPrompt(null);
      toast({ title: "Готово! 🧩 на экране!", description: "Приложение добавлено на главный экран." });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [toast]);

  // Модалка через 5 сек при каждом открытии в браузере (не standalone): Android (beforeinstallprompt) или iOS
  useEffect(() => {
    if (isInstalled) return;
    const hasPrompt = Boolean(deferredPrompt);
    const ios = isIOS();
    if (!hasPrompt && !ios) return;
    const t = setTimeout(() => setShowModal(true), MODAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [deferredPrompt, isInstalled]);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  };

  const dismissModal = () => setShowModal(false);

  const canInstall = Boolean(deferredPrompt) && !isInstalled;
  const isIOSDevice = isIOS();

  return { canInstall, promptInstall, showModal, dismissModal, isIOSDevice };
}
