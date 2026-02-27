import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Извлечь user_id из JWT (payload.sub) без верификации — только для атрибуции. Не возвращаем 401 при отсутствии/невалидном JWT. */
function getUserIdFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadB64);
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

interface TrackBody {
  feature: string;
  anon_id?: string;
  session_id?: string;
  member_id?: string | null;
  page?: string;
  entry_point?: string;
  utm?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };
  properties?: Record<string, unknown>;
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false }, 500);
    }

    let body: TrackBody;
    try {
      body = (await req.json()) as TrackBody;
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const feature = typeof body.feature === "string" ? body.feature.trim() : "";
    if (!feature) {
      return jsonResponse({ ok: false, error: "feature required" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    const userId = getUserIdFromAuthHeader(authHeader);
    const hasAnonId = typeof body.anon_id === "string" && body.anon_id.trim().length > 0;
    const hasSessionId = typeof body.session_id === "string" && body.session_id.trim().length > 0;
    if (!userId && !hasAnonId && !hasSessionId) {
      return jsonResponse(
        { ok: false, error: "anon_id or session_id required when not authenticated" },
        400
      );
    }

    const utm = body.utm ?? {};
    const properties =
      body.properties != null && typeof body.properties === "object"
        ? body.properties
        : {};

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabaseAdmin.from("usage_events").insert({
      user_id: userId ?? null,
      member_id: body.member_id ?? null,
      feature,
      anon_id: body.anon_id ?? null,
      session_id: body.session_id ?? null,
      page: body.page ?? null,
      entry_point: body.entry_point ?? null,
      utm_source: utm.utm_source ?? null,
      utm_medium: utm.utm_medium ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      utm_content: utm.utm_content ?? null,
      utm_term: utm.utm_term ?? null,
      properties,
    });

    if (error) {
      return jsonResponse({ ok: false }, 200);
    }
    return jsonResponse({ ok: true }, 200);
  } catch {
    return jsonResponse({ ok: false }, 200);
  }
});
