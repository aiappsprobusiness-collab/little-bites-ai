import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleInboundEvent } from "./orchestrate.ts";
import { createPreviewProvider } from "./preview.ts";
import { createSessionStore } from "./sessionStore.ts";
import { createTelegramClient } from "./telegramApi.ts";
import { parseUpdate, updateToInboundEvent } from "./validate.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
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
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const gotSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && expectedSecret !== gotSecret) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const appBaseUrl = Deno.env.get("APP_BASE_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !appBaseUrl || !supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "missing_env" }, 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const parsed = parseUpdate(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.message }, 400);
  const inbound = updateToInboundEvent(parsed.update);
  if (!inbound) return json({ ok: true, skipped: true }, 200);

  const telegram = createTelegramClient(botToken);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const store = createSessionStore(supabase);
  const previewProvider = createPreviewProvider(supabase);

  try {
    await handleInboundEvent(inbound, {
      store,
      telegram,
      appBaseUrl,
      previewProvider,
      activeCallbackQueryId: inbound.kind === "callback" ? inbound.callback_query_id : null,
    });
    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return json({ ok: false, error: "processing_failed", detail: message }, 500);
  }
});
