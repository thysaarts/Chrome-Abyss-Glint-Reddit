/**
 * 2026-07 CAMPAIGN RENUMBERING — the tutorial split inserted "The Academy" at
 * Level 1 (old 1–9 shifted +1) and retired old Level 10 "The Fortress" (old
 * 11+ kept their numbers, so the list stays at exactly 100 levels + tutorial).
 *
 * Save envelopes ({v, d} — see storage.ts) carry a version: payloads written
 * at v < SAVE_NUMBERING_V hold OLD level numbers and pass through these remaps
 * when read (progress.ts), merged (importSave.ts — cloud saves and Reddit
 * imports), or migrated (puzzleintro.ts). Pure module — no storage imports.
 */
export const SAVE_NUMBERING_V = 2;

/** Old campaign level number → new. Old 10 maps to its successor (11). */
export function remapLevelNum(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 9) return n + 1;
  if (n === 10) return 11;
  return n;
}

/** Remap a level-number-keyed record (results, seen-lists). Old level 10's
 *  entry has no new home — the level was deleted — so it drops. */
export function remapLevelKeys<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0 || n === 10) continue;
    out[String(n >= 1 && n <= 9 ? n + 1 : n)] = v;
  }
  return out;
}
