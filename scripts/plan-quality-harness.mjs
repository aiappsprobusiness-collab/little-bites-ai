/**
 * Plan Quality Harness: прогон генерации планов и сбор метрик качества.
 *
 * Запуск (из корня, нужны в .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (или VITE_SUPABASE_ANON_KEY) — для auth
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD — тестовый пользователь
 *
 *   node scripts/plan-quality-harness.mjs --member <uuid> [--member <uuid>...] [--mode week|day] [--weeks 1] [--debug]
 *
 *   --member <uuid>   member_id (можно несколько раз для нескольких профилей)
 *   --mode week|day   week = premium 7 дней, day = 1 день
 *   --weeks N         сколько недель прогнать (по умолчанию 1)
 *   --debug           ставит debug_pool: true
 *   --token <jwt>     использовать готовый JWT вместо sign-in
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
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

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"];

// ——— Копия sanity/protein логики из generate-plan для оффлайн анализа ———
const DAIRY_TOKENS = [
  "молоко", "молочный", "сливки", "сметана", "творог", "сыр", "йогурт", "кефир", "ряженка", "масло", "мороженое", "сгущенка", "лактоза", "казеин", "сливочн",
  "milk", "dairy", "cream", "sour cream", "curd", "cheese", "yogurt", "kefir", "butter", "lactose", "casein",
];

function slotSanityReject(slotType, text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();
  if (slotType === "breakfast") {
    const heavy = ["суп", "борщ", "щи", "солянка", "рагу", "плов", "карри", "нут", "тушен", "тушён", "рыба", "soup"];
    if (heavy.some((tok) => t.includes(tok))) return "breakfast_heavy_dish";
  }
  if (slotType === "lunch") {
    const breakfastOnly = ["сырник", "оладь", "запеканк", "каша", "гранола", "тост"];
    if (breakfastOnly.some((tok) => t.includes(tok))) return "lunch_breakfast_only";
  }
  if (slotType === "dinner") {
    const snackOnly = ["йогурт", "творог", "дольки", "печенье", "батончик", "пюре", "смузи", "фрукты", "fruit"];
    if (snackOnly.some((tok) => t.includes(tok))) return "dinner_snack_only";
  }
  if (slotType === "snack") {
    const mainDishes = ["суп", "борщ", "рагу", "плов", "фарш", "котлет", "паста", "soup"];
    if (mainDishes.some((tok) => t.includes(tok))) return "snack_main_dish";
    const grainHeavy = ["каша", "гречк", "рис", "пшён", "овсян", "rice", "oat"];
    if (grainHeavy.some((tok) => t.includes(tok))) return "snack_grain_heavy";
    const breakfastOnSnack = ["запеканк", "олад", "сырник"];
    if (breakfastOnSnack.some((tok) => t.includes(tok))) return "snack_breakfast_dish";
  }
  return null;
}

function inferProteinKey(title, description) {
  const text = [title ?? "", description ?? ""].join(" ").toLowerCase();
  if (/\b(рыба|лосось|треск|тунец|судак|семг|семга|fish|salmon|cod|tuna)\b/.test(text)) return "fish";
  if (/\b(курица|индейка|chicken|turkey)\b/.test(text)) return "chicken";
  if (/\b(говядин|свинин|beef|pork)\b/.test(text)) return "beef_pork";
  if (/\b(творог|йогурт|сыр|молоко|dairy|curd|yogurt|cheese|milk)\b/.test(text)) return "dairy";
  if (/\b(нут|чечевиц|lentil|chickpea)\b/.test(text)) return "veg_beans";
  return null;
}

function normalizeTitleKey(title) {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsDairy(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return DAIRY_TOKENS.some((tok) => t.includes(tok));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const members = [];
  let mode = "week";
  let weeks = 1;
  let debug = false;
  let token = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--member" && args[i + 1]) {
      members.push(args[++i]);
    } else if (args[i] === "--mode" && args[i + 1]) {
      mode = args[++i];
    } else if (args[i] === "--weeks" && args[i + 1]) {
      weeks = parseInt(args[++i], 10) || 1;
    } else if (args[i] === "--debug") {
      debug = true;
    } else if (args[i] === "--token" && args[i + 1]) {
      token = args[++i];
    }
  }
  return { members, mode, weeks, debug, token };
}

function getRollingStartKey() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function getRolling7Dates(startKey) {
  const [y, m, d] = startKey.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(start);
    d2.setDate(d2.getDate() + i);
    out.push(
      d2.getFullYear() +
        "-" +
        String(d2.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d2.getDate()).padStart(2, "0")
    );
  }
  return out;
}

async function getAuthToken() {
  if (process.env.HARNESS_TOKEN) return process.env.HARNESS_TOKEN;
  const { token } = parseArgs();
  if (token) return token;
  if (!SUPABASE_ANON_KEY || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error(
      "Нужен токен: --token <jwt> или env HARNESS_TOKEN, либо SUPABASE_ANON_KEY + TEST_USER_EMAIL + TEST_USER_PASSWORD для sign-in"
    );
  }
  const authUrl = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;
  const res = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error("Sign-in failed: " + (err.error_description || res.statusText));
  }
  const data = await res.json();
  return data.access_token;
}

async function runGeneration(authToken, params) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  const startBody = {
    action: "start",
    type: params.type,
    member_id: params.member_id,
    member_data: params.member_data,
    debug_pool: params.debug,
    ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
    ...(params.type === "week" && { start_key: params.start_key }),
  };
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
  const runRes = await fetch(url, { method: "POST", headers, body: JSON.stringify(runBody) });
  if (!runRes.ok) {
    const err = await runRes.json().catch(() => ({}));
    throw new Error("run failed: " + (err.error || runRes.status));
  }

  const pollInterval = 2500;
  const maxWait = 120000;
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/plan_generation_jobs?id=eq.${jobId}&select=status,error_text`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const statusData = await statusRes.json();
    const status = statusData?.[0]?.status;
    if (status === "done") break;
    if (status === "error") {
      const errText = statusData?.[0]?.error_text || "unknown";
      throw new Error("Job error: " + errText);
    }
  }
  return { job_id: jobId, status: "done" };
}

async function fetchPlansAndRecipes(supabase, userId, memberId, startKey, type) {
  const dayKeys = type === "week" ? getRolling7Dates(startKey) : [startKey];
  const startDate = dayKeys[0];
  const endDate = dayKeys[dayKeys.length - 1];

  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .gte("planned_date", startDate)
    .lte("planned_date", endDate);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data: planRows, error } = await q;
  if (error) throw new Error("meal_plans_v2 fetch: " + error.message);

  const recipeIds = new Set();
  (planRows || []).forEach((row) => {
    const meals = row.meals || {};
    MEAL_KEYS.forEach((k) => {
      const slot = meals[k];
      if (slot?.recipe_id) recipeIds.add(slot.recipe_id);
    });
  });

  let recipes = {};
  if (recipeIds.size > 0) {
    const { data: recRows } = await supabase
      .from("recipes")
      .select("id, title, description, meal_type, source")
      .in("id", [...recipeIds]);
    (recRows || []).forEach((r) => {
      recipes[r.id] = r;
    });

    const { data: ingRows } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, display_text")
      .in("recipe_id", [...recipeIds]);
    (ingRows || []).forEach((ri) => {
      if (!recipes[ri.recipe_id]) return;
      const r = recipes[ri.recipe_id];
      r._ingredientsText = (r._ingredientsText || "") + " " + (ri.name || "") + " " + (ri.display_text || "");
    });
  }

  return { planRows: planRows || [], recipes };
}

function computeMetrics(planRows, recipes, allergies = []) {
  const hasMilkAllergy = allergies.some(
    (a) => /молок|milk|лактоз|lactose|dairy|казеин|casein/i.test(String(a))
  );

  let poolSlots = 0;
  let aiSlots = 0;
  const sanityViolations = [];
  const allergyViolations = [];
  const proteinKeyCounts = {};
  const titleKeyCounts = {};

  (planRows || []).forEach((row) => {
    const meals = row.meals || {};
    MEAL_KEYS.forEach((slotType) => {
      const slot = meals[slotType];
      if (!slot) return;
      const src = slot.plan_source || "pool";
      if (src === "pool") poolSlots++;
      else aiSlots++;

      const title = slot.title || "";
      const recipe = slot.recipe_id ? recipes[slot.recipe_id] : null;
      const combinedText = [title, recipe?.description || "", recipe?._ingredientsText || ""].join(" ");

      const sanity = slotSanityReject(slotType, combinedText);
      if (sanity) {
        sanityViolations.push({ planned_date: row.planned_date, slotType, title, reason: sanity });
      }

      if (hasMilkAllergy && containsDairy(combinedText)) {
        allergyViolations.push({ planned_date: row.planned_date, slotType, title });
      }

      const pk = inferProteinKey(title, recipe?.description);
      if (pk) proteinKeyCounts[pk] = (proteinKeyCounts[pk] || 0) + 1;

      const tk = normalizeTitleKey(title);
      if (tk) titleKeyCounts[tk] = (titleKeyCounts[tk] || 0) + 1;
    });
  });

  const totalSlots = poolSlots + aiSlots;
  const poolFillRate = totalSlots > 0 ? Math.round((poolSlots / totalSlots) * 100) : 0;
  const aiFillRate = totalSlots > 0 ? Math.round((aiSlots / totalSlots) * 100) : 0;

  const topRepeatedProteinKeys = Object.entries(proteinKeyCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, c]) => `${k}:${c}`);

  const topRepeatedTitleKeys = Object.entries(titleKeyCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, c]) => `${k}:${c}`);

  const slotDiagnostics = [];
  (planRows || []).forEach((row) => {
    const meals = row.meals || {};
    MEAL_KEYS.forEach((slotType) => {
      const slot = meals[slotType];
      const recipe = slot?.recipe_id ? recipes[slot.recipe_id] : null;
      slotDiagnostics.push({
        planned_date: row.planned_date,
        slotType,
        pickedSource: slot?.plan_source ?? "empty",
        score: null,
        proteinKey: slot?.title ? inferProteinKey(slot.title, recipe?.description) : null,
        mealTypeNorm: recipe?.meal_type ?? null,
        wasRecoveredFromTitle: false,
      });
    });
  });

  const scores = slotDiagnostics.filter((s) => s.score != null).map((s) => s.score);
  const averageScorePerSlot = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const minScoreSlot = scores.length > 0 ? Math.min(...scores) : null;
  const maxScoreSlot = scores.length > 0 ? Math.max(...scores) : null;

  return {
    poolFillRate,
    aiFillRate,
    poolSlots,
    aiSlots,
    totalSlots,
    sanityViolationsCount: sanityViolations.length,
    sanityViolations,
    allergyViolationsCount: allergyViolations.length,
    allergyViolations,
    topRepeatedProteinKeys,
    topRepeatedTitleKeys,
    proteinKeyCounts,
    averageScorePerSlot,
    minScoreSlot,
    maxScoreSlot,
    recoveredMealTypeCount: 0,
    slotsRecoveredFromTitle: [],
    slotDiagnostics,
  };
}

function printTable(profileLabel, metrics) {
  console.log("\n--- " + profileLabel + " ---");
  console.log("  poolFillRate:        ", metrics.poolFillRate + "%");
  console.log("  aiFillRate:          ", metrics.aiFillRate + "%");
  console.log("  poolSlots / aiSlots: ", metrics.poolSlots + " / " + metrics.aiSlots);
  console.log("  sanityViolationsCount:", metrics.sanityViolationsCount);
  if (metrics.sanityViolations?.length > 0) {
    metrics.sanityViolations.slice(0, 5).forEach((v) => {
      console.log("    -", v.planned_date, v.slotType, v.reason, "|", v.title?.slice(0, 40));
    });
  }
  console.log("  allergyViolationsCount:", metrics.allergyViolationsCount);
  if (metrics.allergyViolations?.length > 0) {
    metrics.allergyViolations.forEach((v) => {
      console.log("    -", v.planned_date, v.slotType, v.title?.slice(0, 40));
    });
  }
  console.log("  topRepeatedProteinKeys:", metrics.topRepeatedProteinKeys.join(", ") || "-");
  console.log("  topRepeatedTitleKeys:  ", metrics.topRepeatedTitleKeys.join(", ") || "-");
  console.log("  averageScorePerSlot:   ", metrics.averageScorePerSlot ?? "n/a");
  console.log("  minScoreSlot:          ", metrics.minScoreSlot ?? "n/a");
  console.log("  maxScoreSlot:          ", metrics.maxScoreSlot ?? "n/a");
  console.log("  recoveredMealTypeCount:", metrics.recoveredMealTypeCount ?? 0);
  console.log("  slotsRecoveredFromTitle:", (metrics.slotsRecoveredFromTitle ?? []).length);
}

async function main() {
  const { members, mode, weeks, debug, token } = parseArgs();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authToken = token || (await getAuthToken());

  if (members.length === 0) {
    console.error("Укажите хотя бы один --member <uuid>");
    process.exit(1);
  }

  const startKey = getRollingStartKey();
  const type = mode;
  const report = {
    runAt: new Date().toISOString(),
    mode,
    weeks,
    debug,
    startKey,
    profiles: [],
  };

  for (const memberId of members) {
    const memberIdOrNull = memberId === "null" || memberId === "family" ? null : memberId;
    if (memberIdOrNull === null) {
      console.warn("member_id=null (family) — укажите конкретный member UUID для теста");
      continue;
    }

    {
      const { data: memberRow } = await supabase
        .from("members")
        .select("user_id, name, age_months, allergies, preferences")
        .eq("id", memberIdOrNull)
        .single();
      if (!memberRow) {
        console.warn("Member not found:", memberIdOrNull, "— пропуск");
        continue;
      }
      memberData = {
        name: memberRow.name,
        age_months: memberRow.age_months,
        allergies: memberRow.allergies || [],
        preferences: memberRow.preferences || [],
      };
      const userId = memberRow.user_id;

      const dayKey = startKey;
      const params = {
        type,
        member_id: memberIdOrNull,
        member_data: memberData,
        debug,
        start_key: startKey,
        ...(type === "day" && { day_key: dayKey }),
      };

      console.log("\nЗапуск генерации:", memberIdOrNull, type, debug ? "(debug)" : "");
      try {
        const result = await runGeneration(authToken, params);
        console.log("  Job result:", result.status);

        const { planRows, recipes } = await fetchPlansAndRecipes(supabase, userId, memberIdOrNull, startKey, type);
        const metrics = computeMetrics(planRows, recipes, memberData.allergies || []);

        const profileLabel = memberRow.name || memberIdOrNull;
        printTable(profileLabel, metrics);

        report.profiles.push({
          member_id: memberIdOrNull,
          member_name: memberRow.name,
          allergies: memberData.allergies,
          runResult: result,
          planRowsCount: planRows.length,
          metrics,
        });
      } catch (err) {
        console.error("  Error:", err.message);
        report.profiles.push({
          member_id: memberIdOrNull,
          member_name: memberRow?.name,
          error: err.message,
        });
      }
    }
  }

  const reportsDir = join(root, "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const reportPath = join(reportsDir, `plan_quality_${dateStr}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\nОтчёт сохранён:", reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
