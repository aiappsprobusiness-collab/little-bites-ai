/**
 * Секция «к врачу» в ответе SOS по промпту (п.3) в UI не показывается списком —
 * текст после заголовка отрезается, вместо блока — редкая мягкая строка внизу.
 */
const HELP_DOCTOR_SECTION_START =
  /(?:^|\n)\s*(?:\d+\.\s*)?(?:[#*\s]*[⚠️]*\s*)?(?:\*\*)?(?:К\s+врачу\s*:?|К\s+врачу\s+если|Когда\s+к\s+врачу|Срочно\s+к\s+врачу)(?:\*\*)?\s*:?[^\n]*(?:\r?\n|$)/i;

export function stripHelpDoctorSection(content: string): string {
  const safe = typeof content === "string" ? content : "";
  const match = HELP_DOCTOR_SECTION_START.exec(safe);
  if (!match || match.index === undefined) return safe.trim();
  return safe.slice(0, match.index).trim();
}

/** ~50% сообщений, стабильно по id — без ощущения повторяющегося предупреждения в каждом ответе. */
export function shouldShowHelpDoctorReminder(messageId: string): boolean {
  let h = 0;
  for (let i = 0; i < messageId.length; i++) {
    h = (h * 31 + messageId.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 2 === 0;
}
