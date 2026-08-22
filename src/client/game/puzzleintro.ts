/**
 * PUZZLE INTRO — has the player seen the "Uncover the Picture" briefing for a given
 * puzzle level? It auto-opens over the board the first time they launch each puzzle
 * level, then never again for that level.
 *
 * Tracked PER LEVEL (not a single global flag): the campaign gets reorganised, so a
 * puzzle can move (e.g. level 11 → level 5). A global "seen" boolean set at the old
 * position would wrongly suppress the briefing at the new one. Keying by level num
 * makes it robust to that. (v2 key — the old v1 global boolean is intentionally
 * abandoned so a reorganised puzzle level shows the briefing again.)
 */
import { readVersioned, writeVersioned, removeStored } from "./storage";
import { SAVE_NUMBERING_V } from "../levels/renumber";

const KEY = "glint.puzzleintro.v2";
// envelope v2: version PARITY with the web build. This build was born after the
// 2026-07 renumbering, so v1 payloads here already hold NEW campaign numbers —
// the migrate is a pure stamp-up, NO remap (see levels/progress.ts).
const migrate = (d: unknown, _from: number): unknown => d;
const load = (): Flags => readVersioned<Flags>(KEY, { seenLevels: [] }, SAVE_NUMBERING_V, migrate);

interface Flags {
  seenLevels: number[];
}

export function puzzleIntroSeen(levelNum: number): boolean {
  return load().seenLevels.includes(levelNum);
}
export function markPuzzleIntroSeen(levelNum: number): void {
  const f = load();
  if (!f.seenLevels.includes(levelNum)) writeVersioned(KEY, { seenLevels: [...f.seenLevels, levelNum] }, SAVE_NUMBERING_V);
}
/** Reset progress → replay every puzzle level's intro briefing from scratch. */
export function resetPuzzleIntro(): void {
  removeStored(KEY);
}
