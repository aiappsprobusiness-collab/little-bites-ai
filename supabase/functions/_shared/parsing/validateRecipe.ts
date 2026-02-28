/**
 * Валидация ответа с рецептом: извлечение → парсинг → схема.
 * Этап (extract / parse / validate) логируется снаружи.
 */

import { extractJsonObject } from "./extractJson.ts";
import { normalizeQuotes } from "./normalizeQuotes.ts";

export type ValidateRecipeResult<T> =
  | { valid: T; stage: "ok" }
  | { valid: null; stage: "extract"; error: string }
  | { valid: null; stage: "parse"; error: string }
  | { valid: null; stage: "validate"; error: string };

/**
 * Извлекает JSON, нормализует кавычки, парсит и прогоняет через validator.
 * validator(str) возвращает нормализованный объект или null.
 */
export function validateRecipe<T>(
  rawText: string,
  validator: (jsonStr: string) => T | null
): ValidateRecipeResult<T> {
  const jsonStr = extractJsonObject(rawText);
  if (!jsonStr) {
    return { valid: null, stage: "extract", error: "no JSON object found" };
  }

  const normalized = normalizeQuotes(jsonStr);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (e) {
    return {
      valid: null,
      stage: "parse",
      error: e instanceof Error ? e.message : "JSON parse error",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: null, stage: "validate", error: "root is not object" };
  }

  const jsonStrForValidator = JSON.stringify(parsed);
  const valid = validator(jsonStrForValidator);
  if (valid === null) {
    return { valid: null, stage: "validate", error: "schema validation failed" };
  }

  return { valid, stage: "ok" };
}
