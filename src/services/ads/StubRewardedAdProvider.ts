import type { IRewardedAdProvider } from "./RewardedAdProvider";
import { trackUsageEvent } from "@/utils/usageEvents";

/**
 * Stub: модальное окно "Посмотрите короткое видео…" с кнопкой "Продолжить".
 * В проде заменить на реальный AdMob/Unity Rewarded.
 */
export class StubRewardedAdProvider implements IRewardedAdProvider {
  isAvailable(): boolean {
    return typeof document !== "undefined";
  }

  show(): Promise<void> {
    trackUsageEvent("ad_rewarded_shown");
    return new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.id = "stub-rewarded-ad-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;";
      const modal = document.createElement("div");
      modal.style.cssText = "background:var(--background, #fff);border-radius:16px;padding:24px;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);";
      modal.innerHTML = `
        <p class="mb-2 font-semibold" style="font-size:1.1rem;margin-bottom:8px;">Посмотрите короткое видео</p>
        <p class="text-muted-foreground mb-4" style="font-size:0.9rem;color:#666;margin-bottom:16px;">чтобы открыть генерацию</p>
        <button id="stub-rewarded-ad-continue" style="width:100%;padding:12px 20px;border-radius:12px;background:var(--primary,#6e7f3b);color:#fff;border:none;font-weight:600;cursor:pointer;">Продолжить</button>
      `;
      overlay.appendChild(modal);
      const cleanup = () => {
        overlay.remove();
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          trackUsageEvent("ad_rewarded_dismissed");
          cleanup();
          reject(new Error("cancelled"));
        }
      });
      modal.querySelector("#stub-rewarded-ad-continue")?.addEventListener("click", () => {
        trackUsageEvent("ad_rewarded_completed");
        cleanup();
        resolve();
      });
      document.body.appendChild(overlay);
    });
  }
}

let defaultProvider: IRewardedAdProvider | null = null;

export function getRewardedAdProvider(): IRewardedAdProvider {
  if (!defaultProvider) defaultProvider = new StubRewardedAdProvider();
  return defaultProvider;
}

export function setRewardedAdProvider(provider: IRewardedAdProvider): void {
  defaultProvider = provider;
}
