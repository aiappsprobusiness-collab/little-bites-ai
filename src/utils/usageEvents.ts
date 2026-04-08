/**
 * Аналитика trial flow и вирусности через usage_events.
 * Fire-and-forget: клиент не зависит от ответа edge.
 *
 * Защита от дублей: короткое окно dedup по feature+page+entry+fingerprint свойств;
 * для «view»-событий окно длиннее, для действий — короче (см. VIEW_STYLE_FEATURES).
 * Ошибки track-usage-event: backoff только по конкретному feature (не глобальный silence 60s).
 *
 * Лимитные feature (chat_recipe, help, plan_fill_day, plan_refresh) с клиента не отправляются
 * (см. trackUsageClientPolicy + Edge track-usage-event).
 */

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingAttribution } from "@/utils/onboardingAttribution";
import { isClientForbiddenUsageFeature } from "@/utils/trackUsageClientPolicy";
import { getAnalyticsPlatform } from "@/utils/analyticsPlatform";

const ANON_ID_KEY = "mr_anon_id";
const SESSION_ID_KEY = "mr_session_id";
const LAST_UTM_KEY = "last_touch_utm";
const LAST_ENTRY_POINT_KEY = "last_touch_entry_point";
const LAST_SHARE_CHANNEL_KEY = "last_touch_share_channel";
const LAST_SHARE_REF_KEY = "last_touch_share_ref";
const LAST_SHARE_TYPE_KEY = "last_touch_share_type";
const TRACK_EDGE_PATH = "/functions/v1/track-usage-event";

/** «Пассивные» просмотры — более длинное окно анти-дубля. */
const VIEW_STYLE_FEATURES = new Set<string>([
  "landing_view",
  "prelogin_view",
  "auth_page_view",
  "plan_view_day",
  "chat_open",
  "help_open",
  "paywall_view",
  "paywall_text",
  "paywall_replace_meal_shown",
  "trial_onboarding_shown",
  "pricing_info_opened",
  "share_landing_view",
  "shared_plan_view",
  "shared_plan_not_found_view",
  "recipe_view",
]);

const VIEW_DEDUP_MS = 4_000;
const ACTION_DEDUP_MS = 550;
const FEATURE_BACKOFF_MS = 12_000;
const DEDUP_CACHE_TTL_CLEANUP = 90_000;
const DEDUP_MAX_ENTRIES = 80;
const FEATURE_BACKOFF_MAX = 40;

const featureFailureUntil = new Map<string, number>();
const dedupSentAt = new Map<string, number>();

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

function pruneFeatureBackoff(now: number) {
  for (const [k, until] of featureFailureUntil) {
    if (until <= now) featureFailureUntil.delete(k);
  }
  while (featureFailureUntil.size > FEATURE_BACKOFF_MAX) {
    const first = featureFailureUntil.keys().next().value;
    if (first === undefined) break;
    featureFailureUntil.delete(first);
  }
}

function isInFeatureBackoff(feature: string, now: number): boolean {
  const until = featureFailureUntil.get(feature);
  return until != null && now < until;
}

function recordFeatureFailure(feature: string, now: number) {
  featureFailureUntil.set(feature, now + FEATURE_BACKOFF_MS);
  pruneFeatureBackoff(now);
}

function recordFeatureSuccess(feature: string) {
  featureFailureUntil.delete(feature);
}

function pruneDedup(now: number) {
  for (const [k, t] of dedupSentAt) {
    if (now - t > DEDUP_CACHE_TTL_CLEANUP) dedupSentAt.delete(k);
  }
  while (dedupSentAt.size > DEDUP_MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestT = Infinity;
    for (const [k, t] of dedupSentAt) {
      if (t < oldestT) {
        oldestT = t;
        oldestKey = k;
      }
    }
    if (oldestKey === undefined) break;
    dedupSentAt.delete(oldestKey);
  }
}

function propsFingerprint(properties: Record<string, unknown> | undefined): string {
  if (!properties || Object.keys(properties).length === 0) return "_";
  const keys = Object.keys(properties).sort();
  const parts: string[] = [];
  for (const k of keys) {
    try {
      parts.push(`${k}:${JSON.stringify(properties[k])}`);
    } catch {
      parts.push(`${k}:[!]`);
    }
  }
  return parts.join("|");
}

function shouldSkipDedup(
  feature: string,
  page: string,
  entryPoint: string,
  fp: string,
  now: number
): boolean {
  const isView = VIEW_STYLE_FEATURES.has(feature);
  const kind = isView ? "v" : "a";
  const windowMs = isView ? VIEW_DEDUP_MS : ACTION_DEDUP_MS;
  const key = `${kind}|${feature}|${page}|${entryPoint}|${fp}`;
  const last = dedupSentAt.get(key);
  if (last != null && now - last < windowMs) {
    return true;
  }
  dedupSentAt.set(key, now);
  pruneDedup(now);
  return false;
}

export interface StoredUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

function storedUtmHasAny(utm: StoredUtm | null | undefined): boolean {
  if (!utm) return false;
  return Boolean(
    utm.utm_source ||
      utm.utm_medium ||
      utm.utm_campaign ||
      utm.utm_content ||
      utm.utm_term
  );
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
  const ep = params.get("entry_point") ?? params.get("ep") ?? undefined;
  const ch = params.get("ch") ?? undefined;
  const sr = params.get("share_ref") ?? params.get("sr") ?? undefined;
  const shareType = params.get("share_type") ?? undefined;

  const hasUtm = utm_source ?? utm_medium ?? utm_campaign ?? utm_content ?? utm_term;
  const hasShare = ep === "share_recipe" || ep === "shared_recipe" || ep?.startsWith("shared_") || ch || sr;

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
  if (shareType) {
    try {
      localStorage.setItem(LAST_SHARE_TYPE_KEY, shareType);
    } catch {
      /* ignore */
    }
  }
}

