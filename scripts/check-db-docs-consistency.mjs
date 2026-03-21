/**
 * Сравнивает список таблиц public.* в PostgreSQL (information_schema)
 * с разделами ### `public.*` в docs/database/DATABASE_SCHEMA.md.
 *
 * Требует в .env прямой URI к БД (не anon/service REST):
 *   DATABASE_URL  или  SUPABASE_DB_URL
 * (Supabase Dashboard → Project Settings → Database → Connection string → URI)
 *
 * npm run check:db-docs
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SCHEMA_PATH = join(root, "docs", "database", "DATABASE_SCHEMA.md");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
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

loadEnvFile(join(root, ".env"));
loadEnvFile(join(root, ".env.local"));

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

function extractDocTables(markdown) {
  const names = new Set();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("### ")) continue;
    const re = /`public\.([^`]+)`/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      names.add(m[1].trim());
    }
  }
  return names;
}

async function fetchDbTables(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return new Set(rows.map((r) => r.table_name));
  } finally {
    await client.end();
  }
}

function sorted(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

function main() {
  if (!DATABASE_URL) {
    console.error(
      "check-db-docs: задайте DATABASE_URL или SUPABASE_DB_URL (URI Postgres из Supabase Dashboard → Database)."
    );
    process.exit(2);
  }
  if (!existsSync(SCHEMA_PATH)) {
    console.error("check-db-docs: не найден файл", SCHEMA_PATH);
    process.exit(2);
  }

  const md = readFileSync(SCHEMA_PATH, "utf8");
  const docTables = extractDocTables(md);

  fetchDbTables(DATABASE_URL)
    .then((dbTables) => {
      const missingInDocs = sorted(
        [...dbTables].filter((t) => !docTables.has(t))
      );
      const missingInDb = sorted(
        [...docTables].filter((t) => !dbTables.has(t))
      );

      console.log("DB ↔ docs/database/DATABASE_SCHEMA.md (public, BASE TABLE)\n");

      if (missingInDocs.length) {
        console.log("missing in docs (есть в БД, нет в доке):");
        console.table(missingInDocs.map((table) => ({ table })));
      } else {
        console.log("missing in docs: (none)");
      }

      if (missingInDb.length) {
        console.log("missing in DB (есть в доке, нет в БД):");
        console.table(missingInDb.map((table) => ({ table })));
      } else {
        console.log("missing in DB: (none)");
      }

      if (missingInDocs.length || missingInDb.length) {
        console.error(
          "\ncheck-db-docs: рассинхрон — обновите DATABASE_SCHEMA.md или миграции."
        );
        process.exit(1);
      }

      console.log("\ncheck-db-docs: OK");
      process.exit(0);
    })
    .catch((err) => {
      console.error("check-db-docs: ошибка подключения или запроса:", err.message);
      process.exit(2);
    });
}

main();
