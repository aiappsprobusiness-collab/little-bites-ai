/**
 * VK funnel: anonymous day plan preview (DB-first, optional AI, mock fallback).
 * Thin entrypoint — см. domain/*.ts
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertBodySizeOk, validateRequestBody } from "./validate.ts";
import { buildVkPreviewDayPlan } from "./orchestrate.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const size = assertBodySizeOk(req.headers.get("content-length"));
  if (!size.ok) {
    return json({ ok: false, error: size.message }, 400);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const validated = validateRequestBody(raw);
  if (!validated.ok) {
    return json({ ok: false, error: validated.message }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const dayPlan = await buildVkPreviewDayPlan(supabase, validated.body);
    return json({ ok: true, day_plan: dayPlan }, 200);
  } catch {
    return json({ ok: false, error: "Preview failed" }, 500);
  }
});
