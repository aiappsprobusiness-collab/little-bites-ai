/**
 * Извлечение JSON-объекта из ответа модели (от первой { до последней }).
 */

/**
 * Извлекает подстроку от первой «{» до парной «}», учитывая вложенность и строки.
 */
export function extractJsonObject(text: string): string | null {
  const trimmed = (text ?? "").trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";

  for (let j = start; j < trimmed.length; j++) {
    const c = trimmed[j];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, j + 1);
    }
  }

  if (depth > 0 && trimmed.length > 100) {
    let repaired = trimmed.slice(start);
    if (inString) repaired += quote;
    for (let i = 0; i < depth; i++) repaired += "}";
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // ignore
    }
  }
  return null;
}
