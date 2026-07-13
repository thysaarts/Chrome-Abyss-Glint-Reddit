#!/usr/bin/env node
/**
 * meshy-retexture.mjs — repaint an existing Meshy model's textures from a prompt.
 *
 * Keeps the geometry, regenerates the PBR maps so we can change surfaces / materials /
 * colours (worn metal, black solar panels, gem recolours, lava cracks) AND drop the
 * baked cartoon outlines. Sources each model by its original task id (from
 * scripts/.meshy-state.json). In-place jobs (out === src) overwrite the model so the
 * scene picks up the new look; variant jobs write a new id to add alongside.
 *
 * Usage: node scripts/meshy-retexture.mjs [--only satellite-img,core] [--list]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API = "https://api.meshy.ai/openapi";
const STATE = resolve(__dirname, ".meshy-state.json");
const OUT_DIR = resolve(ROOT, "public/models3d");
const KEY = readFileSync(resolve(ROOT, "meshy.key"), "utf8").trim();

// out = destination model id · src = source model id (its task id is the retexture input)
const JOBS = [
  {
    out: "satellite-img", src: "satellite-img",
    prompt:
      "a worn, used space satellite. Matte BLACK solar-panel wings covered in a grid of dark photovoltaic cells. " +
      "Brushed titanium and steel body with scratches, scuffs, grime and worn paint. A dark tinted reflective glass sensor dome. " +
      "Varied materials — dull metal, glossy black panels, weathered trim, subtle iridescent edges. Aged and battle-worn, NOT new. " +
      "Smooth realistic PBR surfaces, no black cartoon outlines.",
  },
  {
    out: "rocket", src: "rocket",
    prompt:
      "a used space rocket of varied materials: a brushed metal hull with panel seams and rivets, a faceted iridescent crystal nose cone, " +
      "a DARK tinted reflective glass porthole window, scorched and worn lower fuselage near the thrusters. " +
      "Mixed metal, crystal and glass surfaces with wear and scoring. Smooth realistic PBR, no black cartoon outlines.",
  },
  {
    out: "miner", src: "miner",
    prompt:
      "a worn, damaged gem-mining drone. Scratched, dented, battered dark metal body and arms, chipped paint, grime, exposed scuffed alloy, rugged used industrial machinery. " +
      "IMPORTANT: the thruster exhaust nozzles at the bottom emit bright glowing HOT ORANGE AND YELLOW FLAME (glowing incandescent fire, NOT metal); " +
      "the front sensor eye is a bright glowing WHITE-CYAN lens. Subtle iridescent sheen on the metal. Smooth realistic PBR surfaces, no black cartoon outlines.",
  },
  {
    out: "comet", src: "comet",
    prompt:
      "a translucent icy crystal comet — pale blue-white frosted ice and clear glass, subtle rainbow iridescence, smooth glossy frozen surface. " +
      "Reads as ice and glass, not stone. Smooth realistic PBR, no black cartoon outlines.",
  },
  {
    out: "asteroid-gem", src: "asteroid-gem",
    prompt:
      "a dark stone asteroid with an embedded cluster of translucent glass-like GEMSTONES (cyan, green, gold), the crystals glossy, reflective and jewel-clear " +
      "like polished glass, the rock a matte dark basalt. Smooth realistic PBR, no black cartoon outlines.",
  },
  {
    out: "core", src: "core",
    prompt:
      "a radiant crystalline power core with a brilliant GOLDEN-AMBER glowing gem nucleus (warm gold and orange, NOT cyan), " +
      "wrapped in pale iridescent glass-like crystal blades and dark metal rings. Glossy reflective gem, intense warm inner light. " +
      "Smooth realistic PBR, no black cartoon outlines.",
  },
  {
    out: "gate", src: "gate",
    prompt:
      "a crystalline ring gate. The ring frame is dark brushed metal; the gemstones set into the ring are a DIFFERENT warm colour — glossy golden-amber " +
      "glass-like reflective jewels — contrasting the cool portal. The central portal is swirling energy. Smooth realistic PBR, no black cartoon outlines.",
  },
  // ── variants (new ids, added to the scene alongside the originals) ──
  {
    out: "asteroid-ruby", src: "asteroid-gem",
    prompt:
      "a dark stone asteroid with an embedded cluster of glowing RUBY-RED, hot-pink and magenta translucent glass-like gemstones, " +
      "glossy reflective jewel crystals, matte dark basalt rock base. Smooth realistic PBR, no black cartoon outlines.",
  },
  {
    out: "rock-lava", src: "rock-b",
    prompt:
      "a dark charcoal-black volcanic asteroid with glowing molten HOT ORANGE LAVA cracks running through it — bright incandescent orange-yellow magma in the " +
      "fissures, cooled black basalt surface between. Smooth realistic PBR, no black cartoon outlines.",
  },
];

const argv = process.argv.slice(2);
const val = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : null);
if (argv.includes("--list")) { for (const j of JOBS) console.log(`  ${j.out.padEnd(16)} ← ${j.src}`); process.exit(0); }

const state = JSON.parse(readFileSync(STATE, "utf8"));
const retexState = existsSync(resolve(__dirname, ".meshy-retex.json")) ? JSON.parse(readFileSync(resolve(__dirname, ".meshy-retex.json"), "utf8")) : {};
const saveRetex = () => writeFileSync(resolve(__dirname, ".meshy-retex.json"), JSON.stringify(retexState, null, 2));

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return json;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(base, id, label) {
  let last = -1;
  for (;;) {
    const t = await api("GET", `${base}/${id}`);
    if (t.progress !== last) { process.stdout.write(`\r   ${label}: ${t.status} ${t.progress ?? 0}%   `); last = t.progress; }
    if (t.status === "SUCCEEDED") { process.stdout.write("\n"); return t; }
    if (t.status === "FAILED" || t.status === "CANCELED") { process.stdout.write("\n"); throw new Error(`${id} ${t.status}: ${JSON.stringify(t.task_error || {})}`); }
    await sleep(5000);
  }
}
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${url} → ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function retexture(job) {
  const inputTaskId = state[job.src]?.taskId;
  if (!inputTaskId) throw new Error(`no source task id for ${job.src}`);
  const created = await api("POST", "/v1/retexture", {
    input_task_id: inputTaskId,
    text_style_prompt: job.prompt,
    enable_pbr: true,
    enable_original_uv: true,
    ai_model: "meshy-5",
  });
  const id = created.result;
  console.log(`   retexture task ${id}`);
  const done = await poll("/v1/retexture", id, "retexture");
  const dir = resolve(OUT_DIR, job.out);
  mkdirSync(dir, { recursive: true });
  const glb = done.model_urls?.glb;
  if (!glb) throw new Error(`no glb for ${job.out}`);
  await download(glb, resolve(dir, "model.glb"));
  if (done.thumbnail_url) await download(done.thumbnail_url, resolve(dir, "thumb.png"));
  retexState[job.out] = { src: job.src, taskId: id, prompt: job.prompt };
  saveRetex();
}

async function main() {
  const only = val("--only");
  const ids = only ? new Set(only.split(",").map((s) => s.trim())) : null;
  const jobs = JOBS.filter((j) => !ids || ids.has(j.out));
  console.log(`\n🎨 meshy-retexture — ${jobs.length} job(s)\n`);
  for (const job of jobs) {
    console.log(`● ${job.out}  (from ${job.src})`);
    try { await retexture(job); console.log(`   ✓ ${job.out}`); }
    catch (e) { console.error(`   ✗ ${job.out}: ${e.message}`); }
  }
  console.log("\nDone. Optimise (node scripts/opt-models.mjs) then review.");
}
main().catch((e) => { console.error(e); process.exit(1); });
