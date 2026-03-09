import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isStandalone } from "@/utils/standalone";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY_COUNT = "a2hs_attempt_count";
const STORAGE_KEY_NEXT_ELIGIBLE_AT = "a2hs_next_eligible_at";
const STORAGE_KEY_FOREVER = "a2hs_dismissed_forever";
const STORAGE_KEY_TRIGGER_SOURCE = "a2hs_trigger_source";

const DELAY_MIN_MS = 8_000;
const DELAY_MAX_MS = 15_000;
const MAX_ATTEMPTS = 3;
const LATER_1_DAYS = 3;
const LATER_2_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const A2HS_EVENT_AFTER_FIRST_PLAN = "a2hs-after-first-plan";
export const A2HS_EVENT_AFTER_FIRST_RECIPE = "a2hs-after-first-recipe";

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

function readStoredNextEligibleAt(): number | null {
  try {
    if (typeof window === "undefined") return null;
    const s = localStorage.getItem(STORAGE_KEY_NEXT_ELIGIBLE_AT);
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

function readTriggerSource(): "" | "plan" | "recipe" {
  try {
    if (typeof window === "undefined") return "";
    const s = localStorage.getItem(STORAGE_KEY_TRIGGER_SOURCE);
    if (s === "plan" || s === "recipe") return s;
    return "";
  } catch {
    return "";
  }
}

function writeStored(count: number, nextEligibleAt: number | null, forever: boolean): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_COUNT, String(count));
    if (nextEligibleAt != null) {
      localStorage.setItem(STORAGE_KEY_NEXT_ELIGIBLE_AT, String(nextEligibleAt));
    } else {
      localStorage.removeItem(STORAGE_KEY_NEXT_ELIGIBLE_AT);
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

function setTriggerSource(source: "plan" | "recipe"): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_TRIGGER_SOURCE, source);
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

function canShowNow(): boolean {
  if (readDismissedForever()) return false;
  const count = readStoredCount();
  if (count >= MAX_ATTEMPTS) return false;
  const nextAt = readStoredNextEligibleAt();
  if (nextAt != null && Date.now() < nextAt) return false;
  return true;
}

function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

export function usePWAInstall() {
  const { user } = useAuth();
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
    if (!user) return;
    if (isInstalled) return;
    if (isStandalone()) return;
    if (!hasA2HSSupport(deferredPrompt)) return;
    if (!canShowNow()) return;
    if (readTriggerSource() !== "") return;

    const scheduleShow = (trigger: "plan" | "recipe") => {
      if (readTriggerSource() !== "") return;
      setTriggerSource(trigger);
      const delayMs = randomDelayMs();
      if (import.meta.env.DEV) {
        console.log("[DEBUG] a2hs scheduled from", trigger, "in", delayMs, "ms");
      }
      scheduleTimeoutRef.current = setTimeout(() => {
        scheduleTimeoutRef.current = null;
        if (!isInstalledRef.current && hasA2HSSupport(deferredPromptRef.current) && canShowNow()) {
          setShowModal(true);
        }
      }, delayMs);
    };

    const onFirstPlan = () => {
      if (readTriggerSource() !== "") return;
      scheduleShow("plan");
    };

    const onFirstRecipe = () => {
      if (readTriggerSource() !== "") return;
      scheduleShow("recipe");
    };

    window.addEventListener(A2HS_EVENT_AFTER_FIRST_PLAN, onFirstPlan);
    window.addEventListener(A2HS_EVENT_AFTER_FIRST_RECIPE, onFirstRecipe);

    return () => {
      window.removeEventListener(A2HS_EVENT_AFTER_FIRST_PLAN, onFirstPlan);
      window.removeEventListener(A2HS_EVENT_AFTER_FIRST_RECIPE, onFirstRecipe);
      if (scheduleTimeoutRef.current) {
        clearTimeout(scheduleTimeoutRef.current);
        scheduleTimeoutRef.current = null;
      }
    };
  }, [user, deferredPrompt, isInstalled]);

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

    let nextEligibleAt: number | null = null;
    let forever = false;

    if (newCount >= MAX_ATTEMPTS) {
      forever = true;
    } else if (newCount === 1) {
      nextEligibleAt = now + LATER_1_DAYS * MS_PER_DAY;
    } else if (newCount === 2) {
      nextEligibleAt = now + LATER_2_DAYS * MS_PER_DAY;
    }

    writeStored(newCount, nextEligibleAt, forever);

    if (import.meta.env.DEV) {
      console.log("[DEBUG] a2hs dismissed count=", newCount, forever ? "forever" : "nextEligibleAt=" + nextEligibleAt);
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
  const hasInstallOption = !isInstalled && (Boolean(deferredPrompt) || isIOSDevice);

  return { canInstall, promptInstall, showModal, dismissModal, isIOSDevice, isInstalled, hasInstallOption };
}
