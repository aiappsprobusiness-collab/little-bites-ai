/**
 * Сериализация ошибок для логов (избегаем "Error … {}").
 * Для ошибок Supabase добавляет code, message, details, hint.
 */

export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function isSupabaseError(err: unknown): err is { code?: string; message?: string; details?: string; hint?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    ("code" in err || "message" in err || "details" in err || "hint" in err)
  );
}

/**
 * Возвращает объект, пригодный для JSON.stringify в логах.
 * - Error: name, message, stack
 * - Supabase-подобный объект: code, message, details, hint
 * - Иначе: message из err или String(err)
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const out: SerializedError = { message: err.message };
    if (err.name) out.name = err.name;
    if (err.stack) out.stack = err.stack;
    return out;
  }
  if (isSupabaseError(err)) {
    return {
      message: err.message ?? "Supabase error",
      ...(err.code && { code: err.code }),
      ...(err.details && { details: err.details }),
      ...(err.hint && { hint: err.hint }),
    };
  }
  return { message: err != null ? String(err) : "unknown error" };
}
