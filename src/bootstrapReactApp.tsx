import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ConnectivityGateScreen } from "./components/ConnectivityGateScreen";
import type { ConnectivityCheckResult } from "./utils/checkAppConnectivity";
import { checkAppConnectivity } from "./utils/checkAppConnectivity";
import {
  flushConnectivityAnalyticsQueue,
  reportConnectivityAnalytics,
  resolveConnectivityHealthSource,
} from "./utils/connectivityAnalytics";
import { resolveAppHealthCheckUrl } from "./utils/resolveAppHealthCheckUrl";

function logStartupPerfAfterPaint(): void {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("perf") !== "1") return;
  console.log("[perf] pwa react root render (after connectivity gate)", performance.now());
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.log("[perf] pwa first frames after root (rAF×2)", performance.now());
    });
  });
}

function getRootEl(): HTMLElement {
  const el = document.getElementById("root");
  if (!el) throw new Error("Missing #root");
  return el;
}

/** Убрать HTML-splash, чтобы экран ошибки не оказался под z-index слоем splash. */
function removeSplashForConnectivityMessage(): void {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  splash.style.pointerEvents = "none";
  splash.style.opacity = "0";
  splash.style.transition = "opacity 200ms ease-out";
  setTimeout(() => splash.remove(), 220);
}

function shouldSkipConnectivityCheck(): boolean {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("skipConnectivity") === "1";
}

function emitConnectivityAnalyticsSession(
  result: ConnectivityCheckResult | { reason: "skipped"; skip_reason: "query" | "no_health_url" },
  checkMs: number,
): void {
  const health_source = resolveConnectivityHealthSource();
  void (async () => {
    try {
      if (result.reason === "skipped") {
        await flushConnectivityAnalyticsQueue();
        await reportConnectivityAnalytics({
          outcome: "skipped",
          check_ms: checkMs,
          health_source,
          skip_reason: result.skip_reason === "query" ? "query" : "no_health_url",
        });
        return;
      }
      if (result.reason === "ok") {
        await flushConnectivityAnalyticsQueue();
        await reportConnectivityAnalytics({
          outcome: "ok",
          check_ms: checkMs,
          health_source,
        });
        return;
      }
      await reportConnectivityAnalytics({
        outcome: result.reason,
        check_ms: checkMs,
        http_status: result.http_status,
        health_source,
      });
    } catch {
      /* не блокируем старт приложения */
    }
  })();
}

/**
 * Монтирует App после проверки HEAD/GET к health URL (см. resolveAppHealthCheckUrl).
 * Параметр `?skipConnectivity=1` отключает проверку (отладка / обход).
 */
export async function mountReactApp(): Promise<void> {
  const rootEl = getRootEl();

  if (shouldSkipConnectivityCheck()) {
    emitConnectivityAnalyticsSession({ reason: "skipped", skip_reason: "query" }, 0);
    createRoot(rootEl).render(<App />);
    logStartupPerfAfterPaint();
    return;
  }

  const healthUrl = resolveAppHealthCheckUrl();
  if (!healthUrl) {
    if (import.meta.env.DEV) {
      console.warn("[connectivity] Нет VITE_APP_HEALTH_URL и VITE_SUPABASE_URL — проверка пропущена.");
    }
    emitConnectivityAnalyticsSession({ reason: "skipped", skip_reason: "no_health_url" }, 0);
    createRoot(rootEl).render(<App />);
    logStartupPerfAfterPaint();
    return;
  }

  const checkStarted = performance.now();
  const result = await checkAppConnectivity(healthUrl);
  const checkMs = Math.round(performance.now() - checkStarted);
  emitConnectivityAnalyticsSession(result, checkMs);

  if (result.reason === "ok") {
    createRoot(rootEl).render(<App />);
    logStartupPerfAfterPaint();
    return;
  }

  removeSplashForConnectivityMessage();
  createRoot(rootEl).render(<ConnectivityGateScreen result={result} />);
  logStartupPerfAfterPaint();
}
