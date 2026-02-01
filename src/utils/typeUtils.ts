/**
 * Coerce unknown value to string[], with deduplication.
 * - Array: each element trimmed (or parsed if JSON string); empty strings removed.
 * - String: if JSON array, parse; else split by comma, trim, filter empty.
 * - Otherwise: [].
 */
export function ensureStringArray(v: unknown): string[] {
  let arr: string[] = [];
  if (Array.isArray(v)) {
    arr = v
      .flatMap((x) => {
        if (typeof x === 'string' && x.trim().startsWith('[') && x.trim().endsWith(']')) {
          try {
            const parsed = JSON.parse(x);
            return Array.isArray(parsed) ? parsed : [x];
          } catch {
            return [x];
          }
        }
        const s = typeof x === 'string' ? x.trim() : String(x);
        return s ? [s] : [];
      })
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim());
  } else if (typeof v === 'string' && v.trim()) {
    if (v.trim().startsWith('[') && v.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          arr = parsed
            .filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
            .map((i) => i.trim());
        } else {
          arr = v.split(',').map((s) => s.trim()).filter(Boolean);
        }
      } catch {
        arr = v.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else {
      arr = v.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [...new Set(arr)];
}
