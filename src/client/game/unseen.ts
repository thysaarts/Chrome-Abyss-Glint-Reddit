/**
 * UNSEEN REWARDS — collectibles the player earned but never saw in the reward
 * pop-up (they hit Play again, exited mid-flow, or reloaded before the reveal).
 *
 * Items are flagged the moment they are granted (so no skip path can lose
 * them), un-flagged the moment the reveal pop-up actually shows them, and the
 * remainder drives a small alert dot on the Collection tab. Leaving the
 * Collection page clears the flag — they've had their look.
 */
import { readStored, writeStored } from "./storage";

const KEY = "glint.unseenrewards.v1";

interface Store {
  ids: string[]; // "kind:key" per unseen collectible
}

const id = (r: { kind: string; key: string }) => `${r.kind}:${r.key}`;

function load(): Store {
  const s = readStored<Store>(KEY, { ids: [] });
  return { ids: Array.isArray(s.ids) ? s.ids : [] };
}

/** Flag freshly granted rewards as not-yet-seen (idempotent). */
export function markUnseen(items: { kind: string; key: string }[]): void {
  if (!items.length) return;
  const s = load();
  const merged = new Set([...s.ids, ...items.map(id)]);
  writeStored(KEY, { ids: [...merged] });
}

/** The reveal pop-up showed these — they're seen. */
export function markSeen(items: { kind: string; key: string }[]): void {
  if (!items.length) return;
  const s = load();
  const drop = new Set(items.map(id));
  writeStored(KEY, { ids: s.ids.filter((x) => !drop.has(x)) });
}

/** How many earned collectibles the player has never had shown to them. */
export function unseenCount(): number {
  return load().ids.length;
}

/** Every unseen id, as "kind:key" — drives the sub-tab and per-item dots. */
export function unseenIds(): string[] {
  return load().ids;
}

/** Blanket clear (legacy). The per-item scroll-into-view marking in
 *  CollectionPage is the primary path now. */
export function clearUnseen(): void {
  writeStored(KEY, { ids: [] });
}
