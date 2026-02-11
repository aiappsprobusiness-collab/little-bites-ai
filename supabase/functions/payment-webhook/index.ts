import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { safeLog, safeError } from "../_shared/safeLogger.ts";

/** Подпись уведомления T-Bank EACQ: все параметры кроме Token и вложенных (Data, Receipt); добавить Password; сортировка по ключу; конкатенация только значений; SHA-256 hex. */
function buildTokenString(params: Record<string, unknown>, secret: string): string {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "Token" || v === undefined || v === null) continue;
    if (typeof v === "object") continue;
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

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const secretKey = Deno.env.get("TINKOFF_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secretKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuration missing" }), { status: 500 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const status = body.Status as string | undefined;
    const paymentId = body.PaymentId as number | undefined;
    const orderId = (body.OrderId ?? body.orderId) as string | undefined;
    const receivedToken = body.Token as string | undefined;

    safeLog("[payment-webhook] received", { Status: status, PaymentId: paymentId, OrderId: orderId, hasToken: !!receivedToken });

    if (!receivedToken) {
      safeLog("[payment-webhook] reject: Missing Token");
      return new Response(JSON.stringify({ error: "Missing Token" }), { status: 400 });
    }

    const tokenString = buildTokenString(body, secretKey);
    const expectedToken = await sha256Hex(tokenString);
    if (receivedToken.toLowerCase() !== expectedToken.toLowerCase()) {
      safeLog("[payment-webhook] reject: Invalid Token (signature mismatch)");
      return new Response(JSON.stringify({ error: "Invalid Token" }), { status: 400 });
    }
    safeLog("[payment-webhook] signature ok");

    if (status !== "CONFIRMED") {
      safeLog("[payment-webhook] skip: status not CONFIRMED", status);
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const byPayment = paymentId
      ? await supabase.from("subscriptions").select("id, user_id, plan, status").eq("payment_id", paymentId).maybeSingle()
      : { data: null };
    const byOrder = orderId
      ? await supabase.from("subscriptions").select("id, user_id, plan, status").eq("order_id", orderId).maybeSingle()
      : { data: null };

    const row = byPayment?.data ?? byOrder?.data;
    if (!row || row.status === "confirmed") {
      safeLog("[payment-webhook] skip: subscription not found or already confirmed", { paymentId, orderId, found: !!row });
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const amountFromNotification = body.Amount != null ? Number(body.Amount) : null;
    const monthKopecks = 29900;
    const yearKopecks = 299000;
    const amountTolerance = 1;

    const dataObj = body.DATA ?? body.Data ?? body.data;
    const dataShape = dataObj && typeof dataObj === "object" ? Object.keys(dataObj as Record<string, unknown>) : [];
    safeLog("[payment-webhook] data_shape", { data_keys: dataShape });

    const dataPlan =
      dataObj && typeof dataObj === "object" && "plan" in (dataObj as Record<string, unknown>)
        ? String((dataObj as Record<string, unknown>).plan)
        : null;

    let plan: "month" | "year" | null = null;
    let sourceOfPlan: "Data" | "OrderId" | "DB" | "Amount" | null = null;

    if (dataPlan === "year" || dataPlan === "month") {
      plan = dataPlan;
      sourceOfPlan = "Data";
    } else if (orderId && /_year_/.test(orderId)) {
      plan = "year";
      sourceOfPlan = "OrderId";
    } else if (orderId && /_month_/.test(orderId)) {
      plan = "month";
      sourceOfPlan = "OrderId";
    } else if ((row.plan as string) === "year" || (row.plan as string) === "month") {
      plan = (row.plan as string) as "month" | "year";
      sourceOfPlan = "DB";
    } else if (
      amountFromNotification !== null &&
      amountFromNotification >= yearKopecks - amountTolerance &&
      amountFromNotification <= yearKopecks + amountTolerance
    ) {
      plan = "year";
      sourceOfPlan = "Amount";
      safeLog("[payment-webhook] source_of_plan=Amount (year)", { amountFromNotification, yearKopecks });
    } else if (
      amountFromNotification !== null &&
      amountFromNotification >= monthKopecks - amountTolerance &&
      amountFromNotification <= monthKopecks + amountTolerance
    ) {
      plan = "month";
      sourceOfPlan = "Amount";
      safeLog("[payment-webhook] source_of_plan=Amount (month)", { amountFromNotification, monthKopecks });
    }

    if (plan !== "month" && plan !== "year") {
      safeLog("[payment-webhook] reject_unknown_plan", { order_id: orderId, payment_id: paymentId, amount: amountFromNotification });
      return new Response(JSON.stringify({ error: "Unknown plan" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    safeLog("[payment-webhook] updating subscription and profile", {
      subscriptionId: row.id,
      userId: row.user_id,
      order_id: orderId,
      payment_id: paymentId,
      status: status,
      plan_detected: plan,
      source_of_plan: sourceOfPlan,
    });

    const rpcResult = await supabase.rpc("confirm_subscription_webhook", {
      p_subscription_id: row.id,
      p_plan: plan,
      p_payment_id: paymentId ?? null,
    });

    type RpcRow = { subscription_id: string; was_updated: boolean; started_at: string | null; expires_at: string | null };
    const rows = (rpcResult.data as RpcRow[] | null) ?? [];
    const res = rows[0] ?? null;
    const err = rpcResult.error;

    if (err || !res) {
      safeError("[payment-webhook] RPC error", { err: err?.message, subscriptionId: row.id });
      return new Response(JSON.stringify({ error: err?.message ?? "Confirm failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!res.was_updated) {
      // Не пишем audit при replay: одна запись на факт подтверждения, без дублей.
      safeLog("[payment-webhook] idempotent: already confirmed", { subscriptionId: row.id });
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    safeLog("[payment-webhook] subscription updated", {
      started_at: res.started_at,
      expires_at: res.expires_at,
      plan,
      calc_method: "DB_interval",
    });

    const auditNote = sourceOfPlan === "Amount" ? "fallback amount ±1" : null;
    await supabase.from("subscription_plan_audit").insert({
      user_id: row.user_id,
      subscription_id: row.id,
      order_id: orderId ?? null,
      payment_id: paymentId != null ? String(paymentId) : null,
      tbank_status: status ?? null,
      amount: amountFromNotification != null ? Math.round(amountFromNotification) : null,
      plan_detected: plan,
      source_of_plan: sourceOfPlan,
      data_keys: dataShape.length > 0 ? dataShape : null,
      raw_order_id_hint: null,
      note: auditNote,
    });

    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    safeError("[payment-webhook] error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
