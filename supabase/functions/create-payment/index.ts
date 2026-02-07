import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const TINKOFF_INIT_URL = "https://securepay.tinkoff.ru/v2/Init";

/** Подпись для Tinkoff: значения параметров по алфавиту ключей + Password, SHA-256 hex */
function buildToken(params: Record<string, unknown>, secret: string): string {
  const sortedKeys = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null).sort();
  const concat = sortedKeys.map((k) => String(params[k])).join("") + secret;
  return concat;
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const terminalKey = Deno.env.get("TINKOFF_TERMINAL_KEY");
  const secretKey = Deno.env.get("TINKOFF_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!terminalKey || !secretKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Payment or Supabase configuration missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const userId = body?.userId as string | undefined;
    const plan = body?.plan as string | undefined;
    const email = (body?.email as string) ?? "";

    if (!userId || !plan) {
      return new Response(
        JSON.stringify({ error: "Missing userId or plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (plan !== "month" && plan !== "year") {
      return new Response(
        JSON.stringify({ error: "Invalid plan. Use month or year" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountKopecks = plan === "year" ? 299900 : 29900; // 2999 ₽ / 299 ₽
    const orderId = `sub_${userId}_${Date.now()}`;

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
      return new Response(
        JSON.stringify({ error: "Failed to create subscription record", details: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataObj = email ? { Email: email } : {};
    const initParams: Record<string, unknown> = {
      TerminalKey: terminalKey,
      Amount: amountKopecks,
      OrderId: orderId,
      Description: plan === "year" ? "Mom Recipes Premium (год)" : "Mom Recipes Premium (месяц)",
      Language: "ru",
      ...(Object.keys(dataObj).length > 0 ? { DATA: dataObj } : {}),
    };

    const tokenParams: Record<string, unknown> = { ...initParams };
    if (tokenParams.DATA && typeof tokenParams.DATA === "object") {
      tokenParams.DATA = JSON.stringify(tokenParams.DATA);
    }
    const tokenString = buildToken(tokenParams, secretKey);
    const Token = await sha256Hex(tokenString);
    const payload = { ...initParams, Token };

    const initRes = await fetch(TINKOFF_INIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const initData = await initRes.json();

    if (!initRes.ok || !initData?.PaymentURL) {
      await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", subRow.id);
      return new Response(
        JSON.stringify({ error: "Tinkoff Init failed", details: initData?.Message ?? initData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentId = initData.PaymentId ?? null;
    if (paymentId != null) {
      await supabase.from("subscriptions").update({ payment_id: paymentId }).eq("id", subRow.id);
    }

    return new Response(
      JSON.stringify({ PaymentURL: initData.PaymentURL }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "create-payment error", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
