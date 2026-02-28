/**
 * Нормализация кавычек в JSON-строке (одиночные → двойные для ключей/значений).
 */

/**
 * Заменяет одиночные кавычки на двойные там, где ожидается JSON.
 * Минимальная эвристика: только если после замены строка парсится.
 */
export function normalizeQuotes(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== "string") return jsonStr;
  let out = jsonStr.trim();
  if (out.startsWith("'") && out.endsWith("'")) {
    out = '"' + out.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"';
  }
  const singleKey = /'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g;
  out = out.replace(singleKey, (_, key) => '"' + key.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '":');
  return out;
}
