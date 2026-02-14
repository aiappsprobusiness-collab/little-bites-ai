import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY_INSTALLED = "a2hs_installed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isInstalledStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_INSTALLED) === "1";
  } catch {
    return false;
  }
}

function setInstalledStored(): void {
  try {
    localStorage.setItem(STORAGE_KEY_INSTALLED, "1");
  } catch {
    // ignore
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __beforeInstallPromptEvent?: BeforeInstallPromptEvent;
  }
}

/**
 * Ручная кнопка установки PWA (не авто-подсказка).
 * Используется на landing/auth странице.
 * Не трогает attempt_count авто-подсказки.
 */
export function useA2HSInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone() || isInstalledStored());

  useEffect(() => {
    if (installed) return;

    const onAvailable = (e: Event) => {
      const ev = (e as CustomEvent).detail as BeforeInstallPromptEvent;
      setDeferredPrompt(ev);
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs deferredPrompt captured (manual)");
      }
    };

    if (window.__beforeInstallPromptEvent) {
      setDeferredPrompt(window.__beforeInstallPromptEvent);
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs deferredPrompt captured from window (manual)");
      }
    }
    window.addEventListener("a2hs-prompt-available", onAvailable);

    return () => {
      window.removeEventListener("a2hs-prompt-available", onAvailable);
    };
  }, [installed]);

  useEffect(() => {
    const onAppInstalled = () => {
      setInstalled(true);
      setInstalledStored();
    };
    window.addEventListener("appinstalled", onAppInstalled);
    return () => window.removeEventListener("appinstalled", onAppInstalled);
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "no-prompt"> => {
    const ev = deferredPrompt ?? window.__beforeInstallPromptEvent;
    if (ev) {
      try {
        await ev.prompt();
        const choice = await ev.userChoice;
        if (import.meta.env.DEV) {
          console.log("[DEBUG] a2hs manual prompt result=", choice.outcome);
        }
        if (choice.outcome === "accepted") {
          setInstalledStored();
          setInstalled(true);
        }
        return choice.outcome;
      } catch {
        return "dismissed";
      }
    }
    return "no-prompt";
  }, [deferredPrompt]);

  const canPrompt = !installed && Boolean(deferredPrompt ?? (typeof window !== "undefined" && window.__beforeInstallPromptEvent));
  const hasDeferredPrompt = Boolean(deferredPrompt ?? (typeof window !== "undefined" && window.__beforeInstallPromptEvent));
  const hasA2HSSupport = hasDeferredPrompt || (typeof navigator !== "undefined" && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent));

  return {
    canPrompt,
    promptInstall,
    isInstalled: installed,
    hasDeferredPrompt,
    hasA2HSSupport,
  };
}
