/** CHAT_DESCRIPTION_DEBUG=true: лог `CHAT_DESCRIPTION_DEBUG` (request_id, raw_llm_description, llm_description_accepted, rejection_reason, final_description_source, final_description). Чат и БД — один финальный текст после pickCanonicalDescription. */

export function isChatDescriptionDebugEnabled(): boolean {
  const v = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno?.env?.get?.(
    "CHAT_DESCRIPTION_DEBUG",
  );
  return v === "1" || v === "true" || v === "TRUE";
}
