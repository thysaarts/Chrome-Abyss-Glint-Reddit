#!/usr/bin/env node
/**
 * meshy-gen.mjs — DEV-TIME 3D asset pipeline for the Glint "3D Studio" demo.
 *
 * Turns a job list (text prompts and/or the hand-drawn stickers in assets/) into
 * textured .glb models via the Meshy.ai REST API, downloads them into
 * public/models3d/<job-id>/, and writes a manifest the renderer can consume.
 *
 * SECURITY: the API key lives ONLY in ./meshy.key (gitignored). This script is
 * run by hand from a dev machine — nothing here ships in the web bundle, and the
 * key is never printed. Generated binaries stay out of git until a batch is
 * approved (see .gitignore) so we don't commit rejected experiments.
 *
 * Usage:
 *   node scripts/meshy-gen.mjs                 # run every job (skips already-done)
 *   node scripts/meshy-gen.mjs --only a,b      # run only these job ids
 *   node scripts/meshy-gen.mjs --list          # print the job catalog and exit
 *   node scripts/meshy-gen.mjs --redo a        # forget state for job(s), regenerate
 *   node scripts/meshy-gen.mjs --dry           # show what would run, spend nothing
 *
 * Resumable: task ids + statuses are cached in scripts/.meshy-state.json, so a
 * re-run never re-submits (and never re-spends credits) for a finished job.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API = "https://api.meshy.ai/openapi";
const STATE_PATH = resolve(__dirname, ".meshy-state.json");
const OUT_DIR = resolve(ROOT, "public/models3d");

// ── shared style so every asset reads as one family ─────────────────────────
// The game is cel-shaded, iridescent, crystalline — dark outlines, cyan→magenta
// holographic gradients, glowing edges. We steer Meshy hard toward that look.
const STYLE =
  "stylized crystalline game asset, faceted iridescent gemstone surfaces, " +
  "holographic cyan-to-magenta gradient, glowing edges, clean low-poly topology, " +
  "cel-shaded, dramatic rim light, isolated object, dark space background";
const NEG = "blurry, noisy, extra objects, text, watermark, realistic photo, dull, muddy colors";

/**
 * THE CATALOG. Each job → one .glb. `kind` is the placeholder kind it can later
 * replace in the renderer. `method` picks text-to-3d (invent) vs image-to-3d
 * (reconstruct a sticker). Keep ids stable — they're folder + manifest keys.
 */
