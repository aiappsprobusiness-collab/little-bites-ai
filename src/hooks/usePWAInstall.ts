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

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledPWA);
  const [showModal, setShowModal] = useState(false);
  const [modalShownOnce, setModalShownOnce] = useState(false);
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

  // Модалка через 5 сек после загрузки, если есть prompt и ещё не показывали
  useEffect(() => {
    if (!deferredPrompt || isInstalled || modalShownOnce) return;
    const t = setTimeout(() => {
      setShowModal(true);
      setModalShownOnce(true);
    }, MODAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [deferredPrompt, isInstalled, modalShownOnce]);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  };

  const dismissModal = () => setShowModal(false);

  const canInstall = Boolean(deferredPrompt) && !isInstalled;

  return { canInstall, promptInstall, showModal, dismissModal };
}
