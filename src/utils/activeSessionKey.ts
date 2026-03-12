/**
 * Одна активная сессия на аккаунт.
 * При входе с нового устройства генерируется новый active_session_key в profiles_v2,
 * старое устройство при следующей проверке обнаруживает несовпадение и разлогинивается.
 */

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lb_active_session_key";
/** Ключ в sessionStorage: причина принудительного выхода (показываем сообщение на /auth). */
export const SESSION_INVALID_REASON_KEY = "lb_session_invalid_reason";
export const SESSION_INVALID_REASON_REPLACED = "replaced";

export function generateSessionKey(): string {
  const array = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getStoredSessionKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredSessionKey(key: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearStoredSessionKey(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Устанавливает новый активный ключ сессии в БД и в localStorage.
 * Вызывать после успешного логина (password или callback).
 */
export async function setActiveSessionKeyForUser(userId: string): Promise<{ error: Error | null }> {
  const key = generateSessionKey();
  const { error } = await supabase
    .from("profiles_v2")
    .update({ active_session_key: key })
    .eq("user_id", userId);
  if (error) return { error };
  setStoredSessionKey(key);
  return { error: null };
}

export type SessionValidationResult =
  | { valid: true }
  | { valid: false; reason: typeof SESSION_INVALID_REASON_REPLACED };

/**
 * Проверяет, совпадает ли текущее устройство с единственной активной сессией.
 * - Если в БД ещё нет ключа (legacy): считаем это устройство активным, записываем ключ.
 * - Если ключ в БД совпадает с локальным — valid.
 * - Если не совпадает — сессия заменена другим устройством, valid: false.
 */
export async function validateActiveSession(userId: string): Promise<SessionValidationResult> {
  const { data, error } = await supabase
    .from("profiles_v2")
    .select("active_session_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || data == null) {
    return { valid: true };
  }

  const serverKey = (data as { active_session_key: string | null }).active_session_key ?? null;
  const localKey = getStoredSessionKey();

  if (serverKey === null) {
    await setActiveSessionKeyForUser(userId);
    return { valid: true };
  }

  if (localKey === null) {
    return { valid: false, reason: SESSION_INVALID_REASON_REPLACED };
  }

  if (localKey !== serverKey) {
    return { valid: false, reason: SESSION_INVALID_REASON_REPLACED };
  }

  return { valid: true };
}

export function setSessionInvalidReason(reason: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_INVALID_REASON_KEY, reason);
}

export function getAndClearSessionInvalidReason(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const value = sessionStorage.getItem(SESSION_INVALID_REASON_KEY);
  sessionStorage.removeItem(SESSION_INVALID_REASON_KEY);
  return value;
}
