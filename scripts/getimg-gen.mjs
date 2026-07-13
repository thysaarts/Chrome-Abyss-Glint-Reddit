#!/usr/bin/env node
/**
 * getimg-gen.mjs — DEV-TIME original concept art via the getimg.ai Cloudflare Worker proxy.
 *
 * Generates NEW house-style structures (not the existing stickers) to feed image-to-3D,
 * so the scene gets fresh complex objects — starting with the Gate and Master Core. The
 * getimg API key stays in the Worker; this script only needs the proxy URL (+ optional
 * passphrase), read from ./getimg.key (line 1 = URL, line 2 = passphrase), gitignored.
 *
 * Images land in assets/originals/<id>.webp; review, pick the best, then add the chosen
 * ones to scripts/meshy-gen.mjs as image-to-3D jobs.
 *
 * Usage: node scripts/getimg-gen.mjs [--only gate-a,core-a] [--force] [--list]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "assets/originals");

// ── house style (mirrors src/admin/getimg.ts so originals match the shipped art) ──
const OUTLINE =
  "bold clean BLACK OUTLINES around every shape, crisp even medium-weight ink linework (not too thick), " +
  "flat cel-shaded game illustration matching the reference images";
const STYLE = "crystalline iridescent gemstone surfaces, cyan-to-magenta holographic gradient, glowing edges";
const FRAME =
  "a single centered hero object, full object in frame, 3/4 view, isolated on a dark starfield background, " +
  "clear silhouette, even studio lighting";
const NEG = ". Absolutely no text, words, letters, numbers, logos. No people, no characters, no creatures";
const STYLE_REFS = [
  "https://chrome-abyss-glint.onrender.com/stickers/ember-image.webp",
  "https://chrome-abyss-glint.onrender.com/stickers/asteroid-image.webp",
  "https://chrome-abyss-glint.onrender.com/stickers/asteroids-image.webp",
];

// two seeds per structure so we can pick the stronger read before spending Meshy credits
const JOBS = [
  {
    id: "gate-a",
    seed: 11,
    subject:
      "a monumental ring-shaped space gate, a colossal circular arch built of faceted crystal and dark metal, " +
      "a swirling glowing energy membrane filling the central aperture, ornate alien sci-fi architecture",
  },
  {
    id: "gate-b",
    seed: 47,
    subject:
      "a towering crystalline wormhole gate, two great curved pylons meeting in an arch, " +
      "a luminous portal vortex suspended between them, angular faceted stonework, dark metal fittings",
  },
  {
    id: "core-a",
    seed: 23,
    subject:
      "a radiant master core reactor, a large faceted crystal heart suspended inside an orbiting shell of " +
      "angular crystal shards and thin dark metal rings, intense glowing energy at the center",
  },
  {
    id: "core-b",
    seed: 68,
    subject:
      "a brilliant power core, a floating multifaceted gem nucleus wrapped in a cage of curved crystal blades, " +
      "blazing inner light, concentric halo rings, ornate sci-fi containment structure",
  },
];

const argv = process.argv.slice(2);
const val = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : null);
const force = argv.includes("--force");

if (argv.includes("--list")) {
  for (const j of JOBS) console.log(`  ${j.id.padEnd(8)} ${j.subject.slice(0, 80)}…`);
  process.exit(0);
}

// ── config: getimg.key → line 1 proxy URL, line 2 optional passphrase ──
function config() {
  const p = resolve(ROOT, "getimg.key");
  if (!existsSync(p)) {
    console.error(
      "✗ getimg.key not found in repo root.\n" +
        "  Create it (gitignored) with your Cloudflare Worker proxy URL on line 1,\n" +
        "  and the CMS passphrase on line 2 if you set one:\n\n" +
        "    https://glint-getimg.<you>.workers.dev\n" +
        "    <optional-passphrase>\n"
    );
    process.exit(1);
  }
  const [url, token] = readFileSync(p, "utf8").split(/\r?\n/).map((s) => s.trim());
  if (!url) { console.error("✗ getimg.key: first line must be the proxy URL"); process.exit(1); }
  return { url, token: token || null };
}

async function generate(cfg, job) {
  const body = {
    model: "gemini-3-1-flash-image", // Nano Banana 2 (frontier — no element ids needed)
    prompt: `${job.subject}, ${STYLE}, ${OUTLINE}, ${FRAME}${NEG}`,
    aspect_ratio: "1:1",
    output_format: "webp",
    resolution: "1K",
    seed: job.seed,
    images: STYLE_REFS.map((url) => ({ url, role: "reference_image" })),
  };
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.token ? { "x-cms-token": cfg.token } : {}) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.dataUri) throw new Error(j.error || `proxy error ${res.status}`);
  return j.dataUri;
}

async function main() {
  const cfg = config();
  mkdirSync(OUT, { recursive: true });
  const only = val("--only");
  const ids = only ? new Set(only.split(",").map((s) => s.trim())) : null;
  const jobs = JOBS.filter((j) => !ids || ids.has(j.id));
  console.log(`\n🎨 getimg-gen — ${jobs.length} image(s) → assets/originals/\n`);
  for (const job of jobs) {
    const dest = resolve(OUT, `${job.id}.webp`);
    if (!force && existsSync(dest)) { console.log(`· ${job.id} — exists, skip (--force to redo)`); continue; }
    process.stdout.write(`● ${job.id} … `);
    try {
      const dataUri = await generate(cfg, job);
      const b64 = dataUri.split(",")[1];
      writeFileSync(dest, Buffer.from(b64, "base64"));
      console.log(`✓ saved ${(Buffer.from(b64, "base64").length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`✗ ${e.message}`);
    }
  }
  console.log("\nReview assets/originals/, pick the best, then wire them into meshy-gen.mjs as image jobs.");
}
main().catch((e) => { console.error(e); process.exit(1); });
