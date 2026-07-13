#!/usr/bin/env node
/**
 * opt-models.mjs — compress every generated model.glb into a web-ready model.opt.glb.
 *
 * Meshy GLBs land at 10–17 MB (4K PBR maps + dense geometry). We quantize geometry
 * (KHR_mesh_quantization — decoded natively by three.js, so NO runtime decoder) and
 * recompress textures to 1K webp. Typical result: ~1–2 MB, ~90% smaller. The scene
 * and gallery load model.opt.glb; the raw model.glb is kept as the re-optimise source.
 *
 * Usage: node scripts/opt-models.mjs [--size 1024] [--force]
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIR = resolve(ROOT, "public/models3d");
const argv = process.argv.slice(2);
const size = argv.includes("--size") ? argv[argv.indexOf("--size") + 1] : "1024";
const force = argv.includes("--force");

if (!existsSync(DIR)) {
  console.error("no public/models3d — generate models first");
  process.exit(1);
}

const ids = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(DIR, d.name, "model.glb")))
  .map((d) => d.name);

console.log(`optimising ${ids.length} model(s) → ${size}px webp, quantized geometry\n`);

for (const id of ids) {
  const raw = resolve(DIR, id, "model.glb");
  const opt = resolve(DIR, id, "model.opt.glb");
  if (!force && existsSync(opt) && statSync(opt).mtimeMs >= statSync(raw).mtimeMs) {
    console.log(`· ${id} — up to date, skip`);
    continue;
  }
  const before = statSync(raw).size;
  try {
    execFileSync(
      "npx",
      ["gltf-transform", "optimize", raw, opt, "--compress", "quantize", "--texture-compress", "webp", "--texture-size", size, "--simplify", "false"],
      { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] }
    );
    const after = statSync(opt).size;
    console.log(`✓ ${id.padEnd(16)} ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(2)}MB`);
  } catch (e) {
    console.error(`✗ ${id} failed: ${String(e.stderr || e.message).slice(0, 200)}`);
  }
}

// point the manifest at the optimised files (fall back to raw if an opt is missing)
const manifestPath = resolve(DIR, "manifest.json");
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const entry of m.models || []) {
    const opt = resolve(DIR, entry.id, "model.opt.glb");
    entry.glb = existsSync(opt) ? `models3d/${entry.id}/model.opt.glb` : `models3d/${entry.id}/model.glb`;
  }
  writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  console.log(`\n📄 manifest updated → optimised paths`);
}
