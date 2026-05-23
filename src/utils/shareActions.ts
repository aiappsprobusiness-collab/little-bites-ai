/**
 * Общие действия шаринга: копирование текста в буфер (WhatsApp / Telegram).
 */

export async function copyShareTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
