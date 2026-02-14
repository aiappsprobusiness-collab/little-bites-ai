#!/usr/bin/env node
/**
 * Generate PNG/ICO app icons from a single PNG source for PWA, Apple touch, Android, iOS.
 * Source: public/icon-source.png (recommended 512×512 or larger).
 *
 * Generates:
 *   - public/icon-192.png, icon-512.png, icon-512-maskable.png (PWA / manifest / Apple)
 *   - public/favicon.ico
 *   - assets/icon.png 1024×1024 (for @capacitor/assets → Android/iOS)
 *
 * Usage: node scripts/generate-png-icons.mjs
 * Run before build or via: npm run generate:icons
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'public');
const assetsDir = join(rootDir, 'assets');

const THEME_TEAL = '#5eb89a';
const SOURCE_NAME = 'icon-source.png';
const SOURCE_PATH = join(publicDir, SOURCE_NAME);

async function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(`Source icon not found: ${SOURCE_PATH}`);
    console.error(`Place your app icon (512×512 or 1024×1024 PNG) as ${SOURCE_NAME} in public/ and run again.`);
    process.exit(1);
  }

  const sourceBuffer = readFileSync(SOURCE_PATH);
  const source = sharp(sourceBuffer);
  const { width: srcW, height: srcH } = await source.metadata();

  console.log(`Using source: ${SOURCE_NAME} (${srcW}x${srcH})`);

  // —— PWA: 192, 512 ——
  for (const size of [192, 512]) {
    const path = join(publicDir, `icon-${size}.png`);
    const buf = await source.clone().resize(size, size).png().toBuffer();
    writeFileSync(path, buf);
    console.log(`Generated icon-${size}.png`);
  }

  // —— PWA: maskable (safe zone 80% — content centered on 512) ——
  const size = 512;
  const safeSize = Math.round(size * 0.8);
  const padded = await source
    .clone()
    .resize(safeSize, safeSize)
    .png()
    .toBuffer();
  const maskable = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: THEME_TEAL,
    },
  })
    .composite([{ input: padded, left: (size - safeSize) / 2, top: (size - safeSize) / 2 }])
    .png()
    .toBuffer();
  writeFileSync(join(publicDir, 'icon-512-maskable.png'), maskable);
  console.log('Generated icon-512-maskable.png');

  // —— Favicon.ico (16, 32) ——
  const favicon16 = await source.clone().resize(16, 16).png().toBuffer();
  const favicon32 = await source.clone().resize(32, 32).png().toBuffer();
  const ico = await toIco([favicon16, favicon32]);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
  console.log('Generated favicon.ico');

  // —— Capacitor: 1024 for @capacitor/assets (Android / iOS) ——
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  const icon1024 = await source.clone().resize(1024, 1024).png().toBuffer();
  writeFileSync(join(assetsDir, 'icon.png'), icon1024);
  console.log('Generated assets/icon.png (1024×1024 for Capacitor)');

  console.log('Done. For native icons run: npx @capacitor/assets generate');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