function getStoredShareType(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SHARE_TYPE_KEY);
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

/** Есть ли атрибуция от shared recipe (приход по /r/:shareRef). */
export function hasShareRecipeAttribution(): boolean {
  return getStoredEntryPoint() === "share_recipe" || getStoredShareRef() != null;
}

function mergeOnboardingIntoProperties(
  properties: Record<string, unknown>,
  ob: ReturnType<typeof getOnboardingAttribution>
): Record<string, unknown> {
  if (!ob) return properties;
  const onboarding: Record<string, unknown> = {};
  if (ob.first_landing_path) onboarding.first_landing_path = ob.first_landing_path;
  if (ob.entry_point) onboarding.onboarding_entry_point = ob.entry_point;
  if (ob.shareRef) onboarding.onboarding_share_ref = ob.shareRef;
  if (ob.ref) onboarding.onboarding_ref = ob.ref;
  if (ob.share_type) onboarding.onboarding_share_type = ob.share_type;
  if (ob.source) onboarding.onboarding_utm_source = ob.source;
  if (ob.medium) onboarding.onboarding_utm_medium = ob.medium;
  if (ob.campaign) onboarding.onboarding_utm_campaign = ob.campaign;
  if (ob.content) onboarding.onboarding_utm_content = ob.content;
  if (ob.term) onboarding.onboarding_utm_term = ob.term;
  if (Object.keys(onboarding).length === 0) return properties;
  return { ...properties, onboarding };
}

function resolveUtmForBody(
  ob: ReturnType<typeof getOnboardingAttribution>
): StoredUtm | undefined {
  const stored = getStoredUtm();
  if (storedUtmHasAny(stored)) {
    return stored ?? undefined;
  }
  if (ob && (ob.source || ob.medium || ob.campaign || ob.content || ob.term)) {
    return {
      utm_source: ob.source,
      utm_medium: ob.medium,
      utm_campaign: ob.campaign,
      utm_content: ob.content,
      utm_term: ob.term,
    };
  }
  return stored ?? undefined;
}

export interface TrackUsageEventOptions {
  memberId?: string | null;
  properties?: Record<string, unknown>;
}

/**
 * Отправить событие в usage_events (fire-and-forget).
 * Автоматически добавляет: anon_id, session_id, page, entry_point, utm, share_ref, share_channel,
 * onboarding-контекст (properties.onboarding + fallback колонок utm_* из onboarding_attribution).
 */
export function trackUsageEvent(
  feature: string,
  options: TrackUsageEventOptions = {}
): void {
  if (!feature || typeof feature !== "string") return;
  const featureKey = feature.trim();
  if (!featureKey) return;

  if (isClientForbiddenUsageFeature(featureKey)) {
    if (import.meta.env.DEV) {
      console.warn("[usageEvents] skip limit-sensitive feature (server-only):", featureKey);
    }
    return;
  }

  const baseUrl = SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !anonKey) return;

  const now = Date.now();
  const page = typeof window !== "undefined" ? window.location.pathname || "" : "";
  const entryPoint = getStoredEntryPoint() ?? "";
  const ob = getOnboardingAttribution();

  const rawProps: Record<string, unknown> = {
    ...(options.properties ?? {}),
  };
  const shareRef = getStoredShareRef() ?? undefined;
  const shareChannel = getStoredShareChannel() ?? undefined;
  const shareType = getStoredShareType() ?? undefined;
  if (shareRef !== undefined) rawProps.share_ref = shareRef;
  if (shareChannel !== undefined) rawProps.share_channel = shareChannel;
  if (shareType !== undefined) rawProps.share_type = shareType;

  const merged = mergeOnboardingIntoProperties(rawProps, ob);
  const properties = { ...merged, platform: getAnalyticsPlatform() };
  const fp = propsFingerprint(options.properties);

  if (isInFeatureBackoff(featureKey, now)) {
    return;
  }
  if (shouldSkipDedup(featureKey, page, entryPoint, fp, now)) {
    return;
  }

  const anonId = getOrCreateAnonId();
  const sessionId = getOrCreateSessionId();
  const utm = resolveUtmForBody(ob);

  const body = {
    feature: featureKey,
    anon_id: anonId,
    session_id: sessionId,
    member_id: options.memberId ?? null,
    page: page || null,
    entry_point: entryPoint || null,
    utm: utm ?? null,
    properties,
  };

  if (import.meta.env.DEV) {
    console.debug("[usageEvents]", featureKey, body);
  }

  const url = `${baseUrl}${TRACK_EDGE_PATH}`;

  supabase.auth.getSession().then(({ data: { session } }) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: anonKey,
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          recordFeatureFailure(featureKey, Date.now());
          if (import.meta.env.DEV) {
            console.warn("[usageEvents] track-usage-event failed, feature backoff:", featureKey, res.status);
          }
        } else {
          recordFeatureSuccess(featureKey);
        }
      })
      .catch(() => {
        recordFeatureFailure(featureKey, Date.now());
        if (import.meta.env.DEV) {
          console.warn("[usageEvents] track-usage-event network error, feature backoff:", featureKey);
        }
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
/**
 * Событие начала viral funnel: ref записан (recipe или план — через отдельные вызовы).
 * Вызывать после успешного persist ref, до UI share sheet.
 */
export function trackShareLinkCreated(properties: {
  share_type: "recipe" | "day_plan" | "week_plan";
  share_ref: string;
  surface: string;
  recipe_id?: string;
  has_native_share?: boolean;
}): void {
  trackUsageEvent("share_link_created", { properties });
}

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
