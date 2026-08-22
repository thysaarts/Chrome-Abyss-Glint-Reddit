/**
 * REDDIT SAVE SYNC — progress follows the PLAYER, not the device.
 *
 * localStorage is per-device (and per-webview), so on Reddit a player's phone
 * and desktop would each start blank. This module mirrors every `glint.*`
 * localStorage key to the Devvit server (Redis, keyed by the Reddit account):
 *
 *  - hydrateSave(): called once at boot BEFORE the app mounts — pulls the
 *    server snapshot and writes it into localStorage, so every module reads
 *    the account's real progress.
 *  - scheduleSavePush(): called by the storage layer after every write —
 *    debounced, pushes the full snapshot back up. Also flushed when the tab
 *    hides (the only reliable "goodbye" signal in a webview).
 *
 * Outside Reddit the endpoints don't exist: hydrate fails silently, sync
 * disables itself, and the game stays purely local — exactly as before.
 */

import { mergeSave, SYNC_KEYS } from "./importSave";
import { LEVELS } from "../levels/levels";

const PREFIX = "glint.";
const SYNC_SET = new Set<string>(SYNC_KEYS);
let enabled = false;
let timer: number | undefined;

export function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

async function push(keepalive = false): Promise<void> {
  if (!enabled) return;
  try {
    await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: snapshot() }),
      keepalive,
    });
  } catch {
    /* transient network trouble — the next write schedules another push */
  }
}

/** Debounced full-snapshot push; the storage layer calls this on every write. */
export function scheduleSavePush(): void {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => { timer = undefined; void push(); }, 1500);
}

/** Pull the account's save and apply it over localStorage. Call ONCE, before
 *  the app mounts (main.tsx awaits this).
 *
 *  MERGE, never lose ground (web parity, ported 2026-08): the PROGRESS-BEARING
 *  keys (SYNC_KEYS — frontier, results, scores, wallet, stats, collection,
 *  achievements, tutorial, academy tips) combine per-field — max/OR/union,
 *  wallet newest-wins — so a stale device coming back online can no longer
 *  wipe fresher progress another device pushed. Every OTHER glint.* key keeps
 *  the old rule: the account snapshot wins wholesale (settings, daily state
 *  and popup flags simply follow the account). If the merge kept anything the
 *  server didn't have, the result is pushed straight back up. */
export async function hydrateSave(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/save");
    if (!res.ok) return; // not on Reddit (or not signed in) — stay local-only
    const body = (await res.json()) as { type?: string; data?: Record<string, string> | null };
    if (body.type !== "save") return;
    enabled = true;
    if (body.data && typeof body.data === "object") {
      const server: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.data)) {
        if (k.startsWith(PREFIX) && typeof v === "string") server[k] = v;
      }
      const local = snapshot();
      const merged = mergeSave(local, server, LEVELS.length);
      let differsFromServer = false;
      // progress-bearing keys: the merged value lands locally
      for (const k of SYNC_SET) {
        if (merged[k] === undefined) continue;
        localStorage.setItem(k, merged[k]);
        if (merged[k] !== server[k]) differsFromServer = true;
      }
      // everything else: the account snapshot wins wholesale, as before
      for (const k of Object.keys(local)) {
        if (!SYNC_SET.has(k) && !(k in server)) localStorage.removeItem(k);
      }
      for (const [k, v] of Object.entries(server)) {
        if (!SYNC_SET.has(k)) localStorage.setItem(k, v);
      }
      if (differsFromServer) scheduleSavePush(); // teach the server what the merge kept
    } else {
      // first ever boot for this account: adopt whatever this device has
      scheduleSavePush();
    }
    // the webview's only dependable exit signal — flush pending changes
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && timer) {
        window.clearTimeout(timer);
        timer = undefined;
        void push(true);
      }
    });
  } catch {
    /* outside Reddit — local-only */
  }
}
