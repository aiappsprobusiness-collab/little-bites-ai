import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { disableDoubleTapZoom } from "./utils/disableDoubleTapZoom";
import "./index.css";
import "./styles/splash.css";

// ——— PWA: beforeinstallprompt ———
declare global {
  interface Window {
    __beforeInstallPromptEvent?: BeforeInstallPromptEvent;
    __promptPWAInstall?: () => Promise<void>;
    __swRegistration?: ServiceWorkerRegistration;
    /** Время старта показа splash (inline в index.html) */
    __momRecipesSplashStartMs?: number;
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    const ev = e as BeforeInstallPromptEvent;
    window.__beforeInstallPromptEvent = ev;
    window.dispatchEvent(new CustomEvent("a2hs-prompt-available", { detail: ev }));
    window.__promptPWAInstall = async () => {
      if (!window.__beforeInstallPromptEvent) return;
      await window.__beforeInstallPromptEvent.prompt();
      await window.__beforeInstallPromptEvent.userChoice;
    };
  });
}

// ——— PWA: Service Worker registration & auto-update + reload ———
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        window.__swRegistration = reg;

        /** Не слать событие чаще раза в несколько секунд — иначе при сбоях/гонках возможен шторм тостов. */
        let lastSwUpdateNotifyAt = 0;
        const notifyUpdateAvailable = () => {
          if (reg.waiting && navigator.serviceWorker.controller) {
            const now = Date.now();
            if (now - lastSwUpdateNotifyAt < 4000) return;
            lastSwUpdateNotifyAt = now;
            window.dispatchEvent(new Event("sw-update-available"));
          }
        };

        reg.onupdatefound = () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.onstatechange = () => {
            if (newWorker.state === "installed") notifyUpdateAvailable();
          };
        };

        if (reg.waiting && navigator.serviceWorker.controller) {
          notifyUpdateAvailable();
        }

        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {});
    /** Перезагрузка после skipWaiting — только из PWAUpdateToast (once + fallback), см. PWAUpdateToast.tsx */
  });
}

disableDoubleTapZoom();

createRoot(document.getElementById("root")!).render(<App />);

/** Минимум показа брендированного splash (мс); плюс ждём window.load, чтобы не мигать на медленной сети (PWA / браузер). */
const SPLASH_MIN_VISIBLE_MS = 2800;
const SPLASH_FADE_OUT_MS = 400;

/** Лендинг VK: splash убран в index.html; здесь — нулевая задержка, если узел ещё есть. */
function isVkFunnelPath(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/vk";
}

function isStartupPerf(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("perf") === "1";
}

if (typeof window !== "undefined" && isStartupPerf()) {
  console.log("[perf] pwa react root render (sync)", performance.now());
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.log("[perf] pwa first frames after root (rAF×2)", performance.now());
    });
  });
}

function hideSplashWhenReady() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;

  const start =
    typeof window.__momRecipesSplashStartMs === "number"
      ? window.__momRecipesSplashStartMs
      : Date.now();

  const fadeOut = () => {
    if (isStartupPerf()) {
      console.log("[perf] pwa html splash fade start", performance.now());
    }
    splash.style.pointerEvents = "none";
    splash.style.opacity = "0";
    splash.style.transition = `opacity ${SPLASH_FADE_OUT_MS}ms ease-out`;
    setTimeout(() => splash.remove(), SPLASH_FADE_OUT_MS);
  };

  const elapsed = Date.now() - start;
  const minVisible = isVkFunnelPath() ? 0 : SPLASH_MIN_VISIBLE_MS;
  const wait = Math.max(0, minVisible - elapsed);
  if (isStartupPerf()) {
    console.log("[perf] pwa splash hide schedule ms", { wait, elapsed, min: minVisible });
  }
  setTimeout(fadeOut, wait);
}

if (isVkFunnelPath()) {
  hideSplashWhenReady();
} else if (document.readyState === "complete") {
  hideSplashWhenReady();
} else {
  window.addEventListener("load", hideSplashWhenReady);
}
