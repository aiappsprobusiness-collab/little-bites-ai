import { trackUsageEventOk } from "@/utils/usageEvents";

/** Каноническое имя события в `usage_events.feature` (см. ANALYTICS_EVENT_TAXONOMY_STAGE2.md). */
export const CONNECTIVITY_ANALYTICS_FEATURE = "app_connectivity_result";

const STORAGE_KEY = "mr_connectivity_pending_analytics";
const MAX_QUEUED = 8;

export type ConnectivityAnalyticsOutcome =
  | "ok"
  | "no_internet"
  | "blocked"
  | "server_error"
  | "timeout"
  | "bad_response"
  | "skipped";

export type ConnectivityHealthSource = "supabase_default" | "custom" | "none";

export type ConnectivitySkipReason = "query" | "no_health_url";

export interface ConnectivityAnalyticsPayload {
  outcome: ConnectivityAnalyticsOutcome;
  check_ms: number;
  http_status?: number;
  health_source: ConnectivityHealthSource;
  /** Только для `outcome === "skipped"`. */
  skip_reason?: ConnectivitySkipReason;
}

interface QueuedRow extends Omit<ConnectivityAnalyticsPayload, "skip_reason"> {
  deferred_at_ms: number;
}

function isQueuedRow(x: unknown): x is QueuedRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.outcome === "string" &&
    typeof o.check_ms === "number" &&
    typeof o.health_source === "string" &&
    typeof o.deferred_at_ms === "number"
  );
}

function readQueue(): QueuedRow[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedRow).slice(-MAX_QUEUED);
  } catch {
    return [];
  }
}

function writeQueue(rows: QueuedRow[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (rows.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_QUEUED)));
  } catch {
    /* ignore quota */
  }
}

function enqueue(row: QueuedRow): void {
  const q = readQueue();
  q.push(row);
  writeQueue(q);
}

export function resolveConnectivityHealthSource(): ConnectivityHealthSource {
  const custom = import.meta.env.VITE_APP_HEALTH_URL?.trim();
  if (custom) return "custom";
  const base = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (base) return "supabase_default";
  return "none";
}

function buildProperties(
  payload: ConnectivityAnalyticsPayload,
  delivery: "immediate" | "replay",
  deferred_at_ms?: number,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    outcome: payload.outcome,
    check_ms: payload.check_ms,
    health_source: payload.health_source,
    delivery,
  };
  if (payload.http_status != null) props.http_status = payload.http_status;
  if (payload.skip_reason != null) props.skip_reason = payload.skip_reason;
  if (delivery === "replay" && deferred_at_ms != null) props.deferred_at_ms = deferred_at_ms;
  return props;
}

/**
 * Отправить накопленные события (когда не дошли до Edge при прошлой загрузке).
 * Вызывать при успешной проверке health или при старте без проверки (лучший шанс доставить).
 */
export async function flushConnectivityAnalyticsQueue(): Promise<void> {
  const pending = readQueue();
  if (pending.length === 0) return;
  const still: QueuedRow[] = [];
  for (const row of pending) {
    const ok = await trackUsageEventOk(CONNECTIVITY_ANALYTICS_FEATURE, {
      properties: buildProperties(
        {
          outcome: row.outcome,
          check_ms: row.check_ms,
          http_status: row.http_status,
          health_source: row.health_source,
        },
        "replay",
        row.deferred_at_ms,
      ),
    });
    if (!ok) still.push(row);
  }
  writeQueue(still);
}

/**
 * Записать результат проверки связи в `usage_events`. При неудаче — в очередь localStorage.
 */
export async function reportConnectivityAnalytics(payload: ConnectivityAnalyticsPayload): Promise<void> {
  const ok = await trackUsageEventOk(CONNECTIVITY_ANALYTICS_FEATURE, {
    properties: buildProperties(payload, "immediate"),
  });
  if (ok) return;
  enqueue({
    outcome: payload.outcome,
    check_ms: payload.check_ms,
    http_status: payload.http_status,
    health_source: payload.health_source,
    deferred_at_ms: Date.now(),
  });
}
