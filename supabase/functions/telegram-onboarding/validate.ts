import type { InboundEvent, TelegramUpdate } from "./types.ts";

const MAX_TEXT_LENGTH = 1000;

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

export function parseUpdate(raw: unknown): { ok: true; update: TelegramUpdate } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "invalid_update" };
  const candidate = raw as Partial<TelegramUpdate>;
  if (typeof candidate.update_id !== "number" || !Number.isFinite(candidate.update_id)) {
    return { ok: false, message: "invalid_update_id" };
  }
  return { ok: true, update: candidate as TelegramUpdate };
}

export function updateToInboundEvent(update: TelegramUpdate): InboundEvent | null {
  const cb = update.callback_query;
  if (cb?.message?.chat?.id && typeof cb.data === "string" && cb.data.trim()) {
    return {
      kind: "callback",
      chat_id: cb.message.chat.id,
      user_id: cb.from.id,
      data: normalizeText(cb.data),
    };
  }

  const msg = update.message;
  if (!msg?.chat?.id) return null;
  const text = normalizeText(msg.text);
  if (!text) return null;
  return {
    kind: "message",
    chat_id: msg.chat.id,
    user_id: typeof msg.from?.id === "number" ? msg.from.id : null,
    text,
  };
}

export function splitCsvTags(text: string, maxItems = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(",")) {
    const token = raw.trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseAgeMonths(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  const direct = Number.parseInt(normalized, 10);
  if (Number.isFinite(direct) && direct >= 6 && direct <= 216) return direct;
  const yearsMatch = normalized.match(/^(\d{1,2})\s*(лет|год|года|years|year|y)$/);
  if (yearsMatch) {
    const years = Number.parseInt(yearsMatch[1], 10);
    const months = years * 12;
    if (months >= 6 && months <= 216) return months;
  }
  return null;
}
