/**
 * SAVE MERGE — combine two `glint.*` localStorage snapshots (this device's and
 * the account's server copy) so cross-device play never loses ground. Ported
 * from the web build's importSave.ts; here it powers saveSync's hydrate (the
 * server snapshot used to replace local state wholesale — last-write-wins —
 * which let a stale device wipe fresher progress).
 *
 * Both builds share the exact same `glint.*` keys + formats (same lineage), so
 * a merge needs no format translation. Policy is "never lose ground".
 *
 *  - progress (frontier)  → max, clamped to THIS build's level count
 *  - results (per level)  → best score kept, cleared OR'd; out-of-range levels dropped
 *  - scores (top 10)      → best 10 across both
 *  - wallet (Nebulite)    → max (no double-count / not farmable)
 *  - stats (lifetime)     → per field: numbers max, booleans OR
 *  - collection (grants)  → union of owned ids per kind
 *  - tutorial done        → OR
 *  - academy tips seen    → adopt if the device has none
 *
 * Everything NOT listed (settings, CMS drafts, debug, daily state, generator seed…)
 * is left as the device's current value — never imported.
 *
 * `mergeSave` is PURE (snapshot in, snapshot out) so it's fully unit-tested;
 * `applyMergedSnapshot` is the only part that touches localStorage.
 */
import { SAVE_NUMBERING_V } from "../levels/renumber";

export type SaveSnapshot = Record<string, string>;

interface LevelResult { best: number; cleared: boolean }

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** localStorage values are versioned envelopes `{v,d}` (writeVersioned); pre-seam
 *  saves are the bare value at v0. */
interface Env { v: number; d: unknown }
function parseEnv(s: string | undefined): Env | null {
  if (!s) return null;
  try {
    const p = JSON.parse(s) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p) && "v" in p && "d" in p) {
      return { v: num((p as Record<string, unknown>).v), d: (p as Record<string, unknown>).d };
    }
    return { v: 0, d: p };
  } catch {
    return null;
  }
}
const wrapEnv = (v: number, d: unknown): string => JSON.stringify({ v, d });

/** Merge one key: nothing incoming → skip; nothing local → adopt wholesale; else
 *  combine the two payloads with `fn`, keeping the higher envelope version.
 *  `norm` (level-numbered keys) upgrades OLD-numbered payloads (env v < the
 *  renumbering version) before comparing/adopting, and restamps the result —
 *  cloud saves and Reddit exports written before the 2026-07 split stay honest. */
function mergeKey(
  out: SaveSnapshot, current: SaveSnapshot, incoming: SaveSnapshot, key: string,
  fn: (a: unknown, b: unknown) => unknown, norm?: (e: Env) => unknown,
): void {
  const b = parseEnv(incoming[key]);
  if (!b) return;
  const a = parseEnv(current[key]);
  if (!a) {
    out[key] = norm ? wrapEnv(Math.max(b.v, SAVE_NUMBERING_V), norm(b)) : incoming[key];
    return;
  }
  const v = norm ? Math.max(a.v, b.v, SAVE_NUMBERING_V) : Math.max(a.v, b.v);
  out[key] = wrapEnv(v, fn(norm ? norm(a) : a.d, norm ? norm(b) : b.d));
}

function mergeResults(a: unknown, b: unknown, levelCount: number): Record<string, LevelResult> {
  const A = obj(a), B = obj(b);
  const out: Record<string, LevelResult> = {};
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 0 || n >= levelCount) continue; // drop out-of-range levels
    const ra = obj(A[key]), rb = obj(B[key]);
    out[key] = { best: Math.max(num(ra.best), num(rb.best)), cleared: !!(ra.cleared || rb.cleared) };
  }
  return out;
}

// REDDIT ADAPTATION: the web build remaps v<2 payloads here (its v1 saves hold
// PRE-renumbering level numbers). THIS build was born after the renumbering —
// its v1 saves already hold new numbers — so the norms only stamp the envelope
// up, never remap (see levels/progress.ts for the same ruling).
const normFrontier = (e: Env): unknown => e.d;
const normResults = (e: Env): unknown => e.d;

// mirrors TOP_SCORES in levels/progress.ts — duplicated rather than imported so
// this module stays free of the save-touching modules it merges snapshots for
const TOP_SCORES = 10;