const JOBS = [
  // ── VALIDATION BATCH (the satellite, both ways, + the hero asteroid) ──────
  {
    id: "satellite-img",
    kind: "station",
    method: "image",
    image: "assets/sticker_024.png",
    note: "sticker_024 reconstructed — crystalline satellite w/ dish + panels",
  },
  {
    id: "satellite-txt",
    kind: "station",
    method: "text",
    prompt:
      "a sleek crystalline communications satellite: a parabolic dish antenna, " +
      "two rectangular solar-panel wings, a slender antenna mast with a gem tip, " +
      "faceted iridescent body, " + STYLE,
    note: "invented equivalent of sticker_024 — compare quality vs image-to-3d",
  },
  {
    id: "asteroid-gem",
    kind: "asteroid",
    method: "image",
    image: "assets/sticker_003.png",
    note: "sticker_003 — dark rock with an embedded rainbow crystal cluster",
  },

  // ── FULL SET (queued behind approval; --only runs a subset) ───────────────
  { id: "comet", kind: "crystal", method: "image", image: "assets/sticker_001.png", note: "iridescent gem-comet", hold: true },
  { id: "rocket", kind: "station", method: "image", image: "assets/sticker_011.png", note: "crystal rocket", hold: true },
  { id: "miner", kind: "station", method: "image", image: "assets/sticker_016.png", note: "gem-miner drone", hold: true },
  { id: "beacon", kind: "station", method: "image", image: "assets/sticker_029.png", note: "crystal beacon buoy", hold: true },
  { id: "voyager", kind: "station", method: "image", image: "assets/sticker_012.png", note: "crystal starfighter / voyager", hold: true },
  {
    id: "planet-home",
    kind: "planet",
    method: "text",
    prompt: "a serene crystalline gas-giant planet, banded atmosphere, faint glowing ring, " + STYLE,
    hold: true,
  },
  {
    id: "gate",
    kind: "gate",
    method: "image",
    image: "assets/originals/gate-a.webp",
    note: "getimg original → crystalline ring-gate w/ portal vortex",
    hold: true,
  },
  {
    id: "core",
    kind: "core",
    method: "image",
    image: "assets/originals/core-b.webp",
    note: "getimg original → faceted core nucleus in a crystal-blade cage",
    hold: true,
  },

  // ── TEXT-TO-3D ROCKS (smooth & eroded — NOT the faceted procedural ones) ──
  {
    id: "rock-a",
    kind: "asteroid",
    method: "text",
    prompt:
      "a large weathered asteroid, rounded and heavily cratered, smooth eroded natural rock surface, dark basalt grey stone " +
      "with faint violet mineral veins and a few tiny embedded glowing crystal flecks, organic irregular shape, " +
      "stylized game asset, subtle iridescent sheen, soft rim light, isolated object, smooth high-poly, NOT faceted, NOT low-poly",
    texture_prompt: "dark grey basalt rock, cratered, faint violet mineral veins, subtle iridescent sheen, matte",
    hold: true,
  },
  {
    id: "rock-b",
    kind: "asteroid",
    method: "text",
    prompt:
      "a very dark charcoal-black basalt asteroid, deep grey-black volcanic stone, heavily pitted and cratered, " +
      "smooth worn surface with rounded edges, glowing teal cracks running through the dark rock, no sharp facets, " +
      "dark moody stylized game asset, strong rim light on a near-black rock, isolated object, smooth high-poly",
    texture_prompt: "very dark charcoal-black basalt rock, near black, glowing teal cracks, matte, deeply cratered",
    hold: true,
  },
  {
    id: "rock-c",
    kind: "asteroid",
    method: "text",
    prompt:
      "a small drifting meteoroid, smooth potato-shaped stone with soft shallow craters, muted grey-brown rock " +
      "with a faint pink crystalline glimmer, rounded natural erosion, no facets, " +
      "stylized game asset, soft rim light, isolated object, smooth surface",
    texture_prompt: "muted grey-brown rock, soft craters, faint pink crystalline glimmer, matte",
    hold: true,
  },
];

// ── tiny arg parser ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};
const DRY = has("--dry");

// ── state ────────────────────────────────────────────────────────────────────
const loadState = () => (existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {});
const saveState = (s) => writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));

// ── auth ──────────────────────────────────────────────────────────────────────
function key() {
  const p = resolve(ROOT, "meshy.key");
  if (!existsSync(p)) {
    console.error("✗ meshy.key not found in repo root. Create it with your Meshy API key (gitignored).");
    process.exit(1);
  }
  return readFileSync(p, "utf8").trim();
}
const KEY = key();

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a task to a terminal state, printing a live progress line. */
async function poll(base, id, label) {
  let last = -1;
  for (;;) {
    const t = await api("GET", `${base}/${id}`);
    const status = t.status;
    if (t.progress !== last) {
      process.stdout.write(`\r   ${label}: ${status} ${t.progress ?? 0}%   `);
      last = t.progress;
    }
    if (status === "SUCCEEDED") {
      process.stdout.write("\n");
      return t;
    }
    if (status === "FAILED" || status === "CANCELED") {
      process.stdout.write("\n");
      throw new Error(`task ${id} ${status}: ${t.task_error?.message || JSON.stringify(t.task_error || {})}`);
    }
    await sleep(5000);
  }
}

// ── generators ────────────────────────────────────────────────────────────────
async function runText(job) {
  // stage 1: cheap preview (geometry only)
  const preview = await api("POST", "/v2/text-to-3d", {
    mode: "preview",
    prompt: job.prompt,
    negative_prompt: NEG,
    art_style: "realistic",
    should_remesh: true,
    topology: "triangle",
    target_polycount: 30000,
    symmetry_mode: "auto",
  });
  const previewId = preview.result;
  console.log(`   preview task ${previewId}`);
  await poll("/v2/text-to-3d", previewId, "preview");

  // stage 2: refine (adds PBR textures)
  const refine = await api("POST", "/v2/text-to-3d", {
    mode: "refine",
    preview_task_id: previewId,
    enable_pbr: true,
    texture_prompt: job.texture_prompt || STYLE,
  });
  const refineId = refine.result;
  console.log(`   refine task ${refineId}`);
  const done = await poll("/v2/text-to-3d", refineId, "refine");
  return { taskId: refineId, previewId, task: done };
}

