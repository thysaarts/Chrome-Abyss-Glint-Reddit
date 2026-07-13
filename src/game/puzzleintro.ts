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
import { readStored, writeStored, removeStored } from "./storage";

const KEY = "glint.puzzleintro.v2";

interface Flags {
  seenLevels: number[];
}

export function puzzleIntroSeen(levelNum: number): boolean {
  return readStored<Flags>(KEY, { seenLevels: [] }).seenLevels.includes(levelNum);
}
export function markPuzzleIntroSeen(levelNum: number): void {
  const f = readStored<Flags>(KEY, { seenLevels: [] });
  if (!f.seenLevels.includes(levelNum)) writeStored(KEY, { seenLevels: [...f.seenLevels, levelNum] });
}
/** Reset progress → replay every puzzle level's intro briefing from scratch. */
export function resetPuzzleIntro(): void {
  removeStored(KEY);
}
