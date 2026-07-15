/**
 * SHARED localStorage ACCESS — one read/write recipe for every persisted slice
 * (progress, scores, stats, settings, wallet, collection grants).
 *
 * THE POLICY (applies to every caller):
 *  - Reads never throw: a missing key, corrupt JSON, or unavailable storage
 *    returns the fallback.
 *  - When the fallback is a plain OBJECT, the stored value is SHALLOW-MERGED
 *    over it — so when the app ships a new field, players with older saves get
 *    the new field's default instead of `undefined`. (Shallow on purpose:
 *    nested records are replaced wholesale, exactly like before.)
 *  - Arrays and scalars replace the fallback wholesale, but only when the
 *    stored value's basic type matches (an array where an array is expected,
 *    etc.); a mismatch returns the fallback.
 *  - Field-level VALIDATION stays in each module (e.g. settings clamps volumes,
 *    the wallet floors its balance) — this layer only parses and backfills.
 */

import { scheduleSavePush } from "./saveSync";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(fallback)) {
      return isPlainObject(parsed) ? ({ ...fallback, ...parsed } as T) : fallback;
    }
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? (parsed as T) : fallback;
    }
    return typeof parsed === typeof fallback ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    scheduleSavePush();
  } catch {
    /* storage unavailable — the value just won't persist this session */
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
    scheduleSavePush();
  } catch {
    /* ignore */
  }
}

/* --------------------------- versioned save seam ---------------------------
 * Every persisted slice writes a versioned envelope `{ v, d }`. When the shape
 * of a save changes in a future build, bump that slice's version and pass a
 * `migrate` that upgrades an older payload — so existing players keep their
 * progress instead of silently resetting to the fallback. Saves written before
 * this seam existed have no envelope and are read as version 0.
 */
interface Envelope {
  v: number;
  d: unknown;
}
const isEnvelope = (v: unknown): v is Envelope => isPlainObject(v) && typeof (v as { v?: unknown }).v === "number" && "d" in v;

/**
 * Versioned read. `currentVersion` is the shape this build expects; `migrate`
 * (optional) upgrades a payload from its stored version up to current. The
 * result is then backfilled against `fallback` with the same object/array/scalar
 * policy as readStored, so newly-added fields still get their defaults.
 */
export function readVersioned<T>(key: string, fallback: T, currentVersion: number, migrate?: (data: unknown, fromVersion: number) => unknown): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    const from = isEnvelope(parsed) ? parsed.v : 0; // pre-seam saves = v0
    let data: unknown = isEnvelope(parsed) ? parsed.d : parsed;
    if (from < currentVersion && migrate) data = migrate(data, from);
    if (isPlainObject(fallback)) return isPlainObject(data) ? ({ ...fallback, ...data } as T) : fallback;
    if (Array.isArray(fallback)) return Array.isArray(data) ? (data as T) : fallback;
    return typeof data === typeof fallback ? (data as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Versioned write — wraps the value in a `{ v, d }` envelope. */
export function writeVersioned(key: string, value: unknown, version: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: version, d: value } satisfies Envelope));
    scheduleSavePush();
  } catch {
    /* storage unavailable — the value just won't persist this session */
  }
}
