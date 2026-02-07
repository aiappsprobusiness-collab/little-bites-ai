import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/** Подпись Tinkoff: значения параметров по алфавиту ключей + Password, SHA-256 hex */
function buildTokenString(params: Record<string, unknown>, secret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "Token" && params[k] !== undefined && params[k] !== null)
    .sort();
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
    const orderId = body.OrderId as string | undefined;
    const receivedToken = body.Token as string | undefined;

    if (!receivedToken) {
      return new Response(JSON.stringify({ error: "Missing Token" }), { status: 400 });
    }

    const tokenString = buildTokenString(body, secretKey);
    const expectedToken = await sha256Hex(tokenString);
    if (receivedToken.toLowerCase() !== expectedToken.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Invalid Token" }), { status: 400 });
    }

    if (status !== "CONFIRMED") {
      return new Response(JSON.stringify({ success: true, message: "Status not CONFIRMED, skip" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const plan = (row.plan as string) || "month";
    const months = plan === "year" ? 12 : 1;
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await supabase
      .from("subscriptions")
      .update({
        status: "confirmed",
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        ...(paymentId != null && { payment_id: paymentId }),
      })
      .eq("id", row.id);

    await supabase
      .from("profiles_v2")
      .update({
        status: "premium",
        premium_until: expiresAt.toISOString(),
      })
      .eq("user_id", row.user_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
