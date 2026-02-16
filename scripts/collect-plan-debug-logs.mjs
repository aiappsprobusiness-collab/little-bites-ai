/**
 * Quality Debug Workflow: запуск генерации + сбор Edge Logs в один отчёт.
 *
 * Требует .env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (или VITE_SUPABASE_ANON_KEY)
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD (или HARNESS_TOKEN)
 *
 * Опционально для логов: SUPABASE_ACCESS_TOKEN (PAT от dashboard → account tokens)
 *   Без него — fallback: job + meal_plans snapshot, инструкция в консоль.
 *
 * npm run debug:plan
 * node scripts/collect-plan-debug-logs.mjs --mode week --debug
 * node scripts/collect-plan-debug-logs.mjs --mode week --member <uuid> --debug
 * node scripts/collect-plan-debug-logs.mjs --mode day --member <uuid> --debug
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      const key = m[1];
      const raw = m[2].trim();
      const value = raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replace(/\\"/g, '"')
        : raw.replace(/^['']|['']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
function loadEnv() {
  loadEnvFile(join(root, ".env"));
  loadEnvFile(join(root, ".env.local"));
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

function logStep(msg) {
  console.log("[>]", msg);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const members = [];
  let mode = "week";
  let start = null;
  let timeoutSec = null;
  let debug = false;
  let upgrade = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--member" && args[i + 1]) members.push(args[++i]);
    else if (args[i] === "--mode" && args[i + 1]) mode = args[++i];
    else if (args[i] === "--start" && args[i + 1]) start = args[++i];
    else if (args[i] === "--timeoutSec" && args[i + 1]) timeoutSec = parseInt(args[++i], 10) || null;
    else if (args[i] === "--debug") debug = true;
    else if (args[i] === "--upgrade") upgrade = true;
    else if (args[i] === "--token" && args[i + 1]) process.env.HARNESS_TOKEN = args[++i];
  }
  return { members, mode, start, timeoutSec, debug, upgrade };
}

function getStartKey(startArg) {
  if (startArg && /^\d{4}-\d{2}-\d{2}$/.test(startArg)) return startArg;
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function getProjectRef(url) {
  if (!url) return null;
  const m = url.match(/https:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return m ? m[1] : null;
}

async function getAuthToken() {
  if (process.env.HARNESS_TOKEN) return process.env.HARNESS_TOKEN;
  if (!SUPABASE_ANON_KEY || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    const missing = [];
    if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY или VITE_SUPABASE_ANON_KEY");
    if (!TEST_USER_EMAIL) missing.push("TEST_USER_EMAIL");
    if (!TEST_USER_PASSWORD) missing.push("TEST_USER_PASSWORD");
    throw new Error(
      "Для auth нужен HARNESS_TOKEN, либо в .env: " +
        missing.join(", ") +
        ". После create-test-users: TEST_USER_EMAIL=testpremiumplan@example.com, TEST_USER_PASSWORD=0000"
    );
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (error) {
    throw new Error("Sign-in failed: " + (error.message || error.error_description || "unknown"));
  }
  return data.session?.access_token ?? null;
}

async function runGeneration(authToken, params) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };

  const startBody = {
    action: "start",
    type: params.type,
    member_id: params.member_id,
    member_data: params.member_data,
    debug_pool: params.debug,
    ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
    ...(params.type === "week" && { start_key: params.start_key }),
  };
  logStep("Calling generate-plan start...");
  const startRes = await fetch(url, { method: "POST", headers, body: JSON.stringify(startBody) });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error("start failed: " + (err.error || startRes.status));
  }
  const startData = await startRes.json();
  const jobId = startData.job_id;
  if (!jobId) throw new Error("No job_id in start response");

  const runBody = {
    action: "run",
    job_id: jobId,
    type: params.type,
    member_id: params.member_id,
    member_data: params.member_data,
    debug_pool: params.debug,
    ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
    ...(params.type === "week" && { start_key: params.start_key }),
  };
  logStep("Calling generate-plan run...");
  const runRes = await fetch(url, { method: "POST", headers, body: JSON.stringify(runBody) });
  if (!runRes.ok) {
    const err = await runRes.json().catch(() => ({}));
    throw new Error("run failed: " + (err.error || runRes.status));
  }

  const pollInterval = 2000;
  const maxWait = (params.timeoutSec ?? (params.type === "week" ? 420 : 180)) * 1000;
  const deadline = Date.now() + maxWait;
  logStep("Polling job status...");
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/plan_generation_jobs?id=eq.${jobId}&select=status,error_text,progress_done,progress_total,created_at,updated_at,completed_at`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const statusData = await statusRes.json();
    const row = statusData?.[0];
    const status = row?.status;
    if (status === "done") {
      return {
        job_id: jobId,
        status: "done",
        progress_done: row?.progress_done,
        progress_total: row?.progress_total,
        error_text: row?.error_text,
        created_at: row?.created_at,
        updated_at: row?.updated_at,
        completed_at: row?.completed_at,
      };
    }
    if (status === "error") {
      return {
        job_id: jobId,
        status: "error",
        error_text: row?.error_text || "unknown",
        progress_done: row?.progress_done,
        progress_total: row?.progress_total,
        created_at: row?.created_at,
        updated_at: row?.updated_at,
        completed_at: row?.completed_at,
      };
    }
    process.stdout.write(".");
  }
  throw new Error("Job timeout after " + (maxWait / 1000) + "s");
}

function getRollingDayKeys(startKey) {
  const [y, m, d] = startKey.split("-").map(Number);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(y, m - 1, d + i);
    out.push(d2.toISOString().slice(0, 10));
  }
  return out;
}

async function runPoolUpgrade(authToken, params) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };
  const dayKeys = params.type === "week" ? getRollingDayKeys(params.start_key) : [params.day_key || params.start_key];
  const body = {
    mode: "upgrade",
    type: params.type,
    member_id: params.member_id,
    member_data: params.member_data,
    start_key: params.start_key,
    day_keys: dayKeys,
    debug_pool: params.debug,
  };
  logStep("Calling generate-plan upgrade (Подобрать из базы)...");
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error("upgrade failed: " + (err.error || res.status));
  }
  return await res.json();
}

async function fetchManagementLogs(projectRef, startIso, endIso) {
  if (!SUPABASE_ACCESS_TOKEN || !projectRef) return null;
  // function_logs = console output from Edge Functions (default logs.all returns edge_logs only)
  const sql = `SELECT timestamp, event_message, metadata FROM function_logs WHERE timestamp >= '${startIso}' AND timestamp <= '${endIso}' AND (event_message LIKE '%[POOL DEBUG]%' OR event_message LIKE '%[ALLERGY DEBUG]%' OR event_message LIKE '%[SANITY DEBUG]%' OR event_message LIKE '%[PLAN QUALITY]%' OR event_message LIKE '%[JOB]%' OR event_message LIKE '%[POOL UPGRADE]%' OR event_message LIKE '%reject_breakdown%') ORDER BY timestamp ASC LIMIT 2000`;
  const params = new URLSearchParams({
    iso_timestamp_start: startIso,
    iso_timestamp_end: endIso,
    sql,
  });
  const url = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?${params}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
    });
    if (!res.ok) {
      const err = await res.text();
      if (err && err.length < 200) logStep("Logs API: " + err);
      return null;
    }
    const data = await res.json();
    return data?.result ?? null;
  } catch (e) {
    logStep("Logs fetch error: " + (e?.message || "unknown"));
    return null;
  }
}

function parseLogResult(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.result && Array.isArray(raw.result) ? raw.result : raw?.rows ?? []);
  const entries = [];
  for (const row of arr) {
    if (row?.event_message) entries.push({ event_message: row.event_message, metadata: row.metadata });
    else if (typeof row === "string") entries.push({ event_message: row });
    else if (row && typeof row === "object") entries.push({ event_message: row.message ?? row.event_message ?? JSON.stringify(row), metadata: row.metadata ?? row });
  }
  return entries;
}

function categorizeLogs(entries) {
  const categories = {
    candidates_snapshot: [],
    reject_breakdown: [],
    allergy: [],
    sanity: [],
    plan_quality: [],
    job: [],
    pool_upgrade: [],
    other: [],
  };
  const patterns = [
    { key: "candidates_snapshot", pattern: "[POOL DEBUG] candidates_snapshot" },
    { key: "reject_breakdown", pattern: "reject_breakdown" },
    { key: "allergy", pattern: "[ALLERGY DEBUG]" },
    { key: "sanity", pattern: "[SANITY DEBUG]" },
    { key: "plan_quality", pattern: "[PLAN QUALITY]" },
    { key: "job", pattern: "[JOB]" },
    { key: "pool_upgrade", pattern: "[POOL UPGRADE]" },
  ];
  for (const e of entries) {
    const msg = (e.event_message || e.message || JSON.stringify(e)).toString();
    let placed = false;
    for (const { key, pattern } of patterns) {
      if (msg.includes(pattern)) {
        categories[key].push(e);
        placed = true;
        break;
      }
    }
    if (!placed) categories.other.push(e);
  }
  return categories;
}

async function main() {
  const { members, mode, start, timeoutSec, debug, upgrade } = parseArgs();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Ошибка: нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env");
    process.exit(1);
  }
  if (!SUPABASE_ANON_KEY) {
    console.error("Ошибка: нужен SUPABASE_ANON_KEY (или VITE_SUPABASE_ANON_KEY) в .env для auth и polling");
    process.exit(1);
  }

  const memberId = members.length > 0 ? members[0] : null;
  const memberIdOrNull = memberId === "null" || memberId === "family" ? null : memberId;
  const startKey = getStartKey(start);
  const type = mode;
  const timeout = timeoutSec ?? (type === "week" ? 420 : 180);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let memberData = null;
  let userId = null;
  if (memberIdOrNull) {
    const { data: memberRow } = await supabase
      .from("members")
      .select("user_id, name, age_months, allergies, preferences")
      .eq("id", memberIdOrNull)
      .single();
    if (!memberRow) {
      console.error("Member not found:", memberIdOrNull);
      process.exit(1);
    }
    memberData = {
      name: memberRow.name,
      age_months: memberRow.age_months,
      allergies: memberRow.allergies || [],
      preferences: memberRow.preferences || [],
    };
    userId = memberRow.user_id;
  }

  logStep("Auth...");
  const authToken = await getAuthToken();

  if (!userId) {
    try {
      const payload = JSON.parse(Buffer.from(authToken.split(".")[1], "base64").toString());
      userId = payload?.sub ?? null;
    } catch {
      const { data: userRow } = await supabase.auth.admin.listUsers();
      userId = userRow?.users?.[0]?.id ?? null;
    }
  }
  if (!userId) {
    console.error("Не удалось определить user_id (нужен member или пользователи в проекте)");
    process.exit(1);
  }

  const request = {
    type,
    member_id: memberIdOrNull,
    member_data: memberData,
    start_key: startKey,
    debug_pool: debug,
    timeoutSec: timeout,
    ...(type === "day" && { day_key: startKey }),
  };

  const startedAt = new Date().toISOString();
  let job = null;
  let upgradeResult = null;

  if (upgrade) {
    logStep("Running pool upgrade (" + type + ", member=" + (memberIdOrNull ?? "family") + ")...");
    try {
      upgradeResult = await runPoolUpgrade(authToken, {
        type,
        member_id: memberIdOrNull,
        member_data: memberData,
        debug,
        start_key: startKey,
        ...(type === "day" && { day_key: startKey }),
      });
      job = { status: "done", ...upgradeResult };
      logStep("Upgrade OK: replaced " + (upgradeResult.replacedCount ?? 0) + ", unchanged " + (upgradeResult.unchangedCount ?? 0) + ", total " + (upgradeResult.totalSlots ?? 0));
    } catch (err) {
      console.error("\nОшибка:", err.message);
      job = { status: "error", error_text: err.message };
    }
  } else {
    logStep("Running generation (" + type + ", member=" + (memberIdOrNull ?? "family") + ")...");
    try {
      job = await runGeneration(authToken, {
        type,
        member_id: memberIdOrNull,
        member_data: memberData,
        debug,
        start_key: startKey,
        timeoutSec: timeout,
        ...(type === "day" && { day_key: startKey }),
      });
    } catch (err) {
      console.error("\nОшибка:", err.message);
      job = { status: "error", error_text: err.message };
    }
  }

  const finishedAt = new Date().toISOString();
  console.log("");

  let mealPlansSnapshot = null;
  try {
    const dayKeys = type === "week"
      ? (() => {
          const [y, m, d] = startKey.split("-").map(Number);
          const out = [];
          for (let i = 0; i < 7; i++) {
            const d2 = new Date(y, m - 1, d + i);
            out.push(d2.toISOString().slice(0, 10));
          }
          return out;
        })()
      : [startKey];
    let q = supabase
      .from("meal_plans_v2")
      .select("planned_date, meals")
      .eq("user_id", userId)
      .gte("planned_date", dayKeys[0])
      .lte("planned_date", dayKeys[dayKeys.length - 1]);
    if (memberIdOrNull == null) q = q.is("member_id", null);
    else q = q.eq("member_id", memberIdOrNull);
    const { data } = await q;
    mealPlansSnapshot = data ?? [];
  } catch (e) {
    mealPlansSnapshot = { error: e.message };
  }

  let logs = { candidates_snapshot: [], reject_breakdown: [], allergy: [], sanity: [], plan_quality: [], job: [], pool_upgrade: [], other: [] };

  const projectRef = getProjectRef(SUPABASE_URL);
  if (SUPABASE_ACCESS_TOKEN && projectRef) {
    const startDate = new Date(startedAt);
    const endDate = new Date(finishedAt);
    startDate.setMinutes(startDate.getMinutes() - 2);
    endDate.setMinutes(endDate.getMinutes() + 2);
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    logStep("Fetching Edge Logs...");
    const rawLogs = await fetchManagementLogs(projectRef, startIso, endIso);
    const entries = parseLogResult(rawLogs);
    logs = categorizeLogs(entries);
  } else {
    const tok = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
    logStep("Management API недоступен (нужен SUPABASE_ACCESS_TOKEN в .env)");
    if (!tok || !String(tok).trim()) {
      console.log("  Токен не найден. Проверьте строку в .env: SUPABASE_ACCESS_TOKEN=sbp_xxx");
    } else {
      console.log("  Токен найден, но логи не получены (возможно, нет прав analytics_logs_read).");
    }
    console.log("");
    console.log("Чтобы получить Edge Logs автоматически:");
    console.log("  1. Создайте Personal Access Token: https://supabase.com/dashboard/account/tokens");
    console.log("  2. Добавьте в .env: SUPABASE_ACCESS_TOKEN=<token>");
    console.log("");
    console.log("Либо включите GENERATE_PLAN_DEBUG=1 в Edge Function и смотрите логи в Dashboard:");
    console.log("  https://supabase.com/dashboard/project/" + (projectRef || "YOUR_REF") + "/logs/edge-logs");
  }

  const report = {
    request: { ...request, upgrade },
    job: job ? {
      status: job.status,
      progress_done: job.progress_done,
      progress_total: job.progress_total,
      error_text: job.error_text,
      replacedCount: job.replacedCount,
      unchangedCount: job.unchangedCount,
      totalSlots: job.totalSlots,
      started_at: startedAt,
      finished_at: finishedAt,
    } : null,
    mealPlansSnapshot,
    logs,
  };

  const memberLabel = memberIdOrNull ? String(memberIdOrNull).slice(0, 8) : "family";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportsDir = join(root, "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `plan_debug_${upgrade ? "upgrade_" : ""}${mode}_${memberLabel}_${ts}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  logStep("Отчёт сохранён: " + reportPath);
  console.log("");
  console.log("Сокращения для чата:");
  console.log("  contents.logs.candidates_snapshot[0]");
  console.log("  contents.logs.allergy[0]");
  console.log("  contents.logs.sanity[0]");
  console.log("  contents.logs.plan_quality");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
