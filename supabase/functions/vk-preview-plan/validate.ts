import type { VkPreviewPlanRequest } from "./types.ts";

const AGE_MIN = 6;
const AGE_MAX = 216;
const MAX_ALLERGIES = 20;
const MAX_TAGS = 30;
const MAX_BODY_BYTES = 32_000;

function normalizeStringArray(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function validateRequestBody(raw: unknown): { ok: true; body: VkPreviewPlanRequest } | { ok: false; message: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, message: "Invalid JSON body" };
  }
  const o = raw as Record<string, unknown>;
  const age = o.age_months;
  if (typeof age !== "number" || !Number.isFinite(age)) {
    return { ok: false, message: "age_months must be a number" };
  }
  const ageInt = Math.max(0, Math.round(age));
  if (Math.abs(age - ageInt) > 1e-9) {
    return { ok: false, message: "age_months must be an integer" };
  }
  if (ageInt < AGE_MIN || ageInt > AGE_MAX) {
    return { ok: false, message: `age_months must be between ${AGE_MIN} and ${AGE_MAX}` };
  }
  const allergies = normalizeStringArray(o.allergies, MAX_ALLERGIES);
  const likes = normalizeStringArray(o.likes, MAX_TAGS);
  const dislikes = normalizeStringArray(o.dislikes, MAX_TAGS);
  const entry_point = o.entry_point === "vk" ? "vk" : undefined;
  let utm: Record<string, string> | undefined;
  if (o.utm != null && typeof o.utm === "object" && !Array.isArray(o.utm)) {
    const u: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.utm as Record<string, unknown>)) {
      if (typeof k !== "string" || k.length > 64) continue;
      if (typeof v !== "string" || v.length > 256) continue;
      u[k.trim().slice(0, 64)] = v.trim().slice(0, 256);
      if (Object.keys(u).length >= 20) break;
    }
    if (Object.keys(u).length) utm = u;
  }
  return {
    ok: true,
    body: {
      age_months: ageInt,
      allergies,
      likes,
      dislikes,
      ...(entry_point ? { entry_point } : {}),
      ...(utm ? { utm } : {}),
    },
  };
}

export function assertBodySizeOk(contentLength: string | null): { ok: true } | { ok: false; message: string } {
  if (!contentLength) return { ok: true };
  const n = Number(contentLength);
  if (!Number.isFinite(n) || n > MAX_BODY_BYTES) {
    return { ok: false, message: "Payload too large" };
  }
  return { ok: true };
}
