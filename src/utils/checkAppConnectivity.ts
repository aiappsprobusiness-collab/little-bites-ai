export type ConnectivityCheckReason =
  | "ok"
  | "no_internet"
  | "blocked"
  | "server_error"
  | "timeout"
  | "bad_response";

export type ConnectivityCheckResult =
  | { reason: "ok" }
  | {
      reason: Exclude<ConnectivityCheckReason, "ok">;
      message: string;
      /** HTTP-код ответа health (если был ответ до классификации). */
      http_status?: number;
    };

const MSG = {
  noInternet: "Нет интернета. Проверьте подключение.",
  blocked: "Сайт не открывается. Попробуйте включить VPN.",
  serverError: "Ошибка на сервере. Мы уже чиним.",
  timeout: "Сервер не ответил вовремя. Проверьте сеть и попробуйте снова.",
  badResponse: "Не удалось проверить доступность сервиса. Обновите страницу.",
} as const;

function isNetworkLikeError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string };
  const name = err.name ?? "";
  const msg = String(err.message ?? "");
  return (
    name === "TypeError" ||
    /Failed to fetch|NetworkError|Load failed|network error/i.test(msg)
  );
}

/** Supabase Auth/REST без `apikey` часто отвечают 401 — health нельзя дергать «голым» fetch. */
function supabaseAnonHeaders(): Record<string, string> | null {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof key !== "string" || !key.trim()) return null;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function isHealthUrlForConfiguredSupabase(healthUrl: string): boolean {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return false;
  try {
    return new URL(healthUrl).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

async function fetchHealthOnce(url: string, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  const anon = supabaseAnonHeaders();
  if (anon && isHealthUrlForConfiguredSupabase(url)) {
    Object.assign(headers, anon);
  }
  return fetch(url, { method, signal, cache: "no-store", headers: Object.keys(headers).length ? headers : undefined });
}

/**
 * Проверка доступности приложения до основного UI.
 * Сначала `navigator.onLine`, затем HEAD к health (при 405 — один повтор GET).
 */
export async function checkAppConnectivity(
  healthUrl: string,
  timeoutMs = 5000,
): Promise<ConnectivityCheckResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { reason: "no_internet", message: MSG.noInternet };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let res = await fetchHealthOnce(healthUrl, "HEAD", controller.signal);
    if (res.status === 405) {
      res = await fetchHealthOnce(healthUrl, "GET", controller.signal);
    }

    if (res.ok) {
      return { reason: "ok" };
    }

    if (res.status >= 500 && res.status <= 599) {
      return { reason: "server_error", message: MSG.serverError, http_status: res.status };
    }

    return { reason: "bad_response", message: MSG.badResponse, http_status: res.status };
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";

    if (name === "AbortError" && timedOut) {
      return { reason: "timeout", message: MSG.timeout };
    }

    if (name === "AbortError" || isNetworkLikeError(e)) {
      return { reason: "blocked", message: MSG.blocked };
    }

    return { reason: "blocked", message: MSG.blocked };
  } finally {
    clearTimeout(timer);
  }
}
