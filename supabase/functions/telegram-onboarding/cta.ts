import type { BuildAuthCtaInput } from "./types.ts";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "blogger_id"] as const;

export function buildAuthSignupUrl(input: BuildAuthCtaInput): string {
  const baseUrl = input.appBaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/auth`);
  url.searchParams.set("mode", "signup");
  url.searchParams.set("entry_point", "telegram");
  url.searchParams.set("utm_source", "telegram");

  const utm = input.utm ?? {};
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}
