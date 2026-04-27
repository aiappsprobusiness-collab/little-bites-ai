import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildAuthSignupUrl,
  buildRecipePageUrl,
  buildRecipeTeaserPageUrl,
  buildTelegramOnboardingFinalAuthUrl,
  buildVkFunnelHandoffUrl,
} from "./cta.ts";

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

Deno.test("buildRecipePageUrl points to /recipe/:id", () => {
  const url = buildRecipePageUrl("https://momrecipes.online", "abc-uuid-1", { utm_campaign: "tg" });
  assertEquals(url.includes("/recipe/abc-uuid-1"), true);
  assertEquals(url.includes("entry_point=telegram"), true);
});

Deno.test("buildRecipeTeaserPageUrl points to /t/:id", () => {
  const url = buildRecipeTeaserPageUrl("https://momrecipes.online", "abc-uuid-1", {});
  assertEquals(new URL(url).pathname, "/t/abc-uuid-1");
  assertEquals(url.includes("entry_point=telegram"), true);
});

Deno.test("buildTelegramOnboardingFinalAuthUrl sets signup + stable bot analytics defaults", () => {
  const url = buildTelegramOnboardingFinalAuthUrl({ appBaseUrl: "https://momrecipes.online" });
  const p = new URL(url);
  assertEquals(p.pathname, "/auth");
  assertEquals(p.searchParams.get("mode"), "signup");
  assertEquals(p.searchParams.get("entry_point"), "telegram");
  assertEquals(p.searchParams.get("utm_source"), "telegram");
  assertEquals(p.searchParams.get("utm_medium"), "onboarding_bot");
  assertEquals(p.searchParams.get("utm_content"), "menu_day_final");
});

Deno.test("buildTelegramOnboardingFinalAuthUrl preserves deep-link UTM when set", () => {
  const url = buildTelegramOnboardingFinalAuthUrl({
    appBaseUrl: "https://momrecipes.online",
    utm: { utm_campaign: "influencer", utm_medium: "reels", blogger_id: "x" },
  });
  const p = new URL(url);
  assertEquals(p.searchParams.get("utm_campaign"), "influencer");
  assertEquals(p.searchParams.get("utm_medium"), "reels");
  assertEquals(p.searchParams.get("blogger_id"), "x");
  assertEquals(p.searchParams.get("utm_content"), "menu_day_final");
});

Deno.test("buildVkFunnelHandoffUrl points to /vk", () => {
  const url = buildVkFunnelHandoffUrl("https://momrecipes.online/", {});
  assertEquals(new URL(url).pathname, "/vk");
});
