/**
 * Извлекает несколько последовательных JSON-объектов из текста (без запятых между ними).
 * Учитывает строки в двойных кавычках и escape.
 */
export function parseMultiJsonObjects(text) {
  const t = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!t) return [];

  const objs = [];
  let pos = 0;

  while (pos < t.length) {
    while (pos < t.length && /\s/.test(t[pos])) pos++;
    if (pos >= t.length) break;
    if (t[pos] !== "{") {
      throw new Error(`Ожидался '{' на позиции ${pos}, получено: ${JSON.stringify(t.slice(pos, pos + 40))}`);
    }

    let depth = 0;
    const start = pos;
    for (; pos < t.length; pos++) {
      const c = t[pos];
      if (c === '"') {
        pos++;
        while (pos < t.length) {
          const ch = t[pos];
          if (ch === "\\") {
            pos += 2;
            continue;
          }
          if (ch === '"') break;
          pos++;
        }
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) {
          pos++;
          const slice = t.slice(start, pos);
          objs.push(JSON.parse(slice));
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error("Незакрытая скобка объекта JSON");
    }
  }

  return objs;
}

/**
 * Несколько подряд JSON-массивов (как у adult_216_1200: `[ {...}, ... ]\n\n[ ... ]`).
 */
export function parseMultiJsonTopLevelArrays(text) {
  const t = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!t) return [];

  const arrays = [];
  let pos = 0;

  while (pos < t.length) {
    while (pos < t.length && /\s/.test(t[pos])) pos++;
    if (pos >= t.length) break;
    if (t[pos] !== "[") {
      throw new Error(`Ожидался '[' на позиции ${pos}: ${JSON.stringify(t.slice(pos, pos + 40))}`);
    }

    let depth = 0;
    const start = pos;
    for (; pos < t.length; pos++) {
      const c = t[pos];
      if (c === '"') {
        pos++;
        while (pos < t.length) {
          const ch = t[pos];
          if (ch === "\\") {
            pos += 2;
            continue;
          }
          if (ch === '"') break;
          pos++;
        }
        continue;
      }
      if (c === "[") depth++;
      if (c === "]") {
        depth--;
        if (depth === 0) {
          pos++;
          arrays.push(JSON.parse(t.slice(start, pos)));
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error("Незакрытый JSON-массив");
    }
  }

  return arrays;
}
