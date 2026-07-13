/**
 * The Ascent — campaign levels.
 *
 * A level is NOT a bespoke game; it's a set of PARAMETERS fed to the standard game
 * generator (`newGame`). Difficulty escalates via board size, the number of Dross /
 * Nebulites seeded on the board, and how soon the board collapses.
 *
 * LEVELS ARE CMS CONTENT: the definitions live in levels.json, edited from the
 * admin page (/admin.html) and published as a git commit. This module turns those
 * plain-JSON definitions into the runtime Level objects (unlock predicates built
 * from the serializable unlock rules). With ?cmspreview=1 an unpublished admin
 * draft overlays the bundled JSON — see src/content/content.ts.
 *
 * Board size sets the COLLAPSE COUNT: a side-6 board collapses twice (6→5→4), a
 * side-5 board once (5→4), a side-4 board never — though GLINT RUSH still arms
 * on a side-4 board when occupancy reaches collapseAt2 (only the contraction is
 * skipped). The tile manifest keeps the GDD balance at every size: the 103-tile
 * full game (100 minerals + 2 Dross + 1 Nebulite) defines the ratios, and smaller
 * boards recalculate the per-type counts from those ratios exactly (see
 * MINERAL_QTY / newGame in engine.ts).
 *
 * Each level also carries the on-screen unlock requirement text and the rule that
 * unlocks it — evaluated against the RESULT of the PRECEDING level's run (per the
 * design: e.g. "banking 3 times in Level 1 unlocks Level 2").
 *
 * PLANNED PARAMETERS (documented, not yet implemented — the generator ignores them
 * for now):
 *  - board shape: layouts beyond the regular hexagon
 *  - obstacles: number of blocked/impassable cells seeded on the board
 *  - gaps: number of empty cells (holes) seeded on the board
 *
 * Level 0 (Tutorial) is the CUSTOM scripted level (src/ui/TutorialLevel.tsx, per
 * design_handoff_glint_tutorial_level): a 26-step guided walkthrough on fixed
 * boards. Its final Continue hands off into a REAL run using the params below
 * (smallest board, no specials) — the dynamic playthrough that closes the level.
 */
import raw from "./levels.json";
import type { BoardShape } from "../game/hex";
import { isCmsPreview, readDraft, LEVELS_DRAFT_KEY } from "../content/content";

export interface RunResult {
  score: number;
  banks: number;
  busts: number;
  coreBanked: boolean; // banked/covered/cleared a Nebulite on the board
  nebulitesAcquired: number; // Nebulites earned into the hand (Mother Lode 6+ overflow)
  drossCleared: number; // Dross removed from the board
  boardCleared: boolean; // won (cleared the board)
}

export interface LevelParams {
  side: 4 | 5 | 6; // board size (collapse count follows: 6→2, 5→1, 4→0)
  shape: "hexagon"; // legacy field (the hexagon base); see boardShape for the expansions
  theme: "blank" | "regions"; // visual theme (regions = metadata for the map label for now)
  nebulites: number; // Cores seeded on the board (standard 1)
  dross: number; // Dross seeded on the board (standard 2)
  collapseAt1: number; // side-6 → side-5 trigger (standard 30)
  collapseAt2: number; // side-5 → side-4 trigger (standard 15)
  gaps: number; // cells that start EMPTY (playable, no gem seeded)
  obstacles: number; // cells REMOVED from the board (holes; connectivity preserved)
  boardShape: BoardShape; // side-6 only: corner-wedge expansions beyond the hexagon
  singularityAt: number; // shaped boards: wedges fall when occupancy reaches this
  // EXTRA STARTING TILES: added to the standard hand of 9 — bigger shaped boards
  // can grant a deeper stack so their scoring ceiling keeps up with their size
  extraTiles: number;
}

/** Serializable unlock requirement — what the CMS stores. Evaluated against the
 *  PREVIOUS level's RunResult. */
export interface UnlockRule {
  type: "always" | "banks" | "drossCleared" | "coreBanked" | "nebuliteAcquired" | "boardCleared" | "score";
  value?: number;
}

