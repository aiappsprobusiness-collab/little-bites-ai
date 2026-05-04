import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkAppConnectivity } from "./checkAppConnectivity";
import { resolveAppHealthCheckUrlFromEnv } from "./resolveAppHealthCheckUrl";

describe("resolveAppHealthCheckUrlFromEnv", () => {
  it("prefers VITE_APP_HEALTH_URL", () => {
    expect(
      resolveAppHealthCheckUrlFromEnv({
        VITE_APP_HEALTH_URL: "https://api.example/health",
        VITE_SUPABASE_URL: "https://x.supabase.co",
      }),
    ).toBe("https://api.example/health");
  });

  it("trims VITE_APP_HEALTH_URL", () => {
    expect(
      resolveAppHealthCheckUrlFromEnv({
        VITE_APP_HEALTH_URL: "  https://h.test/z  ",
      }),
    ).toBe("https://h.test/z");
  });

  it("falls back to Supabase auth health", () => {
    expect(
      resolveAppHealthCheckUrlFromEnv({
        VITE_SUPABASE_URL: "https://proj.supabase.co/",
      }),
    ).toBe("https://proj.supabase.co/auth/v1/health");
  });

  it("returns null without URLs", () => {
    expect(resolveAppHealthCheckUrlFromEnv({})).toBeNull();
  });
});

describe("checkAppConnectivity", () => {
  const origFetch = globalThis.fetch;
  const origOnLine = typeof navigator !== "undefined" ? navigator.onLine : true;

  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
  });

  afterEach(() => {
    vi.stubGlobal("fetch", origFetch);
    vi.stubGlobal("navigator", { ...navigator, onLine: origOnLine });
    vi.restoreAllMocks();
  });

  it("returns no_internet when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r).toEqual({
      reason: "no_internet",
      message: "Нет интернета. Проверьте подключение.",
    });
  });

  it("returns ok on HEAD 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r).toEqual({ reason: "ok" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/health",
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
  });

  it("retries with GET when HEAD returns 405", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r).toEqual({ reason: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://example.com/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns server_error on 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r.reason).toBe("server_error");
    expect(r).toMatchObject({ message: expect.stringContaining("сервере"), http_status: 503 });
  });

  it("returns bad_response on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r.reason).toBe("bad_response");
    expect(r).toMatchObject({ http_status: 404 });
  });

  it("returns blocked on TypeError Failed to fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const r = await checkAppConnectivity("https://example.com/health");
    expect(r.reason).toBe("blocked");
    expect(r).toMatchObject({ message: expect.stringContaining("VPN") });
  });

  it("returns timeout when request exceeds timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = opts?.signal;
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );
    const r = await checkAppConnectivity("https://example.com/health", 20);
    expect(r.reason).toBe("timeout");
    expect(r).toMatchObject({ message: expect.stringContaining("не ответил") });
  });
});
