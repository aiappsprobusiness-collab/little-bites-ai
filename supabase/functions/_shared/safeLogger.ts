const SENSITIVE_KEYS = [
  "authorization",
  "apikey",
  "api_key",
  "token",
  "access_token",
  "refresh_token",
  "cookie",
] as const;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((k) => lower.includes(k));
}

/** Редактирует Bearer-токены и JWT в строках. */
function redactString(s: string): string {
  if (typeof s !== "string") return s;
  if (/Bearer\s+/i.test(s)) {
    return s.replace(/Bearer\s+.+/i, "Bearer [REDACTED]");
  }
  const parts = s.split(".");
  if (parts.length === 3 && parts.every((p) => p.length > 20)) {
    return "[REDACTED_JWT]";
  }
  return s;
}

/**
 * Рекурсивно редактирует чувствительные данные в объекте.
 * Не мутирует оригинал. Ключи (case-insensitive): authorization, apikey, api_key, token, access_token, refresh_token, cookie → "[REDACTED]"
 */
function redactValue(val: unknown): unknown {
  if (typeof val === "string") return redactString(val);
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map((item) => redactValue(item));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(value);
  }
  return result;
}

export function redactSensitiveData(obj: unknown): unknown {
  return redactValue(obj);
}

function redactArgs(args: unknown[]): unknown[] {
  return args.map((arg) => redactValue(arg));
}

export function safeLog(...args: unknown[]): void {
  console.log(...redactArgs(args));
}

export function safeError(...args: unknown[]): void {
  console.error(...redactArgs(args));
}

export function safeWarn(...args: unknown[]): void {
  console.warn(...redactArgs(args));
}
