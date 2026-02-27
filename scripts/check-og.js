/**
 * Диагностика: проверка доступа к view public.recipes_og_preview через anon key
 * (так же, как Netlify Edge).
 *
 * Запуск из корня проекта:
 *   node scripts/check-og.js
 * (подгружает .env и .env.local; нужны SUPABASE_URL и SUPABASE_ANON_KEY или VITE_SUPABASE_*)
 *
 * Или с явными переменными:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/check-og.js
 *
 * Windows PowerShell:
 *   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_ANON_KEY="eyJ..."; node scripts/check-og.js
 *
 * Никаких service role ключей. Только для диагностики.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
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
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Ошибка: нужны переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.");
  console.error("Пример: SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/check-og.js");
  process.exit(1);
}

const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/recipes_og_preview?select=id,title,og_description,og_image_url&limit=3`;

(async () => {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const body = await res.text();
    let json = body;
    try {
      json = JSON.parse(body);
    } catch (_) {}
    console.log("HTTP status:", res.status, res.statusText);
    console.log("Response (full):", typeof json === "object" ? JSON.stringify(json, null, 2) : body);
  } catch (e) {
    console.error("Request failed:", e.message);
    process.exit(1);
  }
})();
