#!/usr/bin/env node
/**
 * Generate PNG app icons from SVG sources for PWA, Apple touch, and manifest.
 * Required: icon-192.svg and icon-512.svg in public/ (same viewBox dimensions).
 *
 * Usage: node scripts/generate-png-icons.mjs
 * Run before build or via: npm run generate:icons
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const sizes = [
  { name: 'icon-192', width: 192, height: 192 },
  { name: 'icon-512', width: 512, height: 512 },
];

async function main() {
  for (const { name, width, height } of sizes) {
    const svgPath = join(publicDir, `${name}.svg`);
    const pngPath = join(publicDir, `${name}.png`);
    try {
      const svg = readFileSync(svgPath);
      const png = await sharp(svg)
        .resize(width, height)
        .png()
        .toBuffer();
      writeFileSync(pngPath, png);
      console.log(`Generated ${name}.png (${width}x${height})`);
    } catch (err) {
      console.error(`Failed to generate ${name}.png:`, err.message);
      process.exit(1);
    }
  }
}

main();
