/**
 * Ссылки `https://t.me/<bot>?start=...` для блогеров.
 * Параметры `start` совпадают с `parseStartUmt` в `supabase/functions/telegram-onboarding/orchestrate.ts`.
 * Лимит длины `start` у Telegram ~64 байта (UTF-8) — не превышать.
 */

const ALLOWED_PARAM_KEYS = [
  "blogger_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export const TELEGRAM_START_MAX_BYTES = 64;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function normalizeBotUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

export type BuildTelegramStartInput = {
  /** Короткий код, попадёт в usage_events как `blogger_id` */
  bloggerId: string;
  utmCampaign?: string;
  utmMedium?: string;
  /** Если не задан, бот при разборе подставит `telegram` (как в parseStartUtm) */
  utmSource?: string;
  utmContent?: string;
  utmTerm?: string;
};

/**
 * Строка для `start` = query-string (как `URLSearchParams#toString()`), без внешнего кодирования.
 */
export function buildTelegramStartPayload(input: BuildTelegramStartInput): { payload: string; error?: string } {
  const id = input.bloggerId?.trim() ?? "";
  if (!id) {
    return { payload: "", error: "Укажите blogger_id" };
  }
  if (id.length > 120) {
    return { payload: "", error: "blogger_id слишком длинный" };
  }

  const p = new URLSearchParams();
  p.set("blogger_id", id);
  if (input.utmSource?.trim()) p.set("utm_source", input.utmSource.trim().slice(0, 120));
  if (input.utmMedium?.trim()) p.set("utm_medium", input.utmMedium?.trim().slice(0, 120));
  if (input.utmCampaign?.trim()) p.set("utm_campaign", input.utmCampaign?.trim().slice(0, 120));
  if (input.utmContent?.trim()) p.set("utm_content", input.utmContent?.trim().slice(0, 120));
  if (input.utmTerm?.trim()) p.set("utm_term", input.utmTerm?.trim().slice(0, 120));

  const payload = p.toString();
  const len = utf8ByteLength(payload);
  if (len > TELEGRAM_START_MAX_BYTES) {
    return {
      payload: "",
      error: `Слишком длинный start: ${len} байт, максимум ${TELEGRAM_START_MAX_BYTES}. Сократите blogger_id и UTM.`,
    };
  }
  return { payload };
}

/**
 * Готовая ссылка на бота. `botUsername` — username без @ и без t.me
 */
export function buildTelegramBloggerDeepLink(botUsername: string, startPayload: string): string {
  const u = normalizeBotUsername(botUsername);
  if (!u) {
    return "";
  }
  const url = new URL(`https://t.me/${u}`);
  url.searchParams.set("start", startPayload);
  return url.toString();
}

/**
 * @param envUsername — `import.meta.env.VITE_TELEGRAM_BOT_USERNAME`
 */
export function buildBloggerLinkFromForm(
  botUsername: string,
  input: BuildTelegramStartInput,
): { link: string; error?: string; lengthBytes: number } {
  const { payload, error } = buildTelegramStartPayload(input);
  if (error) return { link: "", error, lengthBytes: 0 };
  if (!botUsername?.trim()) {
    return { link: "", error: "Не задан VITE_TELEGRAM_BOT_USERNAME", lengthBytes: utf8ByteLength(payload) };
  }
  const link = buildTelegramBloggerDeepLink(botUsername, payload);
  return { link, lengthBytes: utf8ByteLength(payload) };
}

export { ALLOWED_PARAM_KEYS, normalizeBotUsername };
