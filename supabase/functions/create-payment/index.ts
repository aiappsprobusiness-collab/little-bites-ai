import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import pricing from "./pricing.json" with { type: "json" };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const TINKOFF_INIT_URL = "https://securepay.tinkoff.ru/v2/Init";

/**
 * Подпись запроса (Token) по документации Т-Банка:
 * https://developer.tbank.ru/eacq/intro/developer/token
 *
 * 1. Только параметры корневого объекта (DATA, Receipt не участвуют).
 * 2. Добавляется пара Password = секрет из ЛК.
 * 3. Сортировка по ключу по алфавиту.
 * 4. Конкатенация только значений в одну строку.
 * 5. SHA-256 от строки (UTF-8) → hex.
 */
function buildToken(params: Record<string, unknown>, secret: string): string {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") continue; // DATA, Receipt не участвуют
    flat[k] = String(v);
  }
  flat.Password = secret;
  const sortedKeys = Object.keys(flat).sort();
  return sortedKeys.map((k) => flat[k]).join("");
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const terminalKey = Deno.env.get("TINKOFF_TERMINAL_KEY")?.trim() ?? "";
    const secretKey = Deno.env.get("TINKOFF_SECRET_KEY")?.trim() ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!terminalKey || !secretKey || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Payment or Supabase configuration missing" },
        500
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const userId = body?.userId as string | undefined;
    const plan = body?.plan as string | undefined;
    const email = (body?.email as string) ?? "";
    const baseUrl = Deno.env.get("PAYMENT_BASE_URL")?.trim() || "";
    let successUrl = (body?.successUrl as string)?.trim() || Deno.env.get("PAYMENT_SUCCESS_URL") || "";
    let failUrl = (body?.failUrl as string)?.trim() || Deno.env.get("PAYMENT_FAIL_URL") || "";

    if (!successUrl || !failUrl) {
      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "").replace(/\/$/, "") || "";
      if (origin) {
        successUrl = successUrl || `${origin}/payment/success`;
        failUrl = failUrl || `${origin}/payment/fail`;
      }
    }
    if (successUrl.startsWith("/")) successUrl = (baseUrl || "https://momrecipes.app").replace(/\/$/, "") + successUrl;
    if (failUrl.startsWith("/")) failUrl = (baseUrl || "https://momrecipes.app").replace(/\/$/, "") + failUrl;

    if (!userId || !plan) {
      return jsonResponse({ error: "Missing userId or plan", code: "MISSING_PARAMS" }, 400);
    }

    if (plan !== "month" && plan !== "year") {
      return jsonResponse({ error: "Invalid plan. Use month or year", code: "INVALID_PLAN" }, 400);
    }

    if (!successUrl || !failUrl) {
      return jsonResponse(
        { error: "SuccessURL and FailURL are required. Pass successUrl and failUrl in the request body, or set PAYMENT_SUCCESS_URL and PAYMENT_FAIL_URL in Edge Function secrets.", code: "MISSING_URLS" },
        400
      );
    }

    const amountKopecks = plan === "year" ? pricing.yearRub * 100 : pricing.monthRub * 100;
    const ts = Date.now().toString(36);
    const prefix = userId.replace(/-/g, "").slice(0, 12);
    const orderId = `${prefix}_${plan}_${ts}`.slice(0, 36);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: subRow, error: insertErr } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan,
        status: "pending",
        order_id: orderId,
      })
      .select("id")
      .single();

    if (insertErr) {
      return jsonResponse(
        { error: "Failed to create subscription record", details: insertErr.message },
        500
      );
    }

    const notificationUrl =
      Deno.env.get("PAYMENT_NOTIFICATION_URL")?.trim() ||
      (Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") + "/functions/v1/payment-webhook");

    const initParams: Record<string, unknown> = {
      TerminalKey: terminalKey,
      Amount: amountKopecks,
      OrderId: orderId,
      Description: plan === "year" ? "Mom Recipes Premium (год)" : "Mom Recipes Premium (месяц)",
      Language: "ru",
      SuccessURL: successUrl,
      FailURL: failUrl,
      NotificationURL: notificationUrl,
      DATA: { plan },
    };

    const Token = await sha256Hex(buildToken(initParams, secretKey));
    const payload: Record<string, unknown> = { ...initParams, Token };
    console.log("[create-payment] Init payload (no Token)", {
      TerminalKey: initParams.TerminalKey,
      Amount: initParams.Amount,
      OrderId: initParams.OrderId,
      SuccessURL: initParams.SuccessURL,
      FailURL: initParams.FailURL,
      NotificationURL: initParams.NotificationURL,
    });

    let initRes: Response;
    try {
      initRes = await fetch(TINKOFF_INIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", subRow.id);
      return jsonResponse(
        { error: "Tinkoff request failed", details: String(fetchErr) },
        200
      );
    }

    const rawTinkoff = await initRes.text();
    let initData: Record<string, unknown>;
    try {
      initData = JSON.parse(rawTinkoff) as Record<string, unknown>;
    } catch {
      await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", subRow.id);
      return jsonResponse(
        { error: "Tinkoff returned invalid JSON", details: rawTinkoff.slice(0, 500) },
        200
      );
    }

    if (!initRes.ok || !initData?.PaymentURL) {
      await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", subRow.id);
      return jsonResponse(
        {
          error: "Tinkoff Init failed",
          details: initData?.Message ?? initData?.Details ?? initData,
        },
        200
      );
    }

    const paymentId = initData.PaymentId ?? null;
    if (paymentId != null) {
      await supabase.from("subscriptions").update({ payment_id: paymentId }).eq("id", subRow.id);
    }

    return jsonResponse({ PaymentURL: initData.PaymentURL }, 200);
  } catch (e) {
    return jsonResponse(
      { error: "create-payment error", details: String(e) },
      500
    );
  }
});
