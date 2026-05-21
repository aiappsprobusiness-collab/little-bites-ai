import { describe, expect, it, vi, afterEach } from "vitest";
import { getPaywallFunnelContext, paywallViewProperties } from "./paywallFunnelAnalytics";

describe("getPaywallFunnelContext", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("within_first_24h when signup was 2h ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T14:00:00.000Z"));
    const created = "2026-05-19T12:00:00.000Z";
    const ctx = getPaywallFunnelContext(created);
    expect(ctx.within_first_24h).toBe(true);
    expect(ctx.hours_since_signup).toBe(2);
  });

  it("not within_first_24h after 25h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T13:00:00.000Z"));
    const created = "2026-05-19T12:00:00.000Z";
    const ctx = getPaywallFunnelContext(created);
    expect(ctx.within_first_24h).toBe(false);
  });
});

describe("paywallViewProperties", () => {
  it("includes paywall_reason and funnel fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T13:00:00.000Z"));
    const props = paywallViewProperties("limit_chat", "2026-05-19T12:00:00.000Z");
    expect(props.paywall_reason).toBe("limit_chat");
    expect(props.within_first_24h).toBe(true);
    expect(props.hours_since_signup).toBe(1);
  });
});
