import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY_COUNT = "a2hs_attempt_count";
const STORAGE_KEY_NEXT_TS = "a2hs_next_ts";
const STORAGE_KEY_FOREVER = "a2hs_dismissed_forever";

const FIRST_SHOW_DELAY_MS = 30_000;
const RE_SHOW_2MIN_MS = 2 * 60 * 1000;
const RE_SHOW_5MIN_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function readStoredCount(): number {
  try {
    if (typeof window === "undefined") return 0;
    const s = localStorage.getItem(STORAGE_KEY_COUNT);
    const n = s != null ? parseInt(s, 10) : 0;
    return Number.isFinite(n) ? Math.max(0, Math.min(n, MAX_ATTEMPTS)) : 0;
  } catch {
    return 0;
  }
}

function readStoredNextTs(): number | null {
  try {
    if (typeof window === "undefined") return null;
    const s = localStorage.getItem(STORAGE_KEY_NEXT_TS);
    const n = s != null ? parseInt(s, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readDismissedForever(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY_FOREVER) === "1";
  } catch {
    return false;
  }
}

function writeStored(count: number, nextTs: number | null, forever: boolean): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_COUNT, String(count));
    if (nextTs != null) {
      localStorage.setItem(STORAGE_KEY_NEXT_TS, String(nextTs));
    } else {
      localStorage.removeItem(STORAGE_KEY_NEXT_TS);
    }
    if (forever) {
      localStorage.setItem(STORAGE_KEY_FOREVER, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY_FOREVER);
    }
  } catch {
    // ignore
  }
}

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

/** Есть ли поддержка A2HS: Android (beforeinstallprompt) или iOS (ручная установка). */
function hasA2HSSupport(deferredPrompt: BeforeInstallPromptEvent | null): boolean {
  return Boolean(deferredPrompt) || isIOS();
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledPWA);
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();
  const isInstalledRef = useRef(isInstalled);
  const deferredPromptRef = useRef(deferredPrompt);
  const scheduleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  isInstalledRef.current = isInstalled;
  deferredPromptRef.current = deferredPrompt;

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setShowModal(false);
      setDeferredPrompt(null);
      writeStored(MAX_ATTEMPTS, null, true);
      toast({ title: "Готово! 🧩 на экране!", description: "Приложение добавлено на главный экран." });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [toast]);

  useEffect(() => {
    if (isInstalled) return;
    const hasSupport = hasA2HSSupport(deferredPrompt);
    if (!hasSupport) return;

    const count = readStoredCount();
    const forever = readDismissedForever();
    const nextTs = readStoredNextTs();
    const now = Date.now();

    if (forever || count >= MAX_ATTEMPTS) {
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs schedule: dismissed_forever, skipping");
      }
      return;
    }

    let delayMs: number;
    if (nextTs != null && now < nextTs) {
      delayMs = nextTs - now;
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs schedule count=", count, "nextInMs=", delayMs);
      }
    } else {
      delayMs = count === 0 ? FIRST_SHOW_DELAY_MS : 0;
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs schedule count=", count, "nextInMs=", delayMs);
      }
    }

    scheduleTimeoutRef.current = setTimeout(() => {
      scheduleTimeoutRef.current = null;
      if (!isInstalledRef.current && hasA2HSSupport(deferredPromptRef.current)) {
        setShowModal(true);
      }
    }, delayMs);

    return () => {
      if (scheduleTimeoutRef.current) {
        clearTimeout(scheduleTimeoutRef.current);
        scheduleTimeoutRef.current = null;
      }
    };
  }, [deferredPrompt, isInstalled]);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  };

  const dismissModal = useCallback((options?: { skipIncrement?: boolean }) => {
    setShowModal(false);
    if (options?.skipIncrement) return;

    const count = readStoredCount();
    const newCount = Math.min(count + 1, MAX_ATTEMPTS);
    const now = Date.now();

    let nextTs: number | null = null;
    let forever = false;

    if (newCount >= MAX_ATTEMPTS) {
      forever = true;
    } else if (newCount === 1) {
      nextTs = now + RE_SHOW_2MIN_MS;
    } else if (newCount === 2) {
      nextTs = now + RE_SHOW_5MIN_MS;
    }

    writeStored(newCount, nextTs, forever);

    if (import.meta.env.DEV) {
      console.log("[DEBUG] a2hs dismissed count=", newCount, forever ? "forever" : "nextTs=" + nextTs);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scheduleTimeoutRef.current) {
        clearTimeout(scheduleTimeoutRef.current);
        scheduleTimeoutRef.current = null;
      }
    };
  }, []);

  const canInstall = Boolean(deferredPrompt) && !isInstalled;
  const isIOSDevice = isIOS();

  return { canInstall, promptInstall, showModal, dismissModal, isIOSDevice };
}
