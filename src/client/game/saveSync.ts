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

const PREFIX = "glint.";
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
 *  the app mounts (main.tsx awaits this). The server copy wins: pushes happen
 *  on every write, so it is at least as fresh as any other device's state. */
export async function hydrateSave(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/save");
    if (!res.ok) return; // not on Reddit (or not signed in) — stay local-only
    const body = (await res.json()) as { type?: string; data?: Record<string, string> | null };
    if (body.type !== "save") return;
    enabled = true;
    if (body.data && typeof body.data === "object") {
      // remove local glint.* keys the server doesn't have, then apply the rest —
      // the account's snapshot becomes THE state, not a merge
      const local = snapshot();
      for (const k of Object.keys(local)) {
        if (!(k in body.data)) localStorage.removeItem(k);
      }
      for (const [k, v] of Object.entries(body.data)) {
        if (k.startsWith(PREFIX) && typeof v === "string") localStorage.setItem(k, v);
      }
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
