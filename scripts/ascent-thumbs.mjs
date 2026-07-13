#!/usr/bin/env node
/**
 * ascent-thumbs.mjs — render the Ascent decor thumbnails IN SITU.
 *
 * Loads demo.html?thumb=<element> (see src/demo/ThumbApp.tsx) for every scene
 * element, screenshots the framed view headlessly, centre-crops to a square and
 * writes public/ascent-thumbs/<key>.webp — the images the CMS, Shop and
 * Settings show for each element. Requires the dev server on :5173.
 *
 * Usage: node scripts/ascent-thumbs.mjs [--only master-core,nebula] [--size 512]
 */
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "public/ascent-thumbs");

// key ↔ scene element name (must match defaultScene() names + the atmosphere layers)
export const ELEMENTS = [
  ["master-core", "Master Core"],
  ["homeworld", "Homeworld"],
  ["drift", "Drift"],
  ["wanderer", "Wanderer"],
  ["voyager", "Voyager"],
  ["waystation", "Waystation"],
  ["drift-ii", "Drift II"],
  ["emberrock", "Emberrock"],
  ["prospector", "Prospector"],
  ["ember-world", "Ember World"],
  ["the-gate", "The Gate"],
  ["moon", "Moon"],
  ["lodestone", "Lodestone"],
  ["rubylode", "Rubylode"],
  ["ascender", "Ascender"],
  ["pebble", "Pebble"],
  ["the-beacon", "The Beacon"],
  ["ringworld", "Ringworld"],
  ["nebula", "Nebula"],
  ["stars", "Stars"],
  ["dust", "Dust"],
  ["comets", "Comets"],
  ["galaxy-glow", "Galaxy glow"],
  ["gold-embers", "Gold Embers"],
  ["stardust-rain", "Stardust Rain"],
  ["aurora-veil", "Aurora Veil"],
  ["solar-shafts", "Solar Shafts"],
  ["crimson-drift", "Crimson Drift"],
  ["emerald-abyss", "Emerald Abyss"],
];

const argv = process.argv.slice(2);
const val = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : null);
const only = val("--only");
const size = Number(val("--size") ?? 512);
const ids = only ? new Set(only.split(",").map((s) => s.trim())) : null;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("  pageerror:", e.message));

  for (const [key, name] of ELEMENTS) {
    if (ids && !ids.has(key)) continue;
    process.stdout.write(`● ${key.padEnd(14)} `);
    try {
      await page.goto(`http://localhost:5173/demo.html?thumb=${encodeURIComponent(name)}`, { waitUntil: "networkidle" });
      // let the camera settle + GLBs load; comets need their first pass in-frame
      await page.waitForTimeout(key === "comets" ? 3200 : 5000);
      const png = await page.screenshot({ type: "png" });
      await sharp(png)
        .extract({ left: 130, top: 130, width: 640, height: 640 }) // centre crop
        .resize(size, size)
        .webp({ quality: 82 })
        .toFile(resolve(OUT, `${key}.webp`));
      console.log("✓");
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }
  await browser.close();
  console.log(`\nDone → public/ascent-thumbs/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