function imageDataUri(relPath) {
  const p = resolve(ROOT, relPath);
  const b64 = readFileSync(p).toString("base64");
  const ext = extname(p).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${mime};base64,${b64}`;
}

async function runImage(job) {
  const created = await api("POST", "/v1/image-to-3d", {
    image_url: imageDataUri(job.image),
    enable_pbr: true,
    should_remesh: true,
    should_texture: true,
    topology: "triangle",
    target_polycount: 30000,
    symmetry_mode: "auto",
  });
  const id = created.result;
  console.log(`   image-to-3d task ${id}`);
  const done = await poll("/v1/image-to-3d", id, "image→3d");
  return { taskId: id, task: done };
}

// ── download ──────────────────────────────────────────────────────────────────
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${url} → ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function fetchArtifacts(job, task) {
  const dir = resolve(OUT_DIR, job.id);
  mkdirSync(dir, { recursive: true });
  const glb = task.model_urls?.glb;
  if (!glb) throw new Error(`no glb in task result for ${job.id}`);
  await download(glb, resolve(dir, "model.glb"));
  if (task.thumbnail_url) await download(task.thumbnail_url, resolve(dir, "thumb.png"));
  return { glb: `models3d/${job.id}/model.glb`, thumb: task.thumbnail_url ? `models3d/${job.id}/thumb.png` : null };
}

// ── manifest ──────────────────────────────────────────────────────────────────
function writeManifest(state) {
  const entries = Object.entries(state)
    .filter(([, v]) => v.status === "done" && v.assets)
    .map(([id, v]) => ({ id, kind: v.kind, method: v.method, note: v.note, ...v.assets }));
  const manifestPath = resolve(OUT_DIR, "manifest.json");
  mkdirSync(OUT_DIR, { recursive: true });
  writeManifest.data = { version: 1, models: entries };
  writeFileSync(manifestPath, JSON.stringify(writeManifest.data, null, 2));
  console.log(`\n📄 manifest → public/models3d/manifest.json (${entries.length} models)`);
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (has("--list")) {
    console.log("Job catalog:\n");
    for (const j of JOBS) console.log(`  ${j.hold ? "· " : "▶ "}${j.id.padEnd(16)} ${j.method.padEnd(6)} ${j.kind.padEnd(9)} ${j.note || ""}`);
    console.log("\n▶ = validation batch (runs by default), · = held behind approval (run with --only)");
    return;
  }

  const state = loadState();

  const redo = val("--redo");
  if (redo) redo.split(",").forEach((id) => delete state[id.trim()]);

  const only = val("--only");
  let selected;
  if (only) {
    const ids = new Set(only.split(",").map((s) => s.trim()));
    selected = JOBS.filter((j) => ids.has(j.id));
  } else {
    // default: the validation batch (everything not held)
    selected = JOBS.filter((j) => !j.hold);
  }

  console.log(`\n🛰  meshy-gen — ${selected.length} job(s)${DRY ? " (DRY RUN)" : ""}\n`);

  for (const job of selected) {
    const prev = state[job.id];
    if (prev?.status === "done") {
      console.log(`✓ ${job.id} — already done (${prev.assets?.glb}), skipping. Use --redo ${job.id} to regenerate.`);
      continue;
    }
    console.log(`\n● ${job.id}  [${job.method} → ${job.kind}]  ${job.note || ""}`);
    if (DRY) {
      console.log(job.method === "text" ? `   would text-to-3d: "${job.prompt.slice(0, 90)}…"` : `   would image-to-3d: ${job.image}`);
      continue;
    }
    try {
      const r = job.method === "text" ? await runText(job) : await runImage(job);
      const assets = await fetchArtifacts(job, r.task);
      state[job.id] = { status: "done", kind: job.kind, method: job.method, note: job.note, taskId: r.taskId, assets };
      saveState(state);
      console.log(`   ✓ saved → public/${assets.glb}`);
    } catch (e) {
      console.error(`   ✗ ${job.id} failed: ${e.message}`);
      state[job.id] = { status: "error", error: String(e.message).slice(0, 300) };
      saveState(state);
    }
  }

  writeManifest(state);
  console.log("\nDone. Open the demo and swap placeholders once you're happy with the look.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
