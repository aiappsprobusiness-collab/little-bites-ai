import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildAuthSignupUrl } from "./cta.ts";

Deno.test("buildAuthSignupUrl sets telegram entry point", () => {
  const url = buildAuthSignupUrl({ appBaseUrl: "https://momrecipes.online/" });
  const parsed = new URL(url);
  assertEquals(parsed.pathname, "/auth");
  assertEquals(parsed.searchParams.get("mode"), "signup");
  assertEquals(parsed.searchParams.get("entry_point"), "telegram");
  assertEquals(parsed.searchParams.get("utm_source"), "telegram");
});

Deno.test("buildAuthSignupUrl forwards attribution params", () => {
  const url = buildAuthSignupUrl({
    appBaseUrl: "https://momrecipes.online",
    utm: { utm_campaign: "blogger", blogger_id: "maria" },
  });
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("utm_campaign"), "blogger");
  assertEquals(parsed.searchParams.get("blogger_id"), "maria");
});
