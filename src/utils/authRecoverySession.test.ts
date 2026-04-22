import { describe, it, expect, afterEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { isRecoveryJwtSession, isRecoveryUrlPresent } from "./authRecoverySession";

function makeSession(payload: Record<string, unknown>): Session {
  const b64 = btoa(JSON.stringify(payload));
  return {
    access_token: `x.${b64}.y`,
    refresh_token: "r",
    expires_in: 3600,
    token_type: "bearer",
    user: {} as Session["user"],
  };
}

describe("isRecoveryJwtSession", () => {
  it("returns true when amr contains recovery object", () => {
    const s = makeSession({
      amr: [{ method: "recovery", timestamp: 1 }],
    });
    expect(isRecoveryJwtSession(s)).toBe(true);
  });

  it("returns true when amr contains recovery string", () => {
    const s = makeSession({ amr: ["recovery"] });
    expect(isRecoveryJwtSession(s)).toBe(true);
  });

  it("returns false for normal password session", () => {
    const s = makeSession({
      amr: [{ method: "password", timestamp: 1 }],
    });
    expect(isRecoveryJwtSession(s)).toBe(false);
  });

  it("returns false for null session", () => {
    expect(isRecoveryJwtSession(null)).toBe(false);
  });
});

describe("isRecoveryUrlPresent", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("returns false for email signup confirm on /auth/callback (tokens + type=signup)", () => {
    window.history.pushState({}, "", "/auth/callback#access_token=x&type=signup&refresh_token=y");
    expect(isRecoveryUrlPresent()).toBe(false);
  });

  it("returns true when hash contains type=recovery", () => {
    window.history.pushState({}, "", "/auth/callback#access_token=x&type=recovery");
    expect(isRecoveryUrlPresent()).toBe(true);
  });

  it("returns true for reset-password path with access_token (forgot password flow)", () => {
    window.history.pushState({}, "", "/auth/reset-password#access_token=x&refresh_token=y");
    expect(isRecoveryUrlPresent()).toBe(true);
  });

  it("returns false for magic link style tokens on / without type=recovery", () => {
    window.history.pushState({}, "", "/#access_token=x&type=magiclink");
    expect(isRecoveryUrlPresent()).toBe(false);
  });
});
