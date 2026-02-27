/**
 * Аналитика trial flow и вирусности через usage_events.
 * Fire-and-forget: клиент не зависит от ответа edge.
 */

import { SUPABASE_URL } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";

const ANON_ID_KEY = "usage_anon_id";
const SESSION_ID_KEY = "usage_session_id";
const LAST_UTM_KEY = "last_touch_utm";
const LAST_ENTRY_POINT_KEY = "last_touch_entry_point";
const LAST_SHARE_CHANNEL_KEY = "last_touch_share_channel";
const LAST_SHARE_REF_KEY = "last_touch_share_ref";
const TRACK_EDGE_PATH = "/functions/v1/track-usage-event";

function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Анонимный id (localStorage), один на устройство. */
export function getOrCreateAnonId(): string {
  if (typeof localStorage === "undefined") return randomUuid();
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = randomUuid();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

/** Id сессии (sessionStorage), новая вкладка = новая сессия. */
export function getOrCreateSessionId(): string {
  if (typeof sessionStorage === "undefined") return randomUuid();
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = randomUuid();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export interface StoredUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/**
 * Парсит UTM, ep, ch, sr из текущего URL и один раз сохраняет в localStorage.
 * Вызывать при старте приложения (App.tsx).
 */
export function captureAttributionFromLocationOnce(): void {
  if (typeof window === "undefined" || !window.location?.search) return;
  const params = new URLSearchParams(window.location.search);
  const utm_source = params.get("utm_source") ?? undefined;
  const utm_medium = params.get("utm_medium") ?? undefined;
  const utm_campaign = params.get("utm_campaign") ?? undefined;
  const utm_content = params.get("utm_content") ?? undefined;
  const utm_term = params.get("utm_term") ?? undefined;
  const ep = params.get("ep") ?? undefined;
  const ch = params.get("ch") ?? undefined;
  const sr = params.get("sr") ?? undefined;

  const hasUtm = utm_source ?? utm_medium ?? utm_campaign ?? utm_content ?? utm_term;
  const hasShare = ep === "share_recipe" || ch || sr;

  if (hasUtm) {
    const utm: StoredUtm = {};
    if (utm_source) utm.utm_source = utm_source;
    if (utm_medium) utm.utm_medium = utm_medium;
    if (utm_campaign) utm.utm_campaign = utm_campaign;
    if (utm_content) utm.utm_content = utm_content;
    if (utm_term) utm.utm_term = utm_term;
    try {
      localStorage.setItem(LAST_UTM_KEY, JSON.stringify(utm));
    } catch {
      /* ignore */
    }
  }
  if (ep) {
    try {
      localStorage.setItem(LAST_ENTRY_POINT_KEY, ep);
    } catch {
      /* ignore */
    }
  }
  if (ch) {
    try {
      localStorage.setItem(LAST_SHARE_CHANNEL_KEY, ch);
    } catch {
      /* ignore */
    }
  }
  if (sr) {
    try {
      localStorage.setItem(LAST_SHARE_REF_KEY, sr);
    } catch {
      /* ignore */
    }
  }
}

function getStoredUtm(): StoredUtm | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_UTM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUtm;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getStoredEntryPoint(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_ENTRY_POINT_KEY);
}

function getStoredShareChannel(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SHARE_CHANNEL_KEY);
}

function getStoredShareRef(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SHARE_REF_KEY);
}

/**
 * Сохранить атрибуцию шаринга из короткой ссылки /r/:shareRef (для последующего auth_success и аналитики).
 */
export function setShareAttributionFromShortLink(shareRef: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_SHARE_REF_KEY, shareRef);
    localStorage.setItem(LAST_ENTRY_POINT_KEY, "share_recipe");
  } catch {
    /* ignore */
  }
}

export interface TrackUsageEventOptions {
  memberId?: string | null;
  properties?: Record<string, unknown>;
}

/**
 * Отправить событие в usage_events (fire-and-forget).
 * Автоматически добавляет: anon_id, session_id, page, entry_point, utm, share_ref, share_channel в properties.
 */
export function trackUsageEvent(
  feature: string,
  options: TrackUsageEventOptions = {}
): void {
  if (!feature || typeof feature !== "string") return;
  const baseUrl = SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return;

  const url = `${baseUrl}${TRACK_EDGE_PATH}`;
  const anonId = getOrCreateAnonId();
  const sessionId = getOrCreateSessionId();
  const page = typeof window !== "undefined" ? window.location.pathname || undefined : undefined;
  const entryPoint = getStoredEntryPoint() ?? undefined;
  const utm = getStoredUtm() ?? undefined;
  const shareRef = getStoredShareRef() ?? undefined;
  const shareChannel = getStoredShareChannel() ?? undefined;

  const properties: Record<string, unknown> = {
    ...(options.properties ?? {}),
  };
  if (shareRef !== undefined) properties.share_ref = shareRef;
  if (shareChannel !== undefined) properties.share_channel = shareChannel;

  const body = {
    feature: feature.trim(),
    anon_id: anonId,
    session_id: sessionId,
    member_id: options.memberId ?? null,
    page: page ?? null,
    entry_point: entryPoint ?? null,
    utm: utm ?? null,
    properties,
  };

  if (import.meta.env.DEV) {
    console.debug("[usageEvents]", feature, body);
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* fire-and-forget: ignore */
    });
  });
}

// --- Share virality ---

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Короткий id для шаринга (8–12 символов, base62). */
export function generateShareRef(): string {
  const len = 8 + Math.floor(Math.random() * 5);
  let s = "";
  const arr = typeof crypto !== "undefined" && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(len))
    : null;
  for (let i = 0; i < len; i++) {
    const r = arr ? arr[i]! % 62 : Math.floor(Math.random() * 62);
    s += BASE62[r];
  }
  return s;
}

export type ShareChannel = "telegram" | "whatsapp" | "copy_link" | "other";

/**
 * Определить канал шаринга по контексту.
 * При navigator.share() точный канал неизвестен — передавать "other".
 */
export function getShareChannelFromContext(
  usedNativeShare: boolean,
  explicitCopyLink?: boolean
): ShareChannel {
  if (explicitCopyLink) return "copy_link";
  if (usedNativeShare) return "other";
  return "copy_link";
}

/**
 * Короткая ссылка для шаринга: /r/:shareRef (без query-параметров).
 */
export function getShortShareUrl(shareRef: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(shareRef)}`;
}

/**
 * Сохранить share_ref в БД (share_refs). Вызывать при шаринге от имени authenticated.
 * Возвращает true при успехе, false при ошибке (например, RLS или дубликат).
 */
export async function saveShareRef(recipeId: string, shareRef: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("share_refs").insert({
      share_ref: shareRef,
      recipe_id: recipeId,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * URL рецепта с query-параметрами (ep, ch, sr) — для обратной совместимости со старыми ссылками.
 * Новый шаринг использует getShortShareUrl + saveShareRef.
 */
export function getShareRecipeUrl(
  recipeId: string,
  shareChannel: ShareChannel,
  shareRef: string,
  baseUrl: string
): string {
  const u = new URL(`/recipe/${recipeId}`, baseUrl);
  u.searchParams.set("ep", "share_recipe");
  u.searchParams.set("ch", shareChannel);
  u.searchParams.set("sr", shareRef);
  return u.toString();
}
