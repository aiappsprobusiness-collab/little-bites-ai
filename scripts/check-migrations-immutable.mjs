#!/usr/bin/env node
/**
 * Защита от изменения старых миграций.
 * Файлы в supabase/migrations считаются неизменяемыми после попадания в main.
 * Разрешены: новые файлы (A) и изменения только в самом новом миграционном файле.
 */

import { execSync } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = 'supabase/migrations';
const MIGRATION_PREFIX_RE = /^(\d{14})_/;

function runGit(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf-8' }).trim();
  } catch (e) {
    // Нет origin/main или не git — не блокируем (например, клонирование без remote)
    if (e.stderr && /origin\/main|fatal/.test(e.stderr)) return '';
    throw e;
  }
}

function getChangedMigrations() {
  const added = runGit('diff --name-only --diff-filter=A origin/main...HEAD')
    .split('\n')
    .filter(Boolean);
  const modified = runGit('diff --name-only --diff-filter=M origin/main...HEAD')
    .split('\n')
    .filter(Boolean);

  const isMigration = (p) =>
    p.startsWith(`${MIGRATIONS_DIR}/`) && p.endsWith('.sql');
  return {
    added: added.filter(isMigration),
    modified: modified.filter(isMigration),
  };
}

function getNewestMigrationPath() {
  if (!existsSync(MIGRATIONS_DIR)) return null;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  let maxTs = '';
  let newestName = null;
  for (const f of files) {
    const m = f.match(MIGRATION_PREFIX_RE);
    if (m && m[1] > maxTs) {
      maxTs = m[1];
      newestName = f;
    }
  }
  return newestName ? `${MIGRATIONS_DIR}/${newestName}` : null;
}

const { added, modified } = getChangedMigrations();

// Новые файлы всегда разрешены
// Изменённые — только если это один файл и он самый новый
if (modified.length === 0) {
  process.exit(0);
}

const newestPath = getNewestMigrationPath();
const allowedModified = newestPath ? [newestPath] : [];
const forbidden = modified.filter((p) => !allowedModified.includes(p));

if (forbidden.length > 0) {
  console.error(
    'error: изменены старые миграции (после main они неизменяемы). Разрешено менять только самый новый файл.'
  );
  console.error('Запрещённые изменения:');
  forbidden.forEach((p) => console.error('  -', p));
  process.exit(1);
}

process.exit(0);
