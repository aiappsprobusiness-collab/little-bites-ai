import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

// ——— PWA: Service Worker registration & update detection ———
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        window.__swRegistration = reg;

        const notifyUpdate = () => {
          if (reg.waiting && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("sw-update-available"));
          }
        };

        reg.onupdatefound = () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.onstatechange = () => {
            if (newWorker.state === "installed") notifyUpdate();
          };
        };

        // Already waiting (e.g. tab was closed and reopened)
        if (reg.waiting && navigator.serviceWorker.controller) {
          notifyUpdate();
        }

        // Optional: check for updates on interval
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__skipWaitingTriggered) window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
