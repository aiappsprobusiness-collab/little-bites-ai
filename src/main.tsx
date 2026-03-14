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

// Скрытие splash после загрузки
window.addEventListener("load", () => {
  const splash = document.getElementById("splash-screen");
  if (splash) {
    setTimeout(() => {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 300ms";
      setTimeout(() => splash.remove(), 300);
    }, 800);
  }
});