function mergeScores(a: unknown, b: unknown): { score: number; level: string }[] {
  const rows = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .filter((s): s is { score: number; level: string } => !!s && typeof (s as { score?: unknown }).score === "number");
  const seen = new Set<string>();
  return rows
    .sort((x, y) => y.score - x.score)
    .filter((s) => { const k = `${s.score}|${s.level}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, TOP_SCORES);
}

function mergeStats(a: unknown, b: unknown): Record<string, unknown> {
  const A = obj(a), B = obj(b);
  const out: Record<string, unknown> = { ...A };
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const va = A[k], vb = B[k];
    if (typeof va === "boolean" || typeof vb === "boolean") out[k] = !!va || !!vb;
    else if (typeof va === "number" || typeof vb === "number") out[k] = Math.max(num(va), num(vb));
    else out[k] = va ?? vb;
  }
  return out;
}

function mergeGrants(a: unknown, b: unknown): Record<string, string[]> {
  const A = obj(a), B = obj(b);
  const out: Record<string, string[]> = {};
  for (const kind of ["themes", "music", "stickers", "decor"]) {
    const merged = [...(Array.isArray(A[kind]) ? (A[kind] as unknown[]) : []), ...(Array.isArray(B[kind]) ? (B[kind] as unknown[]) : [])]
      .filter((x): x is string => typeof x === "string");
    out[kind] = [...new Set(merged)];
  }
  return out;
}

/**
 * Merge an incoming Reddit snapshot into the current device snapshot, per the
 * "never lose ground" policy. Pure. `levelCount` is THIS build's LEVELS.length
 * (the frontier + level results are clamped to it).
 */
export function mergeSave(current: SaveSnapshot, incoming: SaveSnapshot, levelCount: number): SaveSnapshot {
  const out: SaveSnapshot = { ...current };
  mergeKey(out, current, incoming, "glint.progress.v1", (a, b) => Math.min(Math.max(0, levelCount - 1), Math.max(num(a), num(b))), normFrontier);
  mergeKey(out, current, incoming, "glint.results.v1", (a, b) => mergeResults(a, b, levelCount), normResults);
  mergeKey(out, current, incoming, "glint.scores.v1", mergeScores);
  // WALLET: the one value that legitimately goes DOWN (spending), so NEWEST
  // wins — max() would un-spend purchases on every sync. Wallet v2 stamps every
  // change (`at`, epoch ms); legacy unstamped payloads carry at=0, so two
  // legacy sides still fall back to the old max() rule, and any stamped side
  // beats a legacy one.
  mergeKey(out, current, incoming, "glint.wallet.v1", (a, b) => {
    const A = obj(a), B = obj(b);
    const aAt = num(A.at), bAt = num(B.at);
    if (aAt !== bAt) {
      const w = aAt > bAt ? A : B;
      return { nebulite: num(w.nebulite), at: Math.max(aAt, bAt) };
    }
    // equal stamps → max; two LEGACY sides keep the legacy shape exactly, so
    // merging a snapshot with itself is a fixed point (no reload loops)
    const nebulite = Math.max(num(A.nebulite), num(B.nebulite));
    return "at" in A || "at" in B ? { nebulite, at: aAt } : { nebulite };
  });
  mergeKey(out, current, incoming, "glint.stats.v1", mergeStats);
  mergeKey(out, current, incoming, "glint.collection.v1", mergeGrants);
  // latched achievements: earned is forever, on every device — union
  mergeKey(out, current, incoming, "glint.achievements.v1", (a, b) => [
    ...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter((x): x is string => typeof x === "string")),
  ]);
  mergeKey(out, current, incoming, "glint.tutorial.v1", (a, b) => !!a || !!b);
  // academy tips: adopt only if the device has no local record (don't disturb an
  // existing player's tip state; a fresh importer gets "already seen")
  if (!current["glint.academytips.v1"] && incoming["glint.academytips.v1"]) out["glint.academytips.v1"] = incoming["glint.academytips.v1"];
  return out;
}

/** The keys that travel between devices (mergeSave's whole vocabulary). Settings,
 *  CMS drafts, daily-popup state, debug flags etc. stay device-local on purpose. */
export const SYNC_KEYS = [
  "glint.progress.v1",
  "glint.results.v1",
  "glint.scores.v1",
  "glint.wallet.v1",
  "glint.stats.v1",
  "glint.collection.v1",
  "glint.achievements.v1",
  "glint.tutorial.v1",
  "glint.academytips.v1",
] as const;

/** The device's SYNCED progress only — what gets pushed to the account cloud save. */
export function syncSnapshot(): SaveSnapshot {
  const all = currentSnapshot();
  const out: SaveSnapshot = {};
  for (const k of SYNC_KEYS) if (all[k] !== undefined) out[k] = all[k];
  return out;
}

/** Does this snapshot hold progress a player would mind losing? Drives the
 *  merge-consent prompt on first sign-in on an already-played device. */
export function hasMeaningfulProgress(snap: SaveSnapshot): boolean {
  const d = (key: string): unknown => parseEnv(snap[key])?.d;
  if (num(d("glint.progress.v1")) > 0) return true; // past the tutorial level
  if (num(obj(d("glint.wallet.v1")).nebulite) > 0) return true;
  if (num(obj(d("glint.stats.v1")).gamesPlayed) > 0) return true;
  const scores = d("glint.scores.v1");
  return Array.isArray(scores) && scores.length > 0;
}

/** "Use account save only": the ops that make this device MATCH the cloud —
 *  every sync key present in the cloud is set, every sync key the cloud lacks is
 *  removed (local-only progress is deliberately discarded; the caller confirms
 *  first). Pure — the caller applies the ops to localStorage. */
export function buildReplaceOps(cloud: SaveSnapshot): { set: SaveSnapshot; remove: string[] } {
  const set: SaveSnapshot = {};
  const remove: string[] = [];
  for (const k of SYNC_KEYS) {
    if (cloud[k] !== undefined) set[k] = cloud[k];
    else remove.push(k);
  }
  return { set, remove };
}

/** Read the device's current `glint.*` snapshot from localStorage. */
export function currentSnapshot(): SaveSnapshot {
  const out: SaveSnapshot = {};
  if (typeof window === "undefined") return out;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("glint.")) out[k] = window.localStorage.getItem(k) ?? "";
    }
  } catch { /* storage unavailable */ }
  return out;
}

/** Write a merged snapshot back to localStorage (only the keys mergeSave changed).
 *  The caller should reload afterwards so every module re-reads from storage. */
export function applyMergedSnapshot(merged: SaveSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    for (const [k, v] of Object.entries(merged)) window.localStorage.setItem(k, v);
  } catch { /* storage unavailable */ }
}

/** Apply buildReplaceOps output — sets + removals. Caller reloads afterwards. */
export function applyReplaceOps(ops: { set: SaveSnapshot; remove: string[] }): void {
  if (typeof window === "undefined") return;
  try {
    for (const [k, v] of Object.entries(ops.set)) window.localStorage.setItem(k, v);
    for (const k of ops.remove) window.localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}
