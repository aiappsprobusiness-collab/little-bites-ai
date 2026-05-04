import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CONNECTIVITY_ANALYTICS_FEATURE,
  flushConnectivityAnalyticsQueue,
  reportConnectivityAnalytics,
} from "./connectivityAnalytics";

const trackUsageEventOk = vi.fn();

vi.mock("@/utils/usageEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/usageEvents")>();
  return {
    ...actual,
    trackUsageEventOk: (...args: unknown[]) => trackUsageEventOk(...args),
  };
});

describe("connectivityAnalytics", () => {
  beforeEach(() => {
    trackUsageEventOk.mockReset();
    localStorage.removeItem("mr_connectivity_pending_analytics");
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.removeItem("mr_connectivity_pending_analytics");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reportConnectivityAnalytics calls trackUsageEventOk with immediate delivery", async () => {
    trackUsageEventOk.mockResolvedValue(true);
    await reportConnectivityAnalytics({
      outcome: "ok",
      check_ms: 42,
      health_source: "supabase_default",
    });
    expect(trackUsageEventOk).toHaveBeenCalledWith(CONNECTIVITY_ANALYTICS_FEATURE, {
      properties: expect.objectContaining({
        outcome: "ok",
        check_ms: 42,
        health_source: "supabase_default",
        delivery: "immediate",
      }),
    });
    expect(localStorage.getItem("mr_connectivity_pending_analytics")).toBeNull();
  });

  it("reportConnectivityAnalytics enqueues when trackUsageEventOk returns false", async () => {
    trackUsageEventOk.mockResolvedValue(false);
    await reportConnectivityAnalytics({
      outcome: "blocked",
      check_ms: 10,
      health_source: "supabase_default",
    });
    const raw = localStorage.getItem("mr_connectivity_pending_analytics");
    expect(raw).toBeTruthy();
    const q = JSON.parse(raw!) as unknown[];
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ outcome: "blocked", check_ms: 10 });
  });

  it("flushConnectivityAnalyticsQueue sends replay and clears queue on success", async () => {
    localStorage.setItem(
      "mr_connectivity_pending_analytics",
      JSON.stringify([
        {
          outcome: "blocked",
          check_ms: 5,
          health_source: "supabase_default",
          deferred_at_ms: 111,
        },
      ]),
    );
    trackUsageEventOk.mockResolvedValue(true);
    await flushConnectivityAnalyticsQueue();
    expect(trackUsageEventOk).toHaveBeenCalledWith(
      CONNECTIVITY_ANALYTICS_FEATURE,
      expect.objectContaining({
        properties: expect.objectContaining({
          delivery: "replay",
          deferred_at_ms: 111,
          outcome: "blocked",
        }),
      }),
    );
    expect(localStorage.getItem("mr_connectivity_pending_analytics")).toBeNull();
  });

  it("flushConnectivityAnalyticsQueue keeps items when send fails", async () => {
    localStorage.setItem(
      "mr_connectivity_pending_analytics",
      JSON.stringify([
        {
          outcome: "timeout",
          check_ms: 20,
          health_source: "custom",
          deferred_at_ms: 222,
        },
      ]),
    );
    trackUsageEventOk.mockResolvedValue(false);
    await flushConnectivityAnalyticsQueue();
    const q = JSON.parse(localStorage.getItem("mr_connectivity_pending_analytics")!) as unknown[];
    expect(q).toHaveLength(1);
  });
});
