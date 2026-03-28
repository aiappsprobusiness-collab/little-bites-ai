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
    __skipWaitingTriggered?: boolean;
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

        const notifyUpdateAvailable = () => {
          if (reg.waiting && navigator.serviceWorker.controller) {
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

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__skipWaitingTriggered) {
        window.location.reload();
      }
    });
  });
}

disableDoubleTapZoom();

createRoot(document.getElementById("root")!).render(<App />);

/** Минимум показа брендированного splash (мс); плюс ждём window.load, чтобы не мигать на медленной сети */
const SPLASH_MIN_VISIBLE_MS = 2800;
const SPLASH_FADE_OUT_MS = 400;

function hideSplashWhenReady() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;

  const start =
    typeof window.__momRecipesSplashStartMs === "number"
      ? window.__momRecipesSplashStartMs
      : Date.now();

  const fadeOut = () => {
    splash.style.pointerEvents = "none";
    splash.style.opacity = "0";
    splash.style.transition = `opacity ${SPLASH_FADE_OUT_MS}ms ease-out`;
    setTimeout(() => splash.remove(), SPLASH_FADE_OUT_MS);
  };

  const elapsed = Date.now() - start;
  const wait = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed);
  setTimeout(fadeOut, wait);
}

if (document.readyState === "complete") {
  hideSplashWhenReady();
} else {
  window.addEventListener("load", hideSplashWhenReady);
}
