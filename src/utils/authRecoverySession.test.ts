import { describe, it, expect } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { isRecoveryJwtSession } from "./authRecoverySession";

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