/** A level exactly as stored in levels.json (and edited in the admin page).
 *  gaps/obstacles/boardShape/singularityAt are optional for backward
 *  compatibility — older data means 0 / 0 / hexagon / 45. */
export interface LevelDef {
  title: string;
  region: string | null;
  theme: "blank" | "regions";
  unlockText: string;
  unlockRule: UnlockRule;
  params: {
    side: 4 | 5 | 6;
    nebulites: number;
    dross: number;
    collapseAt1: number;
    collapseAt2: number;
    gaps?: number;
    obstacles?: number;
    boardShape?: BoardShape;
    singularityAt?: number;
    extraTiles?: number;
  };
  /** PUZZLE BOARD: an image revealed piece-by-piece under the tiles as they clear.
   *  The image is also the art of an auto-linked sticker that opens a sector. */
  puzzleBoard?: boolean;
  puzzleImage?: string; // committed image URL
  /** the puzzle's PERMANENT identity — minted once when the puzzle is created,
   *  carried by its auto-linked sticker too, so the pair stays married no matter
   *  where the level moves or where the sticker sits in the book */
  puzzleId?: string;
  // FOCAL POINT for the on-board cover-crop (0–100 % of the image); the sticker
  // + reveal pop-up always show the whole picture regardless. Default centre.
  puzzleFocalX?: number;
  puzzleFocalY?: number;
  /** the BOSS finale (The Master Core): always the list's last tile, drawn with
   *  its own menacing treatment on the levels page */
  boss?: boolean;
  /** the GO! opening slam over the board once it sets up (default ON;
   *  unchecked for the Tutorial and The Academy) */
  countdown?: boolean;
}

export interface Level {
  num: number;
  title: string;
  region?: string;
  unlock: string; // requirement text shown on the tile ("" = unlocked from the start)
  unlockedBy: (prev: RunResult) => boolean; // met by the PREVIOUS level's run
  params: LevelParams;
  boss?: boolean; // the finale — rendered as the BOSS tile
  countdown?: boolean; // the GO! opening slam (undefined = on)
  puzzleImage?: string; // a puzzle board's revealed image (undefined = normal board)
  puzzleFocalX?: number; // on-board crop focal point, 0–100 % (default 50)
  puzzleFocalY?: number;
}

export function unlockPredicate(rule: UnlockRule): (prev: RunResult) => boolean {
  const v = rule.value ?? 0;
  switch (rule.type) {
    case "always":
      return () => true;
    case "banks":
      return (r) => r.banks >= v;
    case "drossCleared":
      return (r) => r.drossCleared >= v;
    case "coreBanked":
      return (r) => r.coreBanked;
    case "nebuliteAcquired":
      return (r) => r.nebulitesAcquired >= Math.max(1, v);
    case "boardCleared":
      return (r) => r.boardCleared;
    case "score":
      return (r) => r.score >= v;
  }
}

export function toLevel(def: LevelDef, num: number): Level {
  const p = def.params;
  return {
    num,
    title: def.title,
    region: def.region ?? undefined,
    unlock: def.unlockText,
    unlockedBy: unlockPredicate(def.unlockRule),
    params: {
      shape: "hexagon",
      theme: def.theme,
      ...p,
      gaps: p.gaps ?? 0,
      obstacles: p.obstacles ?? 0,
      boardShape: p.side === 6 ? p.boardShape ?? "hexagon" : "hexagon",
      singularityAt: p.singularityAt ?? 45,
      extraTiles: Math.max(0, Math.min(6, p.extraTiles ?? 0)),
    },
    boss: def.boss === true || undefined,
    countdown: def.countdown,
    puzzleImage: def.puzzleBoard && def.puzzleImage ? def.puzzleImage : undefined,
    puzzleFocalX: def.puzzleFocalX,
    puzzleFocalY: def.puzzleFocalY,
  };
}

export const LEVEL_DEFS: LevelDef[] = (() => {
  const bundled = raw.levels as LevelDef[];
  if (!isCmsPreview()) return bundled;
  const draft = readDraft<{ levels: LevelDef[] }>(LEVELS_DRAFT_KEY);
  return draft?.levels?.length ? draft.levels : bundled;
})();

export const LEVELS: Level[] = LEVEL_DEFS.map(toLevel);
