/**
 * Создаёт двух тестовых пользователей в Supabase Auth и настраивает профили (free / premium).
 * Запуск: из корня проекта задать SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY, затем:
 *   node scripts/create-test-users.mjs
 * Либо добавить в .env (без VITE_):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
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
  console.error(
    "  SUPABASE_URL можно скопировать из VITE_SUPABASE_URL в .env."
  );
  console.error(
    "  SUPABASE_SERVICE_ROLE_KEY взять в дашборде Supabase: Project Settings → API → service_role (secret)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "0000";
const FREE_USER = {
  email: "testfreeplan@example.com",
  password: PASSWORD,
  displayName: "testfreeplan",
  status: "free",
  dailyLimit: 5,
};
const PREMIUM_USER = {
  email: "testpremiumplan@example.com",
  password: PASSWORD,
  displayName: "testpremiumplan",
  status: "premium",
  dailyLimit: 30,
};

async function main() {
  let freeId = null;
  let premiumId = null;

  for (const u of [FREE_USER, PREMIUM_USER]) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.displayName },
    });
    if (error) {
      if (error.message && error.message.includes("already been registered")) {
        console.log(`Пользователь ${u.email} уже существует, получаем id...`);
        const { data: list } = await supabase.auth.admin.listUsers();
        const existing = list?.users?.find((x) => x.email === u.email);
        if (existing) {
          if (u.status === "free") freeId = existing.id;
          else premiumId = existing.id;
        }
      }
      if (!freeId && u.status === "free") freeId = data?.user?.id;
      if (!premiumId && u.status === "premium") premiumId = data?.user?.id;
      if (error.message && !error.message.includes("already been registered")) {
        console.error(u.email, error);
        process.exit(1);
      }
    } else {
      if (u.status === "free") freeId = data.user.id;
      else premiumId = data.user.id;
      console.log("Создан пользователь:", u.email, data.user.id);
    }
  }

  if (!freeId || !premiumId) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const users = list?.users || [];
    if (!freeId) freeId = users.find((x) => x.email === FREE_USER.email)?.id;
    if (!premiumId)
      premiumId = users.find((x) => x.email === PREMIUM_USER.email)?.id;
  }

  if (!freeId || !premiumId) {
    console.error("Не удалось определить id пользователей.");
    process.exit(1);
  }

  // Обновить subscription_status в profiles для премиума (если колонка есть)
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ subscription_status: "premium" })
    .eq("user_id", premiumId);
  if (profileErr) {
    console.warn("profiles.subscription_status (не критично):", profileErr.message);
  } else {
    console.log("profiles: для премиум-пользователя установлен subscription_status = premium");
  }

  // Вставить или обновить profiles_v2
  for (const [userId, status, dailyLimit] of [
    [freeId, "free", 5],
    [premiumId, "premium", 30],
  ]) {
    const { data: existing } = await supabase
      .from("profiles_v2")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error: upErr } = await supabase
        .from("profiles_v2")
        .update({
          status,
          daily_limit: dailyLimit,
          last_reset: new Date().toISOString(),
          requests_today: 0,
        })
        .eq("user_id", userId);
      if (upErr) {
        console.error("profiles_v2 update", userId, upErr);
        process.exit(1);
      }
      console.log("profiles_v2 обновлён:", userId, status);
    } else {
      const { error: insErr } = await supabase.from("profiles_v2").insert({
        user_id: userId,
        status,
        daily_limit: dailyLimit,
        last_reset: new Date().toISOString(),
        requests_today: 0,
      });
      if (insErr) {
        console.error("profiles_v2 insert", userId, insErr);
        process.exit(1);
      }
      console.log("profiles_v2 создан:", userId, status);
    }
  }

  console.log("\nГотово.");
  console.log("  testfreeplan:   ", FREE_USER.email, " / ", PASSWORD, " — подписка free");
  console.log("  testpremiumplan: ", PREMIUM_USER.email, " / ", PASSWORD, " — подписка premium");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
