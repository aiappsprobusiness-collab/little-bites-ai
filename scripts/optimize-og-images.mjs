#!/usr/bin/env node
/**
 * Convert public/og/*.png to JPG 1200x630, optimize to <350KB.
 * Usage: node scripts/optimize-og-images.mjs
 */

import { readdirSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ogDir = join(__dirname, "..", "public", "og");
const MAX_KB = 350;
const W = 1200;
const H = 630;

async function optimizeOne(name) {
  const pngPath = join(ogDir, `${name}.png`);
  const jpgPath = join(ogDir, `${name}.jpg`);
  if (!existsSync(pngPath)) {
    console.warn("Skip (no PNG):", pngPath);
    return;
  }
  let quality = 82;
  let buffer;
  let sizeKB;
  do {
    buffer = await sharp(pngPath)
      .resize(W, H, { fit: "cover", position: "center" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    sizeKB = Math.round(buffer.length / 1024);
    if (sizeKB > MAX_KB && quality > 40) quality -= 8;
    else break;
  } while (quality > 40);

  const { writeFileSync } = await import("fs");
  writeFileSync(jpgPath, buffer);
  console.log(`${name}.jpg: ${sizeKB} KB (quality ${quality})`);
  try {
    unlinkSync(pngPath);
  } catch (_) {}
}

async function main() {
  const names = ["og-brain", "og-onion", "og-panic"];
  for (const name of names) {
    await optimizeOne(name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
