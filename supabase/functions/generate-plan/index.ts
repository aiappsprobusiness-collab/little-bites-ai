/**
 * Edge Function: fire-and-forget plan generation (day or week).
 * action=start: create job, return 202 + job_id. Client then calls action=run (fire-and-forget) and polls job.
 * action=run: run generation for job_id, update plan_generation_jobs and meal_plans_v2.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { safeError, safeLog, safeWarn } from "../_shared/safeLogger.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;

function getTodayKey(): string {
  const t = new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
}

function getRolling7Dates(startKey: string): string[] {
  const [y, m, d] = startKey.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(start);
    d2.setDate(d2.getDate() + i);
    out.push(d2.getFullYear() + "-" + String(d2.getMonth() + 1).padStart(2, "0") + "-" + String(d2.getDate()).padStart(2, "0"));
  }
  return out;
}

function getDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  return dayNames[date.getDay()];
}

function extractFirstJsonObject(str: string): string | null {
  const start = str.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

function extractChefAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.chefAdvice ?? obj.chef_advice ?? obj.chefAdviceText;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function extractAdvice(obj: Record<string, unknown>): string | undefined {
  const val = obj.advice;
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

// ——— Pool-first: same logic as client recipePool ———
function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
function containsAnyToken(haystack: string, tokens: string[]): boolean {
  if (!haystack || tokens.length === 0) return false;
  const h = (haystack ?? "").toLowerCase();
  for (const t of tokens) {
    if (t.length >= 2 && h.includes(t)) return true;
  }
  return false;
}
type MemberDataPool = { allergies?: string[]; preferences?: string[]; age_months?: number };
function getAllergyTokens(memberData: MemberDataPool | null | undefined): string[] {
  if (!memberData?.allergies?.length) return [];
  const tokens = new Set<string>();
  for (const a of memberData.allergies) {
    for (const t of tokenize(String(a))) tokens.add(t);
  }
  return [...tokens];
}
function getPreferenceExcludeTokens(memberData: MemberDataPool | null | undefined): string[] {
  const prefs = memberData?.preferences;
  if (!prefs?.length) return [];
  const str = prefs.join(" ");
  const tokens = new Set<string>();
  const re1 = /не\s+любит\s+([^\.,;!?]+)/gi;
  const re2 = /без\s+([^\.,;!?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  while ((m = re2.exec(str))) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  return [...tokens];
}
const AGE_RESTRICTED_TOKENS = ["остр", "кофе", "гриб"];
type RecipeRowPool = { id: string; title: string; tags: string[] | null; description: string | null; meal_type?: string | null };
function passesProfileFilter(recipe: RecipeRowPool, memberData: MemberDataPool | null | undefined): { pass: boolean; reason?: string } {
  const allergyTokens = getAllergyTokens(memberData);
  if (allergyTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, allergyTokens)) return { pass: false, reason: "allergy" };
  }
  const prefTokens = getPreferenceExcludeTokens(memberData);
  if (prefTokens.length > 0) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, prefTokens)) return { pass: false, reason: "preference" };
  }
  const ageMonths = memberData?.age_months;
  if (ageMonths != null && ageMonths < 36) {
    const text = [recipe.title, recipe.description ?? "", (recipe.tags ?? []).join(" ")].join(" ");
    if (containsAnyToken(text, AGE_RESTRICTED_TOKENS)) return { pass: false, reason: "age" };
  }
  return { pass: true };
}

async function pickFromPool(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  mealType: string,
  memberData: MemberDataPool | null,
  excludeRecipeIds: string[],
  excludeTitleKeys: string[],
  limitCandidates: number
): Promise<{ id: string; title: string } | null> {
  const excludeSet = new Set(excludeRecipeIds);
  const excludeTitleSet = new Set(excludeTitleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean));

  let q = supabase
    .from("recipes")
    .select("id, title, tags, description, meal_type")
    .eq("user_id", userId)
    .in("source", ["seed", "manual", "week_ai"])
    .order("created_at", { ascending: false })
    .limit(limitCandidates);

  q = q.or(`meal_type.eq.${mealType},meal_type.is.null`);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.or(`member_id.eq.${memberId},member_id.is.null`);

  if (excludeRecipeIds.length > 0 && excludeRecipeIds.length < 50) {
    q = q.not("id", "in", `(${excludeRecipeIds.join(",")})`);
  }

  const { data: rows, error } = await q;
  if (error) {
    safeWarn("generate-plan pool query error", mealType, error.message);
    return null;
  }

  const rawCandidates = (rows ?? []) as RecipeRowPool[];
  const candidatesFromDb = rawCandidates.length;
  let filtered = rawCandidates;

  if (excludeSet.size > 0) filtered = filtered.filter((r) => !excludeSet.has(r.id));
  filtered = filtered.filter((r) => !excludeTitleSet.has(normalizeTitleKey(r.title)));
  filtered = filtered.filter((r) => {
    if (r.meal_type) return r.meal_type === mealType;
    const tags = (r.tags ?? []) as string[];
    return tags.some((t) => t === `chat_${mealType}` || t === mealType);
  });
  filtered = filtered.filter((r) => passesProfileFilter(r, memberData).pass);
  const afterFiltersCount = filtered.length;

  if (filtered.length === 0) {
    safeLog("[POOL DEBUG]", {
      mealType,
      memberId,
      candidatesFromDb,
      afterFiltersCount: 0,
      pickedSource: "ai",
      pickedRecipeId: null,
      rejectReason: candidatesFromDb === 0 ? "no_candidates" : "all_filtered_out",
    });
    return null;
  }

  const topN = Math.min(15, filtered.length);
  const fromTop = filtered.slice(0, topN);
  const picked = fromTop[Math.floor(Math.random() * fromTop.length)];
  safeLog("[POOL DEBUG]", {
    mealType,
    memberId,
    candidatesFromDb,
    afterFiltersCount,
    pickedSource: "db",
    pickedRecipeId: picked.id,
    rejectReason: undefined,
  });
  return { id: picked.id, title: picked.title };
}

interface SingleDayMeal {
  name?: string;
  ingredients?: Array<{ name?: string; amount?: string }> | string[];
  steps?: string[];
  cooking_time?: number;
  chefAdvice?: string;
  advice?: string;
}
interface SingleDayResponse {
  breakfast?: SingleDayMeal;
  lunch?: SingleDayMeal;
  snack?: SingleDayMeal;
  dinner?: SingleDayMeal;
}

serve(async (req) => {
  // CORS preflight: must return 2xx and CORS headers so browser allows the actual request
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_config_or_auth" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as {
      action?: "start" | "run";
      job_id?: string;
      type?: "day" | "week";
      member_id?: string | null;
      member_data?: { name?: string; age_months?: number; allergies?: string[]; preferences?: string[] };
      day_key?: string;
      start_key?: string;
      end_key?: string;
    };
    const action = body.action === "run" ? "run" : "start";
    const type = body.type === "day" || body.type === "week" ? body.type : "day";
    const memberId = body.member_id ?? null;
    const memberData = body.member_data ?? null;

    const startKey = type === "week" ? (body.start_key ?? getRolling7Dates(getTodayKey())[0]) : null;
    const dayKeys = type === "day" && body.day_key
      ? [body.day_key]
      : type === "week" && startKey
        ? getRolling7Dates(startKey)
        : [];

    if (dayKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: "missing_day_key_or_start_key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "start") {
      const existing = await supabase
        .from("plan_generation_jobs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("member_id", memberId)
        .eq("type", type)
        .eq("status", "running")
        .maybeSingle();
      if (existing.data?.id) {
        return new Response(
          JSON.stringify({ job_id: existing.data.id, status: "running" }),
          { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: job, error: jobInsertError } = await supabase
        .from("plan_generation_jobs")
        .insert({
          user_id: userId,
          member_id: memberId,
          type,
          status: "running",
          progress_total: dayKeys.length,
          progress_done: 0,
        })
        .select("id")
        .single();
      if (jobInsertError || !job?.id) {
        safeError("generate-plan job insert", jobInsertError?.message);
        return new Response(
          JSON.stringify({ error: "job_insert_failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ job_id: job.id, status: "running" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "run": require job_id, verify ownership, then run generation
    const runJobId = typeof body.job_id === "string" ? body.job_id : null;
    if (!runJobId) {
      return new Response(
        JSON.stringify({ error: "job_id_required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: runJob, error: runJobErr } = await supabase
      .from("plan_generation_jobs")
      .select("id, user_id, status")
      .eq("id", runJobId)
      .single();
    if (runJobErr || !runJob || runJob.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (runJob.status !== "running") {
      return new Response(
        JSON.stringify({ job_id: runJobId, status: runJob.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = runJobId;
    const deepseekUrl = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/deepseek-chat";
    let weekContext: string[] = [];
    let lastDayKey: string | null = null;

    const memberDataPool: MemberDataPool | null = memberData
      ? { allergies: memberData.allergies ?? [], preferences: memberData.preferences ?? [], age_months: memberData.age_months }
      : null;

    let usedRecipeIds: string[] = [];
    let usedTitleKeys: string[] = [];
    if (dayKeys.length > 0) {
      let weekQ = supabase
        .from("meal_plans_v2")
        .select("planned_date, meals")
        .eq("user_id", userId)
        .gte("planned_date", dayKeys[0])
        .lte("planned_date", dayKeys[dayKeys.length - 1]);
      if (memberId == null) weekQ = weekQ.is("member_id", null);
      else weekQ = weekQ.eq("member_id", memberId);
      const { data: weekRows } = await weekQ;
      (weekRows ?? []).forEach((row: { planned_date?: string; meals?: Record<string, { recipe_id?: string; title?: string }> }) => {
        const meals = row.meals ?? {};
        MEAL_KEYS.forEach((k) => {
          const slot = meals[k];
          if (slot?.recipe_id) usedRecipeIds.push(slot.recipe_id);
          if (slot?.title) usedTitleKeys.push(normalizeTitleKey(slot.title));
        });
      });
    }

    for (let i = 0; i < dayKeys.length; i++) {
      const dayKey = dayKeys[i];
      const dayName = getDayName(dayKey);
      lastDayKey = dayKey;

      await supabase
        .from("plan_generation_jobs")
        .update({ progress_done: i, last_day_key: dayKey, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      const poolPicks: Record<string, { id: string; title: string } | null> = {};
      for (const mealKey of MEAL_KEYS) {
        const picked = await pickFromPool(
          supabase,
          userId,
          memberId,
          mealKey,
          memberDataPool,
          usedRecipeIds,
          usedTitleKeys,
          60
        );
        poolPicks[mealKey] = picked ?? null;
        if (picked) {
          usedRecipeIds.push(picked.id);
          usedTitleKeys.push(normalizeTitleKey(picked.title));
        }
      }

      const res = await fetch(deepseekUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          type: "single_day",
          stream: false,
          dayName,
          memberData,
          weekContext: weekContext.length ? weekContext.join(", ") : "Пока ничего не запланировано.",
          messages: [{ role: "user", content: `Составь план питания на ${dayName}. Укажи завтрак, обед, полдник и ужин в формате JSON.` }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        safeWarn("generate-plan deepseek error", res.status, errText);
        await supabase
          .from("plan_generation_jobs")
          .update({ status: "error", error_text: errText.slice(0, 500), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", jobId);
        return new Response(
          JSON.stringify({ job_id: jobId, status: "error", error: errText.slice(0, 200) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const data = await res.json();
      const raw = data?.message ?? "";
      const jsonStr = extractFirstJsonObject(raw);
      if (!jsonStr) {
        await supabase
          .from("plan_generation_jobs")
          .update({ status: "error", error_text: "parse_failed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", jobId);
        return new Response(
          JSON.stringify({ job_id: jobId, status: "error" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const parsed = JSON.parse(jsonStr) as SingleDayResponse;

      let dayDbCount = 0;
      let dayAiCount = 0;
      const existingRow = await supabase
        .from("meal_plans_v2")
        .select("id, meals")
        .eq("user_id", userId)
        .eq("planned_date", dayKey)
        .is("member_id", memberId)
        .maybeSingle();
      const currentMeals = (existingRow.data as { meals?: Record<string, { recipe_id?: string; title?: string; plan_source?: "pool" | "ai" }> } | null)?.meals ?? {};
      const newMeals = { ...currentMeals };

      for (const mealKey of MEAL_KEYS) {
        const fromPool = poolPicks[mealKey];
        if (fromPool) {
          newMeals[mealKey] = { recipe_id: fromPool.id, title: fromPool.title, plan_source: "pool" };
          dayDbCount++;
          weekContext.push(fromPool.title);
          continue;
        }
        const meal = parsed[mealKey];
        if (!meal?.name || !Array.isArray(meal.ingredients)) continue;
        const ingredients = meal.ingredients.map((ing) =>
          typeof ing === "string" ? { name: ing.trim(), amount: "" } : { name: (ing.name ?? "").trim(), amount: (ing.amount ?? "").trim() }
        );
        const steps = (meal.steps ?? []).filter(Boolean).map((s) => String(s));
        while (steps.length < 3) steps.push(`Шаг ${steps.length + 1}`);
        while (ingredients.length < 3) ingredients.push({ name: `Ингредиент ${ingredients.length + 1}`, amount: "" });
        const chefAdvice = extractChefAdvice(meal as Record<string, unknown>);
        const adviceVal = extractAdvice(meal as Record<string, unknown>);
        const payload = {
          user_id: userId,
          member_id: memberId,
          child_id: memberId,
          source: "week_ai",
          title: meal.name,
          description: "",
          cooking_time_minutes: meal.cooking_time ?? null,
          chef_advice: chefAdvice ?? null,
          advice: adviceVal ?? null,
          steps: steps.slice(0, 7).map((instruction, idx) => ({ instruction, step_number: idx + 1 })),
          ingredients: ingredients.slice(0, 20).map((ing, idx) => ({
            name: ing.name,
            display_text: ing.amount ? `${ing.name} — ${ing.amount}` : ing.name,
            amount: null,
            unit: null,
            order_index: idx,
            category: "other",
          })),
        };
        const { data: recipeId, error: rpcErr } = await supabase.rpc("create_recipe_with_steps", { payload });
        if (rpcErr) {
          safeError("generate-plan create_recipe", rpcErr.message);
          await supabase
            .from("plan_generation_jobs")
            .update({ status: "error", error_text: rpcErr.message.slice(0, 500), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", jobId);
          return new Response(
            JSON.stringify({ job_id: jobId, status: "error" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        newMeals[mealKey] = { recipe_id: recipeId, title: meal.name, plan_source: "ai" };
        dayAiCount++;
        usedRecipeIds.push(recipeId);
        usedTitleKeys.push(normalizeTitleKey(meal.name));
        weekContext.push(meal.name);
      }

      safeLog("[POOL DEBUG] day summary", { dayKey, dbCount: dayDbCount, aiCount: dayAiCount });

      if (existingRow.data?.id) {
        await supabase.from("meal_plans_v2").update({ meals: newMeals, updated_at: new Date().toISOString() }).eq("id", existingRow.data.id);
      } else {
        await supabase.from("meal_plans_v2").insert({
          user_id: userId,
          member_id: memberId,
          planned_date: dayKey,
          meals: newMeals,
        });
      }
    }

    await supabase
      .from("plan_generation_jobs")
      .update({
        status: "done",
        progress_done: dayKeys.length,
        last_day_key: lastDayKey,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({ job_id: jobId, status: "done" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    safeError("generate-plan", e instanceof Error ? e.message : String(e));
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
