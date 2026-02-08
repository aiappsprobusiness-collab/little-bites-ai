/**
 * Ручное подтверждение подписки (если оплата прошла, но webhook от Т-Банка не сработал).
 * Обновляет одну запись в subscriptions → status=confirmed, started_at, expires_at
 * и profiles_v2 → status=premium, premium_until.
 *
 * Запуск (из корня проекта, нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env):
 *   node scripts/confirm-subscription-manual.mjs <user_id> [subscription_id]
 * Если subscription_id не указан — подтверждается последняя по времени запись со status=pending.
 *
 * Пример:
 *   node scripts/confirm-subscription-manual.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0
 *   node scripts/confirm-subscription-manual.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0 3fe0a65e-eba8-4c06-8e5c-1b42fe5dead1
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (в .env или в окружении).");
  process.exit(1);
}

const userId = process.argv[2];
const subscriptionId = process.argv[3];

if (!userId) {
  console.error("Использование: node scripts/confirm-subscription-manual.mjs <user_id> [subscription_id]");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let row;
  if (subscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan, status")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("Ошибка запроса:", error.message);
      process.exit(1);
    }
    row = data;
  } else {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan, status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Ошибка запроса:", error.message);
      process.exit(1);
    }
    row = data;
  }

  if (!row) {
    console.error("Подходящая подписка не найдена (pending для user_id или указанный subscription_id).");
    process.exit(1);
  }

  if (row.status === "confirmed") {
    console.log("Подписка уже подтверждена:", row.id);
    process.exit(0);
  }

  const now = new Date();
  const plan = row.plan || "month";
  const months = plan === "year" ? 12 : 1;
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const { error: updSubErr } = await supabase
    .from("subscriptions")
    .update({
      status: "confirmed",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", row.id);

  if (updSubErr) {
    console.error("Ошибка обновления subscriptions:", updSubErr.message);
    process.exit(1);
  }

  const { error: updProfErr } = await supabase.from("profiles_v2").upsert(
    {
      user_id: row.user_id,
      status: "premium",
      premium_until: expiresAt.toISOString(),
      daily_limit: 30,
      last_reset: now.toISOString(),
      requests_today: 0,
    },
    { onConflict: "user_id" }
  );

  if (updProfErr) {
    console.error("Ошибка обновления profiles_v2:", updProfErr.message);
    process.exit(1);
  }

  console.log("Готово. Подписка подтверждена вручную:");
  console.log("  subscription id:", row.id);
  console.log("  user_id:", row.user_id);
  console.log("  plan:", plan);
  console.log("  premium_until:", expiresAt.toISOString());
  console.log("  profiles_v2: status=premium, premium_until обновлён.");
}

main();
