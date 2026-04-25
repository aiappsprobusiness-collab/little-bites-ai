import type { DayPlan, VkDraft } from "@/types/vkFunnel";

const STORAGE_KEY = "lb.vkDraft.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isVkDraft(v: unknown): v is VkDraft {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    o.entry_point === "vk" &&
    typeof o.created_at === "number" &&
    typeof o.expires_at === "number" &&
    typeof o.age_months === "number" &&
    typeof o.vk_session_id === "string" &&
    Array.isArray(o.allergies) &&
    Array.isArray(o.likes) &&
    Array.isArray(o.dislikes)
  );
}

export function readVkDraftRaw(): VkDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isVkDraft(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function ensureVkSessionId(draft: VkDraft | null): string {
  if (draft?.vk_session_id) return draft.vk_session_id;
  return randomUuid();
}

export function saveVkDraft(partial: Partial<Omit<VkDraft, "version" | "entry_point">> & Partial<Pick<VkDraft, "age_months" | "allergies" | "likes" | "dislikes">>): void {
  if (typeof localStorage === "undefined") return;
  const prev = readVkDraftRaw();
  const now = Date.now();
  const draft: VkDraft = {
    version: 1,
    entry_point: "vk",
    created_at: partial.created_at ?? prev?.created_at ?? now,
    expires_at: now + TTL_MS,
    vk_session_id: partial.vk_session_id ?? prev?.vk_session_id ?? randomUuid(),
    age_months: partial.age_months ?? prev?.age_months ?? 24,
    allergies: partial.allergies ?? prev?.allergies ?? [],
    likes: partial.likes ?? prev?.likes ?? [],
    dislikes: partial.dislikes ?? prev?.dislikes ?? [],
    dayPlanPreview: partial.dayPlanPreview !== undefined ? partial.dayPlanPreview : prev?.dayPlanPreview ?? null,
    handoff_consumed: partial.handoff_consumed ?? prev?.handoff_consumed ?? false,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function updateVkDraftPreview(plan: DayPlan | null): void {
  saveVkDraft({ dayPlanPreview: plan });
}

export function markVkHandoffConsumed(): void {
  saveVkDraft({ handoff_consumed: true });
}

export function clearVkDraft(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Черновик для префилла профиля: валиден и не consumed. */
export function getVkDraftForProfilePrefill(): VkDraft | null {
  const d = readVkDraftRaw();
  if (!d || d.handoff_consumed) return null;
  return d;
}
