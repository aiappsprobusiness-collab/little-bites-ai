/**
 * Разбор и рендер двухстрочного body paywall (без `whitespace-pre-line` в одном абзаце).
 */

/** Разбить сообщение по переводам строк; пустые строки отбрасываются. */
export function splitPaywallMessage(message: string): string[] {
  return message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Канонический формат paywall: ровно две короткие строки. */
export function paywallBodyPair(line1: string, line2: string): readonly [string, string] {
  return [line1.trim(), line2.trim()];
}
