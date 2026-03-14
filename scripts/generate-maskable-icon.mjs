#!/usr/bin/env node
/**
 * Генерирует maskable-иконку с safe zone (80%) для Android PWA.
 * Источник: public/icons/mom-recipes-app-icon-1024.png (или -512.png).
 * Результат: public/icons/mom-recipes-app-icon-512-maskable.png
 *
 * Запуск: node scripts/generate-maskable-icon.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const iconsDir = join(rootDir, 'public', 'icons');

const OUT_SIZE = 512;
const SAFE_ZONE_RATIO = 0.8; // 80% — контент в центре
const BG_COLOR = '#E8F1EC'; // фон бренда

const SOURCE_1024 = join(iconsDir, 'mom-recipes-app-icon-1024.png');
const SOURCE_512 = join(iconsDir, 'mom-recipes-app-icon-512.png');
const OUT_PATH = join(iconsDir, 'mom-recipes-app-icon-512-maskable.png');

async function main() {
  const sourcePath = existsSync(SOURCE_1024) ? SOURCE_1024 : existsSync(SOURCE_512) ? SOURCE_512 : null;
  if (!sourcePath) {
    console.error('Source not found. Place mom-recipes-app-icon-1024.png or mom-recipes-app-icon-512.png in public/icons/');
    process.exit(1);
  }

  const sourceBuffer = readFileSync(sourcePath);
  const safeSize = Math.round(OUT_SIZE * SAFE_ZONE_RATIO);
  const padded = await sharp(sourceBuffer)
    .resize(safeSize, safeSize)
    .png()
    .toBuffer();

  const maskable = await sharp({
    create: {
      width: OUT_SIZE,
      height: OUT_SIZE,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: padded, left: (OUT_SIZE - safeSize) / 2, top: (OUT_SIZE - safeSize) / 2 }])
    .png()
    .toBuffer();

  writeFileSync(OUT_PATH, maskable);
  console.log('Generated public/icons/mom-recipes-app-icon-512-maskable.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
