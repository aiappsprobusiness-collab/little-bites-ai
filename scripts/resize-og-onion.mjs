#!/usr/bin/env node
/**
 * Resize a source image to OG format (1200x630) and save as public/og/og-onion.jpg.
 * Usage: node scripts/resize-og-onion.mjs [path-to-source.png]
 *        If no path given, uses: assets/og-onion-source.png
 */

import { existsSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const W = 1200;
const H = 630;
const outDir = join(root, "public", "og");
const outPath = join(outDir, "og-onion.jpg");
const tempPath = join(outDir, "og-onion-temp.jpg");

async function main() {
  const candidates = process.argv[2]
    ? [process.argv[2]]
    : [
        join(root, "assets", "og-onion-source.png"),
        join(root, "assets", "OG_ONION-30515a14-f7fd-40a2-bb02-ac56335382cd.png"),
        join(root, "public", "og", "og-onion-source.png"),
      ];
  let sourcePath = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      sourcePath = p;
      break;
    }
  }
  if (!sourcePath) {
    console.error("Source image not found. Tried:", candidates.join(", "));
    console.error("Usage: node scripts/resize-og-onion.mjs <path-to-image.png>");
    console.error("Example: node scripts/resize-og-onion.mjs assets/og-onion-source.png");
    process.exit(1);
  }
  console.log("Using source:", sourcePath);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const buffer = await sharp(sourcePath)
    .resize(W, H, { fit: "cover", position: "center" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  writeFileSync(tempPath, buffer);
  renameSync(tempPath, outPath);
  const sizeKB = Math.round(buffer.length / 1024);
  console.log("Written:", outPath, `(${sizeKB} KB, ${W}x${H})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
