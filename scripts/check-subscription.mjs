/**
 * Проверка подписки пользователя в БД: subscriptions и profiles_v2.
 * Запуск: из корня проекта (нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env или окружении):
 *   node scripts/check-subscription.mjs [user_id]
 * Пример:
 *   node scripts/check-subscription.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0
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

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (в .env или в окружении)."
  );
  process.exit(1);
}

const userId = process.argv[2] || "54fcca8d-607f-4146-a340-cef9e2d293b0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Проверка подписки для user_id:", userId);
  console.log("---");

  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan, status, order_id, payment_id, started_at, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (subErr) {
    console.error("Ошибка запроса subscriptions:", subErr.message);
    process.exit(1);
  }

  console.log("Таблица subscriptions:");
  if (!subs?.length) {
    console.log("  Записей не найдено.");
  } else {
    subs.forEach((s, i) => {
      console.log(`  [${i + 1}] id=${s.id}`);
      console.log(`      plan=${s.plan}, status=${s.status}, order_id=${s.order_id}, payment_id=${s.payment_id}`);
      console.log(`      started_at=${s.started_at ?? "—"}, expires_at=${s.expires_at ?? "—"}`);
      console.log(`      created_at=${s.created_at}`);
    });
  }

  console.log("---");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles_v2")
    .select("id, user_id, status, daily_limit, premium_until, last_reset, requests_today")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileErr) {
    console.error("Ошибка запроса profiles_v2:", profileErr.message);
    process.exit(1);
  }

  console.log("Таблица profiles_v2:");
  if (!profile) {
    console.log("  Профиль не найден.");
  } else {
    console.log("  status:", profile.status);
    console.log("  daily_limit:", profile.daily_limit);
    console.log("  premium_until:", profile.premium_until ?? "—");
    console.log("  last_reset:", profile.last_reset);
    console.log("  requests_today:", profile.requests_today ?? "—");
  }

  console.log("---");
  const hasConfirmed = subs?.some((s) => s.status === "confirmed");
  const isPremium = profile?.status === "premium";
  if (hasConfirmed && isPremium) {
    console.log("Итог: оплата в БД зафиксирована, статус обновлён на premium.");
  } else if (subs?.length && !hasConfirmed) {
    console.log("Итог: запись подписки есть, но status не 'confirmed' (ожидание webhook от Т-Банка или оплата не завершена).");
  } else if (!subs?.length) {
    console.log("Итог: записей в subscriptions для этого user_id нет.");
  } else {
    console.log("Итог: в profiles_v2 status не premium. Проверьте webhook или обновите вручную.");
  }
}

main();
