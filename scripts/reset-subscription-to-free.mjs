/**
 * Сброс статуса подписки пользователя на free (для тестов оплаты).
 * Меняет только profiles_v2: status=free, premium_until=null, daily_limit=5.
 * Записи в subscriptions не трогает — история оплат сохраняется.
 *
 * Запуск (из корня проекта, нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env):
 *   node scripts/reset-subscription-to-free.mjs <user_id> [user_id2 ...]
 *
 * Примеры:
 *   node scripts/reset-subscription-to-free.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0
 *   node scripts/reset-subscription-to-free.mjs 54fcca8d-607f-4146-a340-cef9e2d293b0 другой-uuid
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

const userIds = process.argv.slice(2).filter(Boolean);
if (!userIds.length) {
  console.error("Использование: node scripts/reset-subscription-to-free.mjs <user_id> [user_id2 ...]");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  for (const userId of userIds) {
    const { data, error } = await supabase
      .from("profiles_v2")
      .update({
        status: "free",
        premium_until: null,
        daily_limit: 5,
      })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();

    if (error) {
      console.error(`Ошибка для ${userId}:`, error.message);
      continue;
    }
    if (data) {
      console.log(`OK: ${userId} → status=free, premium_until=null, daily_limit=5`);
    } else {
      console.log(`Пропуск: ${userId} — запись в profiles_v2 не найдена`);
    }
  }
}

main();
