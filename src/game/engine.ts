/**
 * GAME ENGINE — Chrome Abyss: Nebulite
 * =====================================
 * Pure, framework-free game state and rules. The UI calls these functions and
 * renders the returned state. No randomness except in `newGame` (seedable).
 *
 * THE CORE RULE (Interpretation C, per the design):
 * --------------------------------------------------
 * A "combo" is only ever the group of tiles the player has ACTIVATED this turn
 * — shown with a glowing outline. Existing board combos the player has not
 * interacted with never count.
 *
 * Each turn the player places their visible hand tile onto a board cell that is
 * adjacent to the current activated group (or, for the first placement of a
 * build, anywhere — it starts a fresh group). The placement must keep the
 * activated group "valid" (a partial or complete combo / chain).
 *
 *   - Placing onto an occupied cell COVERS it; the covered mineral goes to hand
 *     (unless this placement BANKS, in which case the covered tile becomes the
 *     multiplier and is discarded).
 *   - Placing into a gap takes nothing.
 *
 * A group BANKS automatically the moment it reaches >= 6 tiles AND forms valid
 * combos. The banked tiles clear off the board (leaving gaps).
 *
 * BUST: if the player chooses to place a tile that does NOT keep a valid
 * activated group going (no legal extension and not a fresh valid start), they
 * bust: the activated group is lost (cleared, unscored), the placed tile is
 * discarded, and the next hand tile is forced inert into the bust cell.
 *
 * Because a single placement can almost never complete a set on its own (you'd
 * need to have placed the matching tiles yourself), banking is hard-won and the
 * hand is not drained every turn — it only loses tiles when a 6+ group banks.
 */

import { Axial, keyOf, hexCells, neighbours, shapeCells, BoardShape, parseKey } from "./hex";
import { logText, logIsSticky, chainLabel } from "../content/content";
import { MineralValue } from "../theme/theme";
import {
  classifyGroup,
  isBuildablePrefix,
  scoreBank,
  chainBonus,
  ComboName,
  ChainName,
  BANK_THRESHOLD,
  CORE_BONUS,
  ZENITH_BONUS,
  COMBO_POINTS,
  COMBO_SIZE,
  boardClearBonus,
} from "./combos";
import { enumerateActivationChoices, makeBoardView, ActivatedCombo } from "./activation";
import { shrinkBoard } from "./shrink";

export const SHRINK_TRIGGER = 30; // side-6 (91) collapses to side-5 (61) at this many occupied
export const SHRINK_TRIGGER_2 = 15; // side-5 (61) collapses to side-4 (37) at this many — the FINAL round

export const GLINT = 0 as const;
export const CORE = 7 as const;
// ACHIEVEMENT BONUS GEMS — earned via Achievements, seeded once unlocked. They
// are shaped and coloured apart from the six minerals and the two specials.
export const RESURRECT = 8 as const; // heart — recovers a bust / adds a life when revealed (Invincible)
export const QUADRIANT = 9 as const; // ruby radiant — x4 the covering tile's value into the bank (Crimson Endurance)
export const ZENITH = 10 as const; // elongated hex — +6000 combo filler dealt at GLINT RUSH (Superluminal achievement)
export type BonusGem = typeof RESURRECT | typeof QUADRIANT | typeof ZENITH;
export type TileVal = MineralValue | typeof GLINT | typeof CORE | BonusGem;

/** The end-of-run score adjustments, in the order the summary reveals them. Positive
 *  kinds add (board-clear bonus, unspent conversion, banked lone tiles); the two
 *  penalties (`unbanked`, `tiles`) subtract. */
export type EndTallyKind = "boardTiles" | "busts" | "banks" | "hand" | "zenith" | "clear" | "unbanked" | "tiles";

// MOTHER LODE: banking a long same-value chain overflows the leftover tiles to the
// hand. Each overflow tile is worth a score bonus, and every full 6 of them are
// REFINED into one Nebulite (Core) in the hand.
export const OVERFLOW_BONUS_PER_TILE = 50;
export const REFINE_PER_NEBULITE = 6;
const MINERAL_NAME: Record<number, string> = { 1: "Duneglass", 2: "Vigilite", 3: "Chromite", 4: "Verdite", 5: "Umbrite", 6: "Nuracite" };

/** A fresh, empty per-placement resolution record. */
// Age out inert tiles: a bust's forced tile shows a red outline for exactly ONE
// turn, then becomes a normal tile. Called at the start of the next placement.
function ageInertTiles(s: GameState): void {
  for (const k of s.order) {
    const c = s.cells.get(k);
    if (c && c.inert) c.inert = false;
  }
}

function emptyResolved(): GameState["lastResolved"] {
  return {
    strandToHand: [],
    motherLode: null,
    isolatedToScore: [],
    pairToHand: [],
    buriedToHand: [],
    coreRespawnedAt: null,
    reshuffled: false,
    clearBonus: 0,
    shrunk: null,
    singularity: null,
    nudged: [],
    inertAt: null,
    lateIsolated: { banked: [], toHand: [], buried: [] },
    lateDiscarded: [],
    bonusRevealed: [],
  };
}

/**
 * The canonical tile manifest (GDD): 100 minerals in this rarity ladder for the
 * full-size game (91 board cells + 9 hand), PLUS the specials seeded on top
 * (standard 2 Dross + 1 Nebulite, which BURY minerals rather than replace them)
 * = 103 tiles total. Smaller boards recalculate the mineral counts from these
 * ratios — exactly, via largest-remainder — so the balance stays intact.
 */
export const MINERAL_QTY: Record<MineralValue, number> = { 1: 25, 2: 20, 3: 15, 4: 15, 5: 15, 6: 10 };

export interface Cell {
  coord: Axial;
  tile: TileVal | null; // null = gap
  // A bust's forced tile. It's a NORMAL tile mechanically (combos, and banks when
  // isolated) but shows a red outline for exactly one turn to mark it as just-placed;
  // it's exempt from isolation-banking on that first turn (so it settles), then aged
  // to a plain tile at the start of the next placement.
  inert: boolean;
  buried: TileVal | null; // a mineral sitting UNDER a Glint/Core; goes to hand when the special leaves
  // an ACHIEVEMENT BONUS GEM (Resurrect / Quadriant) hidden beneath this cell —
  // orthogonal to `buried` (which covering/placement uses), so a mineral can be
  // covered without disturbing the gem. Revealed when the cell finally empties.
  // Optional: display-only freeze-state cells in the UI omit it.
  bonusGem?: TileVal | null;
  // this cell was filled by a ZENITH wildcard (stored as its chosen value) — the
  // bank that clears it grants the flat Zenith bonus.
  zenithFill?: boolean;
}

export type Phase = "playing" | "won" | "lost";

export interface LogEntry {
  text: string;
  kind: "bank" | "bust" | "info" | "core" | "glint" | "rush" | "lode";
  sticky?: boolean; // CMS-flagged: the floating toast holds until the next entry
}

export interface GameState {
  side: number;
  cells: Map<string, Cell>;
  order: string[]; // stable cell iteration order
  adj: Map<string, string[]>; // precomputed neighbours per cell
  hand: TileVal[]; // hand[0] is the visible tile
  startHandSize: number;

  // Per-game collapse triggers (a level generator can override these). side-6 collapses
  // to side-5 at collapseAt1 occupied; side-5 collapses to side-4 at collapseAt2. A board
  // that starts smaller simply has fewer collapses (side-5 → 1, side-4 → 0).
  collapseAt1: number;
  collapseAt2: number;

  score: number;
  coreBanked: boolean; // banked/covered/cleared a Nebulite on the BOARD this game
  coresCollected: number; // how many board Nebulites went to the score this run — each one also credits the wallet
  nebulitesRefined: number; // Nebulites ACQUIRED into the hand via Mother Lode (6+ overflow refined)
  drossCleared: number; // Dross tiles removed from the board this game (for level objectives)
  rngState: number; // advancing seed for in-play randomness (reshuffle, core respawn)
  hasShrunk: boolean; // the board has already collapsed at least once (side-6 -> side-5)
  coreRespawnDisabled: boolean; // after the endgame shrink, a cleared Core no longer respawns
  // THE HAND REVEAL + BUST RESCUE (difficulty-driven; see rescueAfterBust)
  revealAt: number; // hand size at/below which the hand wheel reveals (easy 5 / medium 4 / hard 3)
  handRevealed: boolean; // hysteresis: once revealed, stays revealed for the run
  rescueMode: "off" | "easy" | "medium"; // easy = every bust; medium = forced busts only; off = hard
  rescueRevealedUsed: boolean; // medium's ONE revealed-hand board arrangement was spent
  moves: number; // committed placements this run (busts included) — drives the teaching hints
  // end-of-run conversion breakdown (board clear + cash out): unspent lives,
  // free banks and hand minerals turned into points — drives the summary lines
  endBonus: { lives: number; banks: number; gems: number } | null;
  // end-of-run penalty for gems left on the board when the run ends (lost): a flat
  // 100 points per remaining mineral (NOT face value) — drives a summary line
  gemsLeftPenalty: { count: number; points: number } | null;
  // END-OF-RUN SCORE REVEAL. `scoreBase` is the score banked from the board DURING PLAY
  // (what the header shows through the win/loss animation). `endTally` is the ordered
  // list of end-of-run adjustments — board-clear bonus, unspent busts/banks/hand
  // conversion, tiles-left penalty, etc. — each applied AT THE POP-UP so the summary
  // tallies up and down for real. scoreBase + Σ endTally.delta = the pre-floor final;
  // At the end, `score` STAYS at scoreBase — NONE of the end-of-run adjustments are
  // awarded before the pop-up is in view; the pop-up applies each step live. `finalScore`
  // is the floored (never-negative) total the summary lands on and the run records at.
  scoreBase: number;
  finalScore: number;
  endTally: { kind: EndTallyKind; delta: number }[];
  maxBankScore: number; // the largest single bank (combo/chain incl. multiplier) this run
  // BOARD SHAPE (side-6 only): a non-standard shape starts with corner wedges
  // beyond the 91-cell hexagon. The SINGULARITY event (occupancy <= singularityAt,
  // always BEFORE the first collapse) drops every wedge cell into the abyss —
  // discarded unscored — leaving the standard hexagon. After it fires, shape
  // reads "hexagon" again and singularityDone is set.
  shape: BoardShape;
  // the shape the board STARTED as (never mutated by the singularity). The
  // board-clear bonus scales by it: hexagon/smaller 5000, a bigger wedge board
  // 7500, the biggest square board 10000.
  startShape: BoardShape;
  singularityAt: number;
  singularityDone: boolean;
  // OBSTACLES: cells carved out of the board at generation (holes — nothing can
  // ever occupy them). On a collapse only the central ones survive, capped at
  // ceil(60%) of the previous count. obstacleSeed reproduces the carving — the
  // in-game Restart reuses it so the BOARD stays put while the gems respawn.
  obstacles: string[];
  obstacleSeed: number;
  // GLINT RUSH — the final round on the side-4 (37-cell) board: ANY combo banks
  // immediately (no 6-tile threshold), so the player can clear the board.
  deathMatch: boolean;
  // ZENITH (Superluminal reward): unlocked this run → one is dealt to the hand
  // the moment GLINT RUSH arms. `zenithDealt` guards the one-time deal.
  zenithUnlocked: boolean;
  zenithDealt: boolean;
  // CASH OUT — the player ended the run by choice during GLINT RUSH, converting
  // unspent lives / free banks into points. 0 = the run wasn't cashed out.
  cashedOut: number;

  // Rule 2: when the Core is cleared, it respawns ONE placement later. This counts
  // down: when the Core is cleared it's set to 1; after the next placement resolves
  // the Core respawns and it resets to 0.
  coreRespawnPending: number;

  // the activated build for the current turn-in-progress:
  // a list of combos the player has activated, plus the union of their cells.
  activatedCombos: ActivatedCombo[];
  activatedCells: string[]; // union of all activatedCombos' cells (for glow + adjacency)
  pendingCoveredVal: TileVal | null; // tile covered by the most recent placement (multiplier candidate)
  pendingCoveredKey: string | null;

  phase: Phase;
  log: LogEntry[];

  // stats for the run
  banks: number; // total times banked (automatic + free) — shown in the end summary
  busts: number; // total times busted — shown in the end summary
  freeBanksLeft: number; // remaining early/"free" banks (the timed BANK button); starts at 3
  livesLeft: number; // remaining busts before game over; starts at 3
  comboCounts: Partial<Record<ComboName, number>>;
  chainCounts: Partial<Record<ChainName, number>>;

  // events from the most recent placement, for the UI to animate (cleared each turn):
  //  - strandToHand: leftover 7+ strand tiles that moved to the hand (Rule 1)
  //  - isolatedToScore: every isolated tile (Rule 2) — all fly UP to the score
  //  - pairToHand: the second tile of an isolated pair (Rule 6) — flies to the hand
  //  - buriedToHand: minerals recovered from under a removed Glint/Core
  //  - coreRespawnedAt: cell key where the Core just respawned (Rule 2)
  //  - reshuffled: a Glint was cleared, the unrevealed hand was reshuffled (Rule 5)
  //  - clearBonus: board-clear bonus awarded this resolution (Rule 4)
  lastResolved: {
    strandToHand: { key: string; value: number }[];
    // MOTHER LODE: a big same-value overflow was refined this bank. `refinedCells` are
    // the board keys of the tiles that fused (a multiple of 6); `nebulites` is how many
    // Nebulites they became; `bonus` is the overflow score awarded; `sourceValue` the
    // mineral refined. Null when no overflow occurred.
    motherLode: { bonus: number; sourceValue: number; refinedCells: string[]; nebulites: number } | null;
    isolatedToScore: { key: string; value: number; points: number }[];
    pairToHand: { key: string; value: number }[];
    buriedToHand: { key: string; value: number }[];
    coreRespawnedAt: string | null;
    reshuffled: boolean;
    clearBonus: number;
    shrunk: { mapping: { from: string; to: string }[]; final: boolean } | null; // board collapsed this resolution (final = the 37-cell GLINT RUSH collapse)
    // SINGULARITY: the shape's wedge cells (with whatever sat on them) dropped
    // into the abyss this resolution — the UI animates them falling off-screen
    singularity: { cells: { key: string; tile: number | null }[] } | null;
    nudged: { from: string; to: string }[]; // tiles drifted by one cell (bust reshuffle)
    inertAt: string | null; // final cell of a bust's forced inert tile (after shrink + nudge)
    // tiles left isolated by a COLLAPSE or RESHUFFLE (resolved AFTER those, so the UI
    // animates them once the board has settled). Same shape as the immediate records.
    lateIsolated: {
      banked: { key: string; value: number; points: number }[];
      toHand: { key: string; value: number }[];
      buried: { key: string; value: number }[];
    };
    // tiles isolated in a BUST's wake — DISCARDED unscored (the UI poofs them)
    lateDiscarded: { key: string; value: number }[];
    // ACHIEVEMENT BONUS GEMS revealed this resolution — for the UI's reveal
    // flights + sfx. Resurrect resolves immediately (recover a bust / add a life);
    // effect says which, so the UI animates to the right slot. A Quadriant carries
    // the covered tile value it x4'd and the points that added, for the bank line.
    bonusRevealed: { key: string; gem: TileVal; effect: "recover" | "life" | "quad" | "zenith"; coveredValue?: number; bonus?: number }[];
  };
}

// ---- seedable RNG (mulberry32) ----
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A short-lived RNG seeded from (and that advances) the state's rngState. */
function stateRng(s: GameState): () => number {
  let a = s.rngState >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    s.rngState = a >>> 0; // persist advance back onto the state
    return v;
  };
}

export interface NewGameOpts {
  side?: number; // 4, 5 or 6 (board size)
  handSize?: number; // default 9
  seed?: number;
  nebulites?: number; // Cores buried on the board at start (default 1)
  dross?: number; // Dross/Glint traps buried on the board at start (default 2)
  collapseAt1?: number; // side-6 → side-5 trigger (default 30)
  collapseAt2?: number; // side-5 → side-4 trigger (default 15)
  gaps?: number; // cells that START empty (playable, just no gem seeded)
  obstacles?: number; // cells REMOVED from the board (holes; connectivity preserved)
  shape?: BoardShape; // side-6 only; non-hexagon adds corner wedges (see SINGULARITY)
  singularityAt?: number; // shape boards: wedges drop when occupancy reaches this (default 45)
  /** seeds ONLY the obstacle carving (defaults to `seed`). The in-game Restart
   *  passes the previous game's value so the BOARD stays identical while the
   *  gems, gaps and specials respawn fresh. */
  obstacleSeed?: number;
  openingLog?: string; // first log line (e.g. the next level's unlock requirement)
  revealAt?: number; // difficulty's hand-reveal threshold (default 4)
  rescueMode?: "off" | "easy" | "medium"; // bust-rescue behaviour (default "medium")
  // ACHIEVEMENT BONUS GEMS the player has unlocked — seeded into this game.
  // Resurrect & Quadriant bury on the board at start; Zenith is dealt to the hand
  // when GLINT RUSH arms (handled at collapse time).
  bonusGems?: { resurrect?: boolean; quadriant?: boolean; zenith?: boolean };
  // NEBULITE-REFINE RIG: this level's clear must let the player REFINE Nebulite(s)
  // (the next level unlocks via "Acquire N Nebulite"). Seeds a guaranteed 12-tile
  // same-value setup for BOTH Duneglass and Vigilite — a camouflaged winding STRING
  // with a one-tile gap in its middle; filling the gap connects it into 12 (overflow
  // 6 → 1 refine).
  nebuliteRig?: boolean;
}

/** Seed a guaranteed MOTHER-LODE setup for one mineral `gem`, CAMOUFLAGED as a
 *  winding STRING rather than an obvious blob: a self-avoiding 12-cell path (each
 *  new tile touches only the path's end, so it never clumps and never loops back).
 *  One cell in the MIDDLE of the string — between the 3rd and 9th tile — is the
 *  "gap" (a different mineral); filling it with the gem reconnects all 12 into one
 *  combo → banks 6, overflows 6, refines a Nebulite.
 *
 *  The string is built by SWAPPING existing tiles, never overwriting — so the exact
 *  per-type tile count (MINERAL_QTY) is preserved. Every cell BORDERING the string
 *  that already held the gem is swapped away too, so the string is EXACTLY 12 and
 *  never fuses with a stray same-colour cluster elsewhere. A whole attempt is
 *  planned first and only applied if every swap can be sourced, so a failed try
 *  never leaves a half-rigged board. On a board that can't fit it, it no-ops. */
function seedRefineRigs(
  cells: Map<string, Cell>,
  adj: Map<string, string[]>,
  order: string[],
  gapKeys: Set<string>,
  rng: () => number,
): Set<string> {
  const plain = (k: string): boolean => {
    const t = cells.get(k)?.tile;
    return typeof t === "number" && t >= 1 && t <= 6 && cells.get(k)!.buried === null;
  };
  const swap = (a: string, b: string) => {
    const t = cells.get(a)!.tile; cells.get(a)!.tile = cells.get(b)!.tile; cells.get(b)!.tile = t;
  };
  const usedPath = new Set<string>();
  const rigs: { gem: MineralValue; path: string[]; gapKey: string }[] = [];

  // --- PHASE A: lay a self-avoiding 12-string for each gem (swaps only, so tile
  // counts are preserved). Isolation is deferred to Phase B so the second gem's
  // placement can't re-contaminate a string already laid down.
  for (const gem of [1, 2] as MineralValue[]) {
    const free = (k: string): boolean => plain(k) && !gapKeys.has(k) && !usedPath.has(k);
    // self-avoiding walk: each next cell touches NO path cell except the current
    // end, so the string stays thin and never loops back. Warnsdorff-ish: prefer
    // the neighbour with the most onward room, to avoid dead-ending before 12.
    const growString = (seed: string): string[] => {
      const path = [seed];
      const inPath = new Set([seed]);
      while (path.length < 12) {
        const cur = path[path.length - 1];
        const cands = (adj.get(cur) ?? []).filter((nb) =>
          free(nb) && !inPath.has(nb) && (adj.get(nb) ?? []).every((nn) => !inPath.has(nn) || nn === cur)
        );
        if (cands.length === 0) return path;
        const onward = (k: string) => (adj.get(k) ?? []).filter((nb) => free(nb) && !inPath.has(nb)).length;
        path.push(shuffle(cands, rng).sort((a, b) => onward(b) - onward(a))[0]);
        inPath.add(path[path.length - 1]);
      }
      return path;
    };
    for (const seed of shuffle(order.filter(free), rng)) {
      const path = growString(seed);
      if (path.length < 12) continue;
      const pathSet = new Set(path);
      const gapKey = path[3 + Math.floor(rng() * 6)]; // gap mid-string (4th–9th tile)
      const border = new Set<string>();
      for (const k of path) for (const nb of adj.get(k) ?? []) if (!pathSet.has(nb)) border.add(nb);
      // gem donors: plain gem-valued cells outside this string AND its border, so
      // relocating them can't drop a gem tile onto the string's own edge.
      const donors = shuffle(order.filter((k) => plain(k) && cells.get(k)!.tile === gem && !pathSet.has(k) && !border.has(k) && !usedPath.has(k) && !gapKeys.has(k)), rng);
      const need = path.filter((k) => k !== gapKey && cells.get(k)!.tile !== gem);
      if (donors.length < need.length) continue; // not enough gem tiles to move — try another seed
      need.forEach((k, i) => swap(k, donors[i])); // fill the 11 non-gap cells with the gem
      if (cells.get(gapKey)!.tile === gem) {      // the gap must be a DIFFERENT mineral
        const nd = order.find((k) => plain(k) && cells.get(k)!.tile !== gem && !pathSet.has(k) && !border.has(k) && !usedPath.has(k) && !gapKeys.has(k));
        if (nd) swap(gapKey, nd);
      }
      rigs.push({ gem, path, gapKey });
      for (const k of path) usedPath.add(k);
      break;
    }
  }

  // --- PHASE B: isolate every string. Any cell BORDERING a string that holds
  // that string's gem is swapped for a DIFFERENT mineral, so the seeded region is
  // exactly 12 and never fuses with a same-kind neighbour. The donor is any plain
  // cell NOT adjacent to this string (so the gem we push out can't become a fresh
  // stray) and NOT already holding this gem. Neutral (3–6) donors are preferred —
  // relocating one can never disturb the other gem's string — with a broad
  // non-gem fallback so the small boards never starve for donors.
  const allPath = new Set(rigs.flatMap((r) => r.path));
  const donorFor = (gem: MineralValue, nearPath: Set<string>): string | null => {
    const usable = (k: string, neutralOnly: boolean): boolean => {
      const c = cells.get(k);
      if (!c || typeof c.tile !== "number" || c.buried !== null || allPath.has(k) || gapKeys.has(k)) return false;
      if (c.tile === gem || c.tile < 1 || c.tile > 6) return false;
      if (neutralOnly && (c.tile < 3)) return false; // skip the OTHER gem for the safe pass
      return (adj.get(k) ?? []).every((nb) => !nearPath.has(nb)); // never adjacent to the string
    };
    for (const neutralOnly of [true, false]) {
      for (const k of shuffle(order, rng)) if (usable(k, neutralOnly)) return k;
    }
    return null;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const r of rigs) {
      const pset = new Set(r.path);
      for (const k of r.path) for (const nb of adj.get(k) ?? []) {
        if (!pset.has(nb) && cells.get(nb)!.tile === r.gem) {
          const d = donorFor(r.gem, pset);
          if (d) swap(nb, d); // border → non-gem; the displaced gem lands off-string
        }
      }
    }
  }
  return allPath;
}

export function newGame(opts: NewGameOpts = {}): GameState {
  const side = opts.side ?? 6;
  const handSize = opts.handSize ?? 9;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const nebulites = Math.max(0, opts.nebulites ?? 1);
  const dross = Math.max(0, opts.dross ?? 2);
  const collapseAt1 = opts.collapseAt1 ?? SHRINK_TRIGGER;
  const collapseAt2 = opts.collapseAt2 ?? SHRINK_TRIGGER_2;
  const shape: BoardShape = side === 6 ? opts.shape ?? "hexagon" : "hexagon";
  const singularityAt = opts.singularityAt ?? 45;
  const rng = makeRng(seed);
  // the holes get their OWN rng stream so a restart can keep the board while
  // everything on it respawns
  const obstacleSeed = opts.obstacleSeed ?? seed;
  const obsRng = makeRng((obstacleSeed ^ 0x5bd1e995) >>> 0);

  // the starting cell set: the hexagon plus the shape's corner wedges, minus the
  // OBSTACLE holes. Obstacles are carved with a connectivity guard — a carve that
  // would disconnect any part of the board is skipped and another cell is tried.
  let coords = shapeCells(side, shape);
  const obstacleKeys: string[] = [];
  const wantObstacles = Math.min(Math.max(0, opts.obstacles ?? 0), Math.floor(coords.length / 5));
  if (wantObstacles > 0) {
    const isConnected = (set: Set<string>): boolean => {
      const first = set.values().next().value as string | undefined;
      if (!first) return true;
      const seen = new Set([first]);
      const stack = [first];
      while (stack.length) {
        const c = parseKey(stack.pop()!);
        for (const n of neighbours(c, set)) {
          const nk = keyOf(n);
          if (!seen.has(nk)) {
            seen.add(nk);
            stack.push(nk);
          }
        }
      }
      return seen.size === set.size;
    };
    const remaining = new Set(coords.map(keyOf));
    for (const k of shuffle(coords.map(keyOf), obsRng)) {
      if (obstacleKeys.length >= wantObstacles) break;
      remaining.delete(k);
      if (isConnected(remaining)) obstacleKeys.push(k);
      else remaining.add(k); // would split the board — put it back, try elsewhere
    }
    coords = coords.filter((c) => remaining.has(keyOf(c)));
  }
  const totalCells = coords.length;
  // GAP cells start empty (no gem seeded) but are fully playable
  const gaps = Math.min(Math.max(0, opts.gaps ?? 0), Math.floor(totalCells / 3));

  // pool of minerals sized to fill board + hand (special tiles bury minerals, so they
  // don't reduce the pool count — every cell still starts with a mineral underneath).
  const specialCount = Math.min(nebulites + dross, totalCells - gaps);
  // build mineral pool proportional to MINERAL_QTY, scaled to need.
  // IMPORTANT: Object.keys returns STRINGS — convert to numbers, or every tile
  // value becomes a string and numeric comparisons (combo detection) silently
  // fail (this caused Echoes/Trips not to be recognised).
  const pool: MineralValue[] = [];
  const mineralValues = Object.keys(MINERAL_QTY).map((k) => Number(k) as MineralValue);
  // Use exact GDD ratios for the canonical 91+9 case; otherwise scale.
  const seededCells = totalCells - gaps; // gap cells start without a gem
  if (seededCells === 91 && handSize === 9) {
    mineralValues.forEach((v) => {
      for (let i = 0; i < MINERAL_QTY[v]; i++) pool.push(v);
    });
  } else {
    // Scaled distribution preserving the rarity ladder EXACTLY (largest-remainder
    // apportionment): each mineral gets its proportional floor, then the leftover
    // slots go to the largest fractional parts — no padding with a single type, so
    // a smaller board keeps the same balance as the 103-tile full game.
    const need = seededCells + handSize;
    const totalRatio = Object.values(MINERAL_QTY).reduce((a, b) => a + b, 0);
    const exact = mineralValues.map((v) => ({ v, x: (MINERAL_QTY[v] / totalRatio) * need }));
    const counts = new Map<MineralValue, number>(exact.map(({ v, x }) => [v, Math.floor(x)]));
    let assigned = [...counts.values()].reduce((a, b) => a + b, 0);
    const byFrac = exact.slice().sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)));
    for (let i = 0; assigned < need; i = (i + 1) % byFrac.length, assigned++) {
      counts.set(byFrac[i].v, counts.get(byFrac[i].v)! + 1);
    }
    mineralValues.forEach((v) => {
      for (let i = 0; i < counts.get(v)!; i++) pool.push(v);
    });
  }

  const shuffled = shuffle(pool, rng);
  const boardTiles = shuffled.slice(0, seededCells);
  const hand: TileVal[] = shuffled.slice(seededCells, seededCells + handSize) as MineralValue[];

  const cells = new Map<string, Cell>();
  const order: string[] = [];
  const cellSetLocal = new Set<string>(coords.map(keyOf));
  // which cells start as GAPS (empty but playable)
  const gapKeys = new Set(shuffle(coords.map(keyOf), rng).slice(0, gaps));
  let tileIdx = 0;
  coords.forEach((c) => {
    const k = keyOf(c);
    const tile = gapKeys.has(k) ? null : (boardTiles[tileIdx++] as TileVal);
    cells.set(k, { coord: c, tile, inert: false, buried: null, bonusGem: null });
    order.push(k);
  });

  // precompute adjacency once
  const adj = new Map<string, string[]>();
  coords.forEach((c) => {
    adj.set(keyOf(c), neighbours(c, cellSetLocal).map(keyOf));
  });

  // NEBULITE-REFINE RIG (see NewGameOpts.nebuliteRig): seed a guaranteed 12-tile
  // combo opportunity for BOTH Duneglass (1) and Vigilite (2). Its cells are then
  // held back from the specials / bonus-gem burial so the setup can't be broken.
  const rigCells = new Set<string>();
  if (opts.nebuliteRig) {
    for (const k of seedRefineRigs(cells, adj, order, gapKeys, rng)) rigCells.add(k);
  }

  // drop the Dross + Nebulites onto random OCCUPIED cells, BURYING the mineral beneath
  // (the buried mineral returns to the player's hand when the special later leaves)
  const specials: TileVal[] = [...Array(dross).fill(GLINT), ...Array(nebulites).fill(CORE)].slice(0, specialCount);
  const occupiedKeys = order.filter((k) => cells.get(k)!.tile !== null && !rigCells.has(k));
  const targetKeys = shuffle(occupiedKeys, rng).slice(0, specials.length);
  targetKeys.forEach((k, i) => {
    const cell = cells.get(k)!;
    cell.buried = cell.tile; // the mineral that was here is now buried
    cell.tile = specials[i];
  });

  // ACHIEVEMENT BONUS GEMS: bury Resurrect / Quadriant under plain mineral cells
  // (not the special-covered ones, and one gem per cell). Hidden until revealed.
  const buryBonus: TileVal[] = [];
  if (opts.bonusGems?.resurrect) buryBonus.push(RESURRECT);
  if (opts.bonusGems?.quadriant) buryBonus.push(QUADRIANT);
  if (buryBonus.length) {
    const plain = shuffle(order.filter((k) => {
      const c = cells.get(k)!;
      return c.tile !== null && c.tile !== GLINT && c.tile !== CORE && c.buried === null && !rigCells.has(k);
    }), rng);
    buryBonus.forEach((gem, i) => {
      if (plain[i]) cells.get(plain[i])!.bonusGem = gem;
    });
  }

  return {
    side,
    cells,
    order,
    adj,
    hand,
    startHandSize: handSize,
    collapseAt1,
    collapseAt2,
    shape,
    startShape: shape,
    singularityAt,
    singularityDone: false,
    obstacles: obstacleKeys,
    obstacleSeed,
    score: 0,
    coreBanked: false,
    coresCollected: 0,
    nebulitesRefined: 0,
    drossCleared: 0,
    rngState: (seed ^ 0x9e3779b9) >>> 0,
    hasShrunk: false,
    coreRespawnDisabled: false,
    revealAt: opts.revealAt ?? 4,
    handRevealed: false,
    rescueMode: opts.rescueMode ?? "medium",
    rescueRevealedUsed: false,
    moves: 0,
    endBonus: null,
    gemsLeftPenalty: null,
    scoreBase: 0,
    finalScore: 0,
    endTally: [],
    maxBankScore: 0,
    deathMatch: false,
    zenithUnlocked: !!opts.bonusGems?.zenith,
    zenithDealt: false,
    cashedOut: 0,
    activatedCombos: [],
    activatedCells: [],
    pendingCoveredVal: null,
    pendingCoveredKey: null,
    phase: "playing",
    log: [{ text: opts.openingLog ?? logText("opening"), kind: "info", sticky: !opts.openingLog && logIsSticky("opening") }],
    banks: 0,
    busts: 0,
    freeBanksLeft: 3,
    livesLeft: 3,
    comboCounts: {},
    chainCounts: {},
    coreRespawnPending: 0,
    lastResolved: emptyResolved(),
  };
}

// ---- helpers ----
export function visibleTile(s: GameState): TileVal | null {
  return s.hand.length ? s.hand[0] : null;
}

/**
 * A joker-Core that is already inside an activated combo has LOCKED onto the value
 * it first mirrored. Map its cell key -> that mineral value, so subsequent
 * placements read it as a real tile of that value (e.g. a Nebulite locked as a
 * Duneglass lets a 4th Duneglass extend the Trips into a Quad through it).
 */
export function lockedCoreValues(s: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const combo of s.activatedCombos) {
    let val: number | null = null;
    for (const k of combo.cells) {
      const t = s.cells.get(k)?.tile;
      if (t != null && t !== GLINT && t !== CORE) { val = t as number; break; }
    }
    if (val == null) continue;
    // FIRST combo wins: a Nebulite locks onto the value of the combo it FIRST joined (always
    // a same-value set — a Core only mirrors for a set) and never re-mirrors. Combos are
    // appended, so its original set precedes any later straight it's pulled into; without
    // this guard, that later straight's first mineral would overwrite its locked value.
    for (const k of combo.cells) if (s.cells.get(k)?.tile === CORE && !m.has(k)) m.set(k, val);
  }
  return m;
}

function boardViewFor(s: GameState) {
  const locked = lockedCoreValues(s);
  return makeBoardView(
    s.order,
    s.adj,
    (k) => {
      const lv = locked.get(k);
      if (lv !== undefined) return lv; // locked joker-Core reads as its mirrored value
      const c = s.cells.get(k);
      return c ? c.tile : null;
    },
    new Set(s.activatedCells) // already-activated cells are locked (joker-Core can't re-mirror)
  );
}

/** All cells currently glowing (union of activated combos). */
function activatedSet(s: GameState): Set<string> {
  return new Set(s.activatedCells);
}

/**
 * Given a set of activated cell keys plus a starting cell, return the connected
 * component (edge-adjacency) of activated cells reachable from `start`. Used to
 * find the cluster that a banking placement belongs to — only that cluster
 * banks; disconnected activated combos elsewhere stay in play.
 */
function activatedCluster(s: GameState, activatedKeys: Set<string>, start: string): Set<string> {
  const out = new Set<string>();
  if (!activatedKeys.has(start)) return out;
  const stack = [start];
  while (stack.length) {
    const k = stack.pop()!;
    if (out.has(k)) continue;
    out.add(k);
    for (const nb of s.adj.get(k) ?? []) {
      if (activatedKeys.has(nb) && !out.has(nb)) stack.push(nb);
    }
  }
  return out;
}

/** The mineral value a prior activated combo is made of (null if mixed/straight). */
function priorComboValue(s: GameState, combo: { cells: string[] }): number | null {
  let val: number | null = null;
  for (const k of combo.cells) {
    const t = s.cells.get(k)?.tile;
    if (t === null || t === undefined) return null;
    if (t === GLINT) return null;
    if (t === CORE) continue; // a joker-Core mirrors; skip for value detection
    if (val === null) val = t as number;
    else if (val !== t) return null; // mixed values -> a straight, not a same-value set
  }
  return val;
}

/**
 * Is the given prior combo part of the SAME connected same-value blob that the
 * just-placed tile belongs to? Walks the same-value connected region (value `val`)
 * from the placed cell across the cluster; if it reaches any of the combo's cells,
 * they're one blob.
 */
function isSameValueConnected(
  s: GameState,
  combo: { cells: string[] },
  placedKey: string,
  val: number,
  cluster: Set<string>
): boolean {
  const comboSet = new Set(combo.cells);
  const seen = new Set<string>();
  const stack = [placedKey];
  const valueAt = (k: string): number | null => {
    if (k === placedKey) return val;
    const t = s.cells.get(k)?.tile ?? null;
    return t === CORE ? val : t; // treat a joker-Core in the blob as matching
  };
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    if (k !== placedKey && valueAt(k) !== val) continue;
    seen.add(k);
    if (comboSet.has(k)) return true;
    for (const nb of s.adj.get(k) ?? []) {
      if (!seen.has(nb) && cluster.has(nb)) stack.push(nb);
    }
  }
  return false;
}

// ---- same-value merge naming ------------------------------------------------
// When pre-activated same-value combos are bridged into ONE banked cluster (e.g. a
// Pentad + a Trips joined by a placed Duneglass = 9 tiles), the cluster must be
// named as a decomposition of its actual tile count — NOT as the overlapping combos
// (which would over-count, e.g. "Hex + Pentad" = 11 for 9 tiles). We keep the
// largest pre-existing combo intact and fill the rest with the largest valid sets,
// so the names always sum to the banked tile count (see the failsafe in place()).

/** Valid matched-set sizes for a value (Echo=2 only exists for 2s and 6s). */
function validSetSizes(v: number): number[] {
  return v === 2 || v === 6 ? [6, 5, 4, 3, 2] : [6, 5, 4, 3];
}
function comboForSize(size: number): ComboName {
  return size === 6 ? "Hex" : size === 5 ? "Pentad" : size === 4 ? "Quad" : size === 3 ? "Trips" : "Echo";
}
/** Split n same-value tiles into valid set sizes (largest-first, never leaving an
 *  un-splittable remainder of 1). */
function greedySplitSizes(n: number, v: number): number[] {
  const sizes = validSetSizes(v);
  const minValid = sizes[sizes.length - 1];
  const out: number[] = [];
  let rem = n;
  while (rem > 0) {
    let pick = 0;
    for (const sz of sizes) {
      if (sz > rem) continue;
      const left = rem - sz;
      if (left === 0 || left >= minValid) { pick = sz; break; }
    }
    if (!pick) pick = Math.min(rem, sizes[0]); // safety for n below minValid
    out.push(pick);
    rem -= pick;
  }
  return out;
}
/** Name a same-value merge of `n` tiles, keeping a combo of size `keepLargest`
 *  intact when the remainder is still splittable. */
function nameSameValueMerge(n: number, v: number, keepLargest: number): ComboName[] {
  const sizes = validSetSizes(v);
  const minValid = sizes[sizes.length - 1];
  const keepL = Math.min(keepLargest, n);
  const rem = n - keepL;
  if (keepL >= minValid && keepL <= 6 && (rem === 0 || rem >= minValid)) {
    return [comboForSize(keepL), ...greedySplitSizes(rem, v).map(comboForSize)];
  }
  return greedySplitSizes(n, v).map(comboForSize);
}
/** The most common mineral value among a cluster's tiles (Glints/Cores ignored; a
 *  locked joker-Core counts as the value it mirrored). Falls back to 1. */
function dominantClusterValue(s: GameState, cluster: Set<string>): number {
  const locked = lockedCoreValues(s);
  const cnt = new Map<number, number>();
  for (const k of cluster) {
    let v = locked.get(k);
    if (v === undefined) {
      const t = s.cells.get(k)?.tile;
      if (t == null || t === GLINT || t === CORE) continue;
      v = t as number;
    }
    cnt.set(v, (cnt.get(v) ?? 0) + 1);
  }
  let best = 1, bestN = -1;
  for (const [v, n] of cnt) if (n > bestN) { best = v; bestN = n; }
  return best;
}

/**
 * THE CORE RULE.
 * Plan placing the visible tile at cellKey. The placement ACTIVATES a whole
 * combo by absorbing the connected matching board tiles around it. The combo is
 * added to the activated pool and STAYS highlighted — it does not need to touch
 * any previously-activated tiles. A bank happens when the connected cluster of
 * activated tiles containing this placement reaches 6+ tiles; only that cluster
 * banks and clears. Disconnected activated combos elsewhere remain in play.
 */
export interface MovePlan {
  cellKey: string;
  covers: boolean;
  coveredVal: TileVal | null;
  newCombos: ActivatedCombo[]; // the combo(s) this placement activates (1 or 2)
  clusterCells: string[]; // the connected activated cluster this placement is part of
  clusterComboNames: ComboName[]; // combo names within that cluster (for scoring)
  totalTiles: number; // tiles in the connected cluster (the bank-relevant count)
  banks: boolean;
  multiplier: number;
  isLegalBuild: boolean;
  // ZENITH wildcard: the concrete mineral value it fills in as (chosen for the
  // best combo). place() stores this value + a zenithFill flag on the cell.
  wildValue?: number;
}

export function planMove(s: GameState, cellKey: string, choice = 0): MovePlan | null {
  const tile = visibleTile(s);
  if (tile === null) return null;
  if (!s.cells.get(cellKey)) return null;
  // A Glint can never form a combo: placing it is always a bust.
  if (tile === GLINT) return failPlan(s, cellKey);
  // A Nebulite (Core) held in the hand is a WILD — it takes whatever mineral value
  // forms the best legal combo with its neighbours (see planWild). Wilds keep the
  // engine's automatic pick (no choice picker) for now.
  if (tile === CORE) return planWild(s, cellKey);
  // ZENITH (dealt at GLINT RUSH) is a universal filler: it fills the missing spot
  // in ANY set or drift. Same "try all values, pick the best combo" search, but the
  // winning value is tagged so place() stores it as a concrete mineral + fill flag.
  if (tile === ZENITH) return planZenithWild(s, cellKey);
  return planMoveAs(s, cellKey, tile as number, choice);
}

/** A "this placement busts" plan (no legal combo formed). */
function failPlan(s: GameState, cellKey: string): MovePlan {
  const cell = s.cells.get(cellKey);
  return {
    cellKey,
    covers: !!cell && cell.tile !== null,
    coveredVal: cell ? cell.tile : null,
    newCombos: [],
    clusterCells: [],
    clusterComboNames: [],
    totalTiles: 0,
    banks: false,
    multiplier: 1,
    isLegalBuild: false,
  };
}

/**
 * A placed Nebulite (Core) is a wildcard: it becomes whichever of the six minerals
 * yields the HIGHEST-scoring outcome given its surroundings. We simulate placing
 * each value 1..6, score the resulting combo, and auto-commit the best one — a bank
 * always beats a non-bank, banks are ranked by their actual scored points, and
 * non-banks by how many tiles they light up (closest to a future bank). On commit
 * the tile is stored as a Core, so the joker-Core reward (+500 and respawn) fires
 * when its cluster banks.
 */
function planWild(s: GameState, cellKey: string): MovePlan {
  let best: MovePlan | null = null;
  let bestScore = -1;
  for (let v = 1; v <= 6; v++) {
    const p = planMoveAs(s, cellKey, v);
    if (!p || !p.isLegalBuild) continue;
    const sc = wildScore(p);
    if (!best || sc > bestScore) { best = p; bestScore = sc; }
  }
  return best ?? failPlan(s, cellKey);
}
/** ZENITH wildcard: like planWild, but tags the winning value so place() stores a
 *  concrete mineral (+ the zenithFill flag) rather than a re-mirroring joker. */
function planZenithWild(s: GameState, cellKey: string): MovePlan {
  let best: MovePlan | null = null;
  let bestScore = -1;
  let bestVal = 0;
  for (let v = 1; v <= 6; v++) {
    const p = planMoveAs(s, cellKey, v);
    if (!p || !p.isLegalBuild) continue;
    const sc = wildScore(p);
    if (!best || sc > bestScore) { best = p; bestScore = sc; bestVal = v; }
  }
  if (!best) return failPlan(s, cellKey);
  best.wildValue = bestVal;
  return best;
}

/** Ranking key for a candidate wild value: any bank (by scored points) beats any
 *  non-banking activation (ranked by cluster size). */
function wildScore(p: MovePlan): number {
  if (p.banks) {
    const coveredCore = p.coveredVal === CORE;
    const scored = scoreBank({ names: p.clusterComboNames, multiplier: p.multiplier, coveredCore });
    return 1_000_000 + scored.total; // banks dominate; break ties by real score
  }
  return p.totalTiles; // non-banking: prefer the value that lights up the most tiles
}

/** Plan placing a specific mineral value `placedVal` at `cellKey`. */
function planMoveAs(s: GameState, cellKey: string, placedVal: number, choice = 0): MovePlan | null {
  const cell = s.cells.get(cellKey);
  if (!cell) return null;
  const coveredVal = cell.tile;
  const fail = (): MovePlan => failPlan(s, cellKey);

  // Can't target a cell already part of the activated glow.
  if (s.activatedCells.includes(cellKey)) return null;

  // Detect the combo(s) this single placement would activate, absorbing connected
  // matching board tiles. A placement can sit in up to TWO combos (a set + a
  // straight, or two straights). (No requirement to touch prior activations.)
  const view = boardViewFor(s);
  // choice 0 is the engine's classic best pick; other indices are the player's
  // alternative resolutions from the pre-select-and-confirm picker
  const all = enumerateActivationChoices(cellKey, placedVal, view);
  const combos = all[Math.min(Math.max(0, choice), Math.max(0, all.length - 1))] ?? [];

  // No valid combo formed by this placement -> illegal (would bust).
  if (combos.length === 0) return fail();

  // At least the placed cell must be newly activated.
  const existing = activatedSet(s);
  const allComboCells = new Set<string>();
  for (const c of combos) for (const k of c.cells) allComboCells.add(k);
  const newCells = [...allComboCells].filter((k) => !existing.has(k));
  if (newCells.length === 0) return fail();

  // Build the hypothetical full activated set (existing + all new combo cells).
  const activatedAfter = new Set<string>(existing);
  for (const k of allComboCells) activatedAfter.add(k);

  // The connected cluster containing the placed cell determines banking.
  const cluster = activatedCluster(s, activatedAfter, cellKey);
  const clusterCells = [...cluster];
  const totalTiles = cluster.size;

  // Combo names within this cluster. The NEW combos from this placement are always
  // counted. A PRIOR activated combo only adds its name if it is a genuinely
  // SEPARATE combo merging in — i.e. its tiles are not already represented by the
  // new combos. This prevents a same-value group that grows past 6 (e.g. bridging
  // two Trips of the same mineral into a 7-blob) from being mis-scored as
  // "Hex + Trips" — it is one Hex, with the extra tile overflowing to the hand.
  let clusterComboNames: ComboName[] = combos.map((c) => c.name);
  const newComboCells = allComboCells; // cells covered by this placement's combos
  for (const c of s.activatedCombos) {
    if (!c.cells.some((k) => cluster.has(k))) continue; // not in this cluster
    // Is this prior combo already represented by the new combos? If all of its
    // cells are within the new combo cells, OR it is the SAME-VALUE blob the new
    // combo already covers, it must NOT be counted again.
    const allCovered = c.cells.every((k) => newComboCells.has(k));
    if (allCovered) continue;
    // Otherwise, check value: if this prior combo is the SAME mineral value as the
    // placed tile and is connected into the same same-value blob, it is part of the
    // one big same-value group — skip (the overflow rule handles its tiles).
    const priorVal = priorComboValue(s, c);
    const sameValueAsBlob =
      priorVal !== null && priorVal === placedVal && isSameValueConnected(s, c, cellKey, placedVal, cluster);
    if (sameValueAsBlob) continue;
    clusterComboNames.push(c.name);
  }

  // SAME-VALUE MERGE: if the whole banked cluster is same-value sets of the placed
  // value (pre-activated combos bridged into one blob), re-name it as a decomposition
  // of the banked tile count so the log/score match the tiles — e.g. Pentad + Quad
  // (9), never Hex + Pentad (11). The largest pre-existing combo is kept intact. Only
  // up to two Hexes (12) are named; a cluster larger than that is vanishingly rare and
  // its extra tiles simply aren't named.
  const isRun = (n: ComboName) => n === "Drift" || n === "LongDrift" || n === "FullDrift";
  const priorInCluster = s.activatedCombos.filter((c) => c.cells.some((k) => cluster.has(k)));
  const newAllSets = combos.every((c) => !isRun(c.name));
  const priorPureSameValue =
    priorInCluster.length > 0 &&
    priorInCluster.every((c) => !isRun(c.name) && priorComboValue(s, c) === placedVal);
  if (newAllSets && priorPureSameValue) {
    const keepLargest = Math.max(...priorInCluster.map((c) => c.cells.length));
    clusterComboNames = nameSameValueMerge(Math.min(totalTiles, 12), placedVal, keepLargest);
  }

  // Banks when the connected cluster reaches the threshold. In GLINT RUSH (the final
  // 37-cell board) the threshold drops to 2 — ANY combo you form banks immediately.
  const banks = totalTiles >= (s.deathMatch ? 2 : BANK_THRESHOLD);

  // Multiplier = value of the tile covered by THIS finishing placement.
  const multiplier =
    banks && coveredVal !== null && coveredVal !== GLINT && coveredVal !== CORE
      ? (coveredVal as number)
      : 1;

  return {
    cellKey,
    covers: cell.tile !== null,
    coveredVal,
    newCombos: combos,
    clusterCells,
    clusterComboNames,
    totalTiles,
    banks,
    multiplier,
    isLegalBuild: true,
  };
}

/** Is a placement at cellKey legal (forms a valid combo that connects)? */
export function isLegalTarget(s: GameState, cellKey: string): boolean {
  const plan = planMove(s, cellKey);
  return !!plan && plan.isLegalBuild;
}

/** Are there ANY legal moves for the visible tile? */
export function hasAnyLegalMove(s: GameState): boolean {
  if (visibleTile(s) === null) return false;
  for (const k of s.order) {
    if (s.activatedCells.includes(k)) continue;
    if (isLegalTarget(s, k)) return true;
  }
  return false;
}

// ---- mutations (return a NEW state; UI replaces its state) ----
function clone(s: GameState): GameState {
  const cells = new Map<string, Cell>();
  for (const [k, c] of s.cells) cells.set(k, { coord: c.coord, tile: c.tile, inert: c.inert, buried: c.buried, bonusGem: c.bonusGem, zenithFill: c.zenithFill });
  return {
    ...s,
    cells,
    order: s.order,
    adj: s.adj,
    hand: s.hand.slice(),
    activatedCombos: s.activatedCombos.map((c) => ({ name: c.name, cells: c.cells.slice() })),
    activatedCells: s.activatedCells.slice(),
    // deep-copy the end-of-run tally too — a shared reference let describePlace's
    // internal (discarded) previews push duplicate entries onto the real state.
    endTally: s.endTally.slice(),
    log: s.log.slice(),
    comboCounts: { ...s.comboCounts },
    chainCounts: { ...s.chainCounts },
  };
}

function pushLog(s: GameState, e: LogEntry) {
  s.log = [e, ...s.log].slice(0, 40);
}

function isEmptyBoard(s: GameState): boolean {
  for (const k of s.order) if (s.cells.get(k)!.tile !== null) return false;
  return true;
}

function countOccupied(s: GameState): number {
  let n = 0;
  for (const k of s.order) if (s.cells.get(k)!.tile !== null) n++;
  return n;
}

/**
 * THE ABYSS COLLAPSES. When the side-6 board drops to SHRINK_TRIGGER occupied
 * tiles, collapse it to side-5, remapping tiles inward (pre-banked combos first).
 * This re-concentrates stranded tiles so a full clear becomes reachable. Fires
 * once. After it, the Core respawns one FINAL time and then never again.
 */
/**
 * THE SINGULARITY — a shaped board's reduction to the standard hexagon. When
 * occupancy drops to singularityAt (always tuned ABOVE collapseAt1 — it can
 * never fire after the first collapse), every wedge cell beyond the 91-hex
 * drops into the abyss with whatever sits on it: discarded, unscored, not to
 * hand. Activated combos caught by the drop dissolve WITHOUT penalty; their
 * surviving tiles stay on the board, de-activated.
 */
function maybeSingularity(s: GameState): void {
  if (s.shape === "hexagon" || s.singularityDone || s.hasShrunk) return;
  if (countOccupied(s) > s.singularityAt) return;
  s.singularityDone = true;
  const hexSet = new Set(hexCells(s.side).map(keyOf));
  const falling = s.order.filter((k) => !hexSet.has(k));
  s.shape = "hexagon";
  if (falling.length === 0) return;
  const fallSet = new Set(falling);
  s.lastResolved.singularity = { cells: falling.map((k) => ({ key: k, tile: s.cells.get(k)!.tile })) };
  // combos touching a falling cell dissolve — no unbanked-combo penalty; the
  // abyss took them, the player didn't fail. Survivors inside keep glowing.
  s.activatedCombos = s.activatedCombos.filter((c) => !c.cells.some((k) => fallSet.has(k)));
  s.activatedCells = s.activatedCells.filter((k) => s.activatedCombos.some((c) => c.cells.includes(k)));
  if (s.pendingCoveredKey && fallSet.has(s.pendingCoveredKey)) {
    s.pendingCoveredKey = null;
    s.pendingCoveredVal = null;
  }
  // the wedge cells cease to exist; the board is the standard hexagon again
  s.order = s.order.filter((k) => !fallSet.has(k));
  for (const k of falling) s.cells.delete(k);
  s.obstacles = s.obstacles.filter((k) => hexSet.has(k));
  const remaining = new Set(s.order);
  const adj = new Map<string, string[]>();
  for (const k of s.order) adj.set(k, neighbours(parseKey(k), remaining).map(keyOf));
  s.adj = adj;
  pushLog(s, { text: logText("singularity", { count: falling.length }), kind: "core", sticky: logIsSticky("singularity") });
}

function maybeShrink(s: GameState, rng: () => number): void {
  // The SINGULARITY resolves first (it is always tuned to fire before the first
  // collapse); dropping the wedges can lower occupancy enough to chain straight
  // into a collapse, which the UI then plays as a second beat.
  maybeSingularity(s);
  // Two collapses: side-6 -> side-5 at 30 occupied, then side-5 -> side-4 (the final
  // GLINT RUSH board) at 15 occupied.
  const occ = countOccupied(s);
  let toSide: 5 | 4;
  if (s.side === 6 && occ <= s.collapseAt1) toSide = 5;
  else if (s.side === 5 && occ <= s.collapseAt2) toSide = 4;
  else {
    // A board that STARTS at side 4 (e.g. the Tutorial level) never collapses —
    // but GLINT RUSH still arms at the same occupancy the final collapse would
    // have (collapseAt2). Only the contraction is skipped.
    if (s.side === 4 && !s.deathMatch && occ <= s.collapseAt2) {
      s.deathMatch = true;
      // GLINT RUSH = no more Core respawns, on EVERY board — including ones
      // that started at side 4 and never collapse (the flag used to be set
      // only by the first-collapse branch, which these boards never reach)
      s.coreRespawnDisabled = true;
      dealZenith(s);
      pushLog(s, { text: logText("rushArmed"), kind: "rush", sticky: logIsSticky("rushArmed") });
      pushLog(s, { text: logText("rushWheel"), kind: "rush", sticky: logIsSticky("rushWheel") });
    }
    return;
  }
  const isFinal = toSide === 4;

  const result = shrinkBoard({
    fromSide: s.side,
    toSide,
    cells: s.cells as any,
    order: s.order,
    activatedCombos: s.activatedCombos.map((c) => ({ name: c.name, cells: c.cells })),
    obstacles: s.obstacles,
  });

  // adopt the new board
  s.side = result.side;
  s.cells = result.cells as any;
  s.order = result.order;
  s.adj = result.adj;
  s.activatedCombos = result.activatedCombos.map((c) => ({ name: c.name as ComboName, cells: c.cells }));
  s.activatedCells = [...new Set(s.activatedCombos.flatMap((c) => c.cells))];
  s.obstacles = result.obstacles; // central holes survive (≤60%), rim holes vanish
  s.hasShrunk = true;
  // a bonus gem whose covering tile was discarded by the collapse still pays out
  // (you earned the ability) — resolve each orphan the collapse handed back
  for (const gem of result.orphanedBonus ?? []) {
    if (isBonusGem(gem as TileVal)) resolveBonusGem(s, "collapsed", gem as BonusGem);
  }
  // pending covered refs no longer valid after a remap
  s.pendingCoveredKey = null;
  s.pendingCoveredVal = null;

  // record the movement for the UI animation
  s.lastResolved.shrunk = {
    mapping: [...result.mapping.entries()].map(([from, to]) => ({ from, to })),
    final: isFinal,
  };

  if (isFinal) {
    // GLINT RUSH: the final round — any combo banks immediately, banks are infinite.
    s.deathMatch = true;
    // no Core respawns from here (also covers side-5 starts, whose ONLY
    // collapse is the final one — the else branch never ran for them)
    s.coreRespawnDisabled = true;
    dealZenith(s);
    pushLog(s, { text: logText("collapse", { cells: 37 }), kind: "core", sticky: logIsSticky("collapse") });
    pushLog(s, { text: logText("rushArmed"), kind: "rush", sticky: logIsSticky("rushArmed") });
    pushLog(s, { text: logText("rushWheel"), kind: "rush", sticky: logIsSticky("rushWheel") });
  } else {
    pushLog(s, { text: logText("collapse", { cells: 61 }), kind: "core", sticky: logIsSticky("collapse") });
    // endgame Core rule: respawn the Core one final time at the first collapse, then
    // never again. If a Core is already on the (new) board, leave it; otherwise place one.
    const coreOnBoard = s.order.some((k) => s.cells.get(k)!.tile === CORE);
    if (!coreOnBoard) {
      const at = respawnCore(s, rng);
      if (at) s.lastResolved.coreRespawnedAt = at;
    }
    s.coreRespawnPending = 0;
    s.coreRespawnDisabled = true; // from now on, a cleared Core does NOT respawn
  }
}

/**
 * Collapse (if a trigger is owed), resolve what the collapse or a Rule-5 reshuffle left
 * isolated, and — crucially — RE-CHECK, because that isolation pass itself removes tiles.
 *
 * The isolation pass banks/discards tiles, which can drop occupancy across a trigger the
 * FIRST shrink check — run BEFORE those tiles had left — could not see. Checking once
 * would leave that collapse "owed": it would then fire on a LATER move (e.g. a covering
 * activation that keeps occupancy at the trigger), snapping the board mid-action with no
 * banner. Re-checking here guarantees a collapse always resolves on the turn its tiles
 * actually leave, so the collapse beat plays cleanly and never mid-interaction.
 *
 * `resolveIso` is the caller's isolation pass (banks for a place / bank; a bust discards).
 * `afterShrink` (optional) runs right after each collapse — the bust path uses it to
 * follow its inert tile through a late collapse's remap.
 * The re-check re-runs the isolation pass ONLY after an actual collapse (to clean up what
 * that collapse strands), so normal isolation behaviour is otherwise unchanged.
 */
function settleCollapse(s: GameState, resolveIso: (s: GameState) => void, afterShrink?: (s: GameState) => void): void {
  // First pass: the classic order — collapse if already owed, then resolve isolation.
  // `afterShrink` (the bust's inert-tile remap) runs ONLY when THIS maybeShrink actually
  // collapsed — never off a stale s.lastResolved.shrunk left by an earlier check, which
  // would re-apply the mapping and corrupt the inert-tile ref.
  let side = s.side, sing = s.singularityDone;
  maybeShrink(s, stateRng(s));
  if (s.side !== side || s.singularityDone !== sing) afterShrink?.(s);
  resolveIso(s);
  // The isolation removals above may have crossed a trigger; if a collapse is now owed,
  // perform it and clean up only what THAT collapse strands, until none is owed.
  // Bounded: side only 6→5→4 and the singularity fires once.
  for (let guard = 0; guard < 4; guard++) {
    side = s.side; sing = s.singularityDone;
    maybeShrink(s, stateRng(s));
    if (s.side === side && s.singularityDone === sing) break; // no new collapse -> done
    afterShrink?.(s); // a collapse happened this pass -> remap the inert tile through it
    resolveIso(s);
  }
}

/**
 * Resolve tiles cut off from the rest of the board after a clear.
 *
 * A "cut-off group" is a connected component (ignoring gaps) whose tiles touch no
 * other occupied cell. We handle:
 *   - size 1 (isolated single): banks for FACE VALUE, flies up to the score.
 *       mineral -> value x100 ; Core -> 500 (counts as collected) ; Glint -> 0.
 *   - size 2 (isolated PAIR, same value, Rule 6): the LEFT/TOP tile banks for face
 *       value (flies to score); the other goes to the player's HAND.
 *   - size 3+ : nothing happens (they stay on the board).
 *
 * Whenever a Glint or Core is removed this way, any mineral BURIED beneath it
 * returns to the player's hand.
 *
 * Returns what happened so the UI can animate it, plus flags for Glint-cleared
 * (Rule 5 reshuffle) and Core-cleared (Rule 2 respawn).
 */
function resolveIsolatedTiles(s: GameState): {
  banked: { key: string; value: number; points: number }[];
  toHand: { key: string; value: number }[];
  buriedToHand: { key: string; value: number }[];
  glintCleared: boolean;
  coreCleared: boolean;
} {
  const banked: { key: string; value: number; points: number }[] = [];
  const toHand: { key: string; value: number }[] = [];
  const buriedToHand: { key: string; value: number }[] = [];
  let glintCleared = false;
  let coreCleared = false;

  const px = (k: string) => {
    const c = s.cells.get(k)!.coord;
    // pointy-top axial -> pixel-ish (only relative order matters for left/top)
    return { x: c.q + c.r / 2, y: c.r };
  };
  // "left/top" = smaller y (higher up); tie-break smaller x (further left)
  const leftTopFirst = (a: string, b: string) => {
    const pa = px(a), pb = px(b);
    if (pa.y !== pb.y) return pa.y - pb.y;
    return pa.x - pb.x;
  };

  const pointsFor = (t: TileVal): number =>
    t === GLINT ? 0 : t === CORE ? CORE_BONUS : (t as number) * 100;

  const removeTile = (k: string) => {
    const cell = s.cells.get(k)!;
    const t = cell.tile;
    if (t === GLINT) { glintCleared = true; s.drossCleared += 1; }
    if (t === CORE) { coreCleared = true; s.coreBanked = true; s.coresCollected += 1; }
    // recover any buried mineral to the hand
    if ((t === GLINT || t === CORE) && cell.buried !== null && cell.buried !== GLINT && cell.buried !== CORE) {
      s.hand.push(cell.buried);
      buriedToHand.push({ key: k, value: cell.buried as number });
    }
    cell.tile = null;
    cell.inert = false;
    cell.buried = null;
  };

  // find cut-off components among occupied cells
  const seen = new Set<string>();
  for (const start of s.order) {
    if (seen.has(start)) continue;
    if (s.cells.get(start)!.tile === null) continue;
    // BFS the connected occupied component
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const k = queue.shift()!;
      comp.push(k);
      for (const nb of s.adj.get(k) ?? []) {
        if (!seen.has(nb) && s.cells.get(nb)!.tile !== null) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }

    if (comp.length === 1) {
      const k = comp[0];
      if (s.cells.get(k)!.inert) continue; // dead inert tiles block connectivity but never bank
      const cellK = s.cells.get(k)!;
      const t = cellK.tile!;
      let points = pointsFor(t);
      // QUADRIANT revealed by ISOLATION quadruples the isolated tile's value
      if (cellK.bonusGem === QUADRIANT) {
        const before = points;
        points *= 4;
        cellK.bonusGem = null;
        s.lastResolved.bonusRevealed.push({ key: k, gem: QUADRIANT, effect: "quad", coveredValue: before, bonus: points - before });
        pushLog(s, { text: logText("quadriantRevealed", { face: before, bonus: points - before }), kind: "core", sticky: logIsSticky("quadriantRevealed") });
      }
      s.score += points;
      banked.push({ key: k, value: t as number, points });
      removeTile(k);
    } else if (comp.length === 2) {
      // Rule 6: isolated pair. Only applies when BOTH are the same value and both
      // are plain tiles (not part of an activated combo, and not inert).
      const [a, b] = comp;
      const ta = s.cells.get(a)!.tile!;
      const tb = s.cells.get(b)!.tile!;
      const bothActivated = s.activatedCells.includes(a) || s.activatedCells.includes(b);
      const eitherInert = s.cells.get(a)!.inert || s.cells.get(b)!.inert;
      if (ta === tb && !bothActivated && !eitherInert) {
        const ordered = [a, b].sort(leftTopFirst);
        if (ta === GLINT) {
          // EXCEPTION — a pair of Dross: bank BOTH (worth 0, both fly to the score).
          // We never hand a worthless Dross back to the player. Any minerals buried
          // beneath them still return to the hand (removeTile handles that).
          for (const k of ordered) {
            banked.push({ key: k, value: GLINT, points: 0 });
            removeTile(k);
          }
        } else {
          // normal pair: the left/top tile banks; the other returns to the hand.
          const bankKey = ordered[0];
          const handKey = ordered[1];
          const points = pointsFor(ta);
          s.score += points;
          banked.push({ key: bankKey, value: ta as number, points });
          removeTile(bankKey);
          const handVal = s.cells.get(handKey)!.tile!;
          if (handVal !== GLINT && handVal !== CORE) {
            s.hand.push(handVal);
            toHand.push({ key: handKey, value: handVal as number });
          }
          removeTile(handKey);
        }
      }
      // if not a same-value plain pair, leave them on the board
    }
    // size 3+ : leave on the board
  }

  // logs
  const scoring = banked.filter((b) => b.points > 0).length;
  if (scoring > 0) {
    pushLog(s, { text: logText("isolatedBanked", { tileWord: scoring === 1 ? "tile" : "tiles" }), kind: "bank", sticky: logIsSticky("isolatedBanked") });
  }
  if (toHand.length > 0) {
    pushLog(s, { text: logText("isolatedPair"), kind: "info", sticky: logIsSticky("isolatedPair") });
  }
  if (banked.some((b) => b.value === GLINT)) {
    pushLog(s, { text: logText("drossIsolated"), kind: "glint", sticky: logIsSticky("drossIsolated") });
  }
  if (buriedToHand.length > 0) {
    pushLog(s, { text: logText("buriedRecovered", { count: buriedToHand.length, plural: buriedToHand.length === 1 ? "" : "s" }), kind: "info", sticky: logIsSticky("buriedRecovered") });
  }

  return { banked, toHand, buriedToHand, glintCleared, coreCleared };
}

/**
 * Run isolated-tile resolution and fold the results into s.lastResolved, also
 * triggering Rule 5 (Glint clear -> reshuffle unrevealed hand) and arming Rule 2
 * (Core clear -> respawn after the next placement). Call after any bank/bust clear.
 */
function applyResolution(s: GameState, rng: () => number, skipReshuffle = false): void {
  const r = resolveIsolatedTiles(s);
  s.lastResolved.isolatedToScore.push(...r.banked);
  s.lastResolved.pairToHand.push(...r.toHand);
  s.lastResolved.buriedToHand.push(...r.buriedToHand);

  // RULE 5: clearing a Glint reshuffles the unrevealed hand AND nudges the board
  // (a random 1-6 tiles each drift one cell). Always happens on a Glint clear,
  // regardless of how many tiles are in hand or on the board. Skipped on the bust
  // path, which runs its own reshuffle+nudge afterwards (avoids doing it twice).
  if (!skipReshuffle && r.glintCleared) {
    reshuffleHand(s, rng);
    const moved = nudgeBoard(s, rng);
    if (s.lastResolved.nudged.length === 0) s.lastResolved.nudged = moved;
    s.lastResolved.reshuffled = true;
    keepLastPairConnected(s);
    pushLog(s, { text: logText("drossCleared"), kind: "glint", sticky: logIsSticky("drossCleared") });
  }

  // RULE 2: a cleared Core respawns one placement later — unless respawns have
  // been disabled (after the endgame shrink), in which case the Core stays gone.
  if (r.coreCleared && !s.coreRespawnDisabled) {
    s.coreRespawnPending = 1;
  }
}

/** GLINT RUSH guard: with exactly TWO tiles left and busts to spare, a shuffle
 *  must not hand out a free win by splitting them (two isolated singles would
 *  sweep — board cleared). The player either finds the combo or SACRIFICES a
 *  bust to clear: that choice stays theirs. Easy difficulty keeps the lucky
 *  win; so does a player down to their final life. */
function keepLastPairConnected(s: GameState): void {
  if (!s.deathMatch || s.rescueMode === "easy") return;
  if (s.livesLeft < 2) return;
  const occ = s.order.filter((k) => s.cells.get(k)!.tile !== null);
  if (occ.length !== 2) return;
  const [a, b] = occ;
  if ((s.adj.get(a) ?? []).includes(b)) return;
  // slide one tile back next to the other (reads as part of the shuffle)
  for (const to of s.adj.get(b) ?? []) {
    if (s.cells.get(to)!.tile === null) {
      const src = s.cells.get(a)!;
      const dst = s.cells.get(to)!;
      dst.tile = src.tile;
      dst.inert = src.inert;
      dst.buried = src.buried;
      if (src.bonusGem) { dst.bonusGem = src.bonusGem; src.bonusGem = null; }
      src.tile = null;
      src.inert = false;
      src.buried = null;
      s.lastResolved.nudged.push({ from: a, to });
      if (s.lastResolved.inertAt === a) s.lastResolved.inertAt = to;
      return;
    }
  }
}

/**
 * Resolve tiles left isolated by a COLLAPSE or a RESHUFFLE (both run AFTER the
 * initial clear/resolution). Any single tile with no neighbours banks; any isolated
 * same-value pair banks one + returns the other to the hand — exactly like the
 * immediate resolution, but recorded in `lateIsolated` so the UI can animate it
 * once the board has settled. One pass clears every currently-isolated single/pair
 * (isolated components can't disconnect each other). No further reshuffle is
 * triggered here, to avoid cascades.
 */
function resolveLateIsolation(s: GameState): void {
  const r = resolveIsolatedTiles(s);
  const li = s.lastResolved.lateIsolated;
  li.banked.push(...r.banked);
  li.toHand.push(...r.toHand);
  li.buried.push(...r.buriedToHand);
  if (r.coreCleared && !s.coreRespawnDisabled) s.coreRespawnPending = 1;
}

/**
 * The BUST-path counterpart of resolveLateIsolation: tiles left isolated in a
 * bust's wake (the cluster loss + forced drop + reshuffle) are DISCARDED —
 * no points, nothing to the hand, no Dross/Nebulite credit. Same trigger
 * conditions as normal isolation (lone tiles; same-value plain pairs; inert
 * tiles never resolve), looped until stable. Records the removals in
 * lastResolved.lateDiscarded for the UI to poof away.
 */
function discardLateIsolation(s: GameState): void {
  const discarded = s.lastResolved.lateDiscarded;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    const drop = (k: string) => {
      const cell = s.cells.get(k)!;
      discarded.push({ key: k, value: cell.tile as number });
      cell.tile = null;
      cell.inert = false;
      cell.buried = null;
      changed = true;
    };
    const seen = new Set<string>();
    for (const start of s.order) {
      if (seen.has(start) || s.cells.get(start)!.tile === null) continue;
      const comp: string[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const k = queue.shift()!;
        comp.push(k);
        for (const nb of s.adj.get(k) ?? []) {
          if (!seen.has(nb) && s.cells.get(nb)!.tile !== null) {
            seen.add(nb);
            queue.push(nb);
          }
        }
      }
      if (comp.length === 1) {
        if (s.cells.get(comp[0])!.inert) continue; // inert blockers stay, as ever
        drop(comp[0]);
      } else if (comp.length === 2) {
        const [a, b] = comp;
        const ta = s.cells.get(a)!.tile!;
        const tb = s.cells.get(b)!.tile!;
        const eitherInert = s.cells.get(a)!.inert || s.cells.get(b)!.inert;
        if (ta === tb && !eitherInert) {
          drop(a);
          drop(b);
        }
      }
    }
  }
  if (discarded.length > 0) {
    pushLog(s, {
      text: logText("bustIsolatedDiscarded", { count: discarded.length, plural: discarded.length === 1 ? "" : "s" }),
      kind: "bust",
    });
  }
}

/** Reshuffle the UNREVEALED hand (everything behind the current "now placing"
 *  tile). Values are fixed; only the order changes. Always runs. */
function reshuffleHand(s: GameState, rng: () => number): boolean {
  if (s.hand.length <= 1) return false; // only the visible tile remains — nothing behind it
  const head = s.hand[0];
  const rest = shuffle(s.hand.slice(1), rng);
  s.hand = [head, ...rest];
  return true;
}

/**
 * Board nudge (paired with a reshuffle): pick a random number (1..6) of board
 * tiles, EXCLUDING any pre-banked (activated) tiles, and move each chosen tile by
 * ONE cell into a random EMPTY adjacent cell. A tile with no empty neighbour stays
 * put. Buried tiles move with their carrier. Records the moves for the UI.
 */
function nudgeBoard(s: GameState, rng: () => number): { from: string; to: string }[] {
  const moves: { from: string; to: string }[] = [];
  const activated = new Set(s.activatedCells);
  // A tile is ELIGIBLE to move only if it is occupied, not part of a glowing combo,
  // AND has at least one empty, non-activated neighbour it could move into. We pick
  // from the eligible set FIRST — otherwise, on a dense board, a random pick almost
  // always lands on a boxed-in tile and nothing visibly moves.
  const hasEmptyNeighbour = (k: string): boolean =>
    (s.adj.get(k) ?? []).some((nb) => !activated.has(nb) && s.cells.get(nb)!.tile === null);
  const eligible = s.order.filter(
    (k) => !activated.has(k) && s.cells.get(k)!.tile !== null && hasEmptyNeighbour(k)
  );
  if (eligible.length === 0) return moves;
  // a RESHUFFLE always moves at least one tile, capped by how many are eligible. In
  // GLINT RUSH the board is small, so keep it calm — only 1..3 tiles drift (else 1..6).
  const maxNudge = s.deathMatch ? 3 : 6;
  const count = Math.min(eligible.length, 1 + Math.floor(rng() * maxNudge));
  // choose up to `count` eligible movers at random
  const pool = shuffle(eligible, rng).slice(0, count);
  const taken = new Set<string>(); // cells already vacated/filled this nudge
  for (const from of pool) {
    if (taken.has(from)) continue;
    // empty adjacent cells (not activated, currently empty, not already used here)
    const empties = (s.adj.get(from) ?? []).filter((nb) => {
      if (activated.has(nb)) return false;
      if (taken.has(nb)) return false;
      return s.cells.get(nb)!.tile === null;
    });
    if (empties.length === 0) continue; // a prior move boxed it in; it stays put
    const to = empties[Math.floor(rng() * empties.length)];
    const src = s.cells.get(from)!;
    const dst = s.cells.get(to)!;
    dst.tile = src.tile;
    dst.inert = src.inert;
    dst.buried = src.buried;
    if (src.bonusGem) { dst.bonusGem = src.bonusGem; src.bonusGem = null; }
    src.tile = null;
    src.inert = false;
    src.buried = null;
    taken.add(from);
    taken.add(to);
    moves.push({ from, to });
  }
  return moves;
}

/**
 * RULE 2: respawn the Core at a random legal cell. Legal = any cell that is NOT
 * an activated/glowing combo cell and NOT a Glint. It may cover a gap, a mineral,
 * or an inert tile; a covered mineral becomes buried (recoverable later).
 */
function respawnCore(s: GameState, rng: () => number): string | null {
  // Prefer landing ON a mineral so it BURIES a tile (which the player gets back to
  // their hand when the Core later leaves) — this keeps the hand topped up. Only
  // fall back to a gap/inert cell if no coverable mineral is available.
  const isCandidate = (k: string) => {
    if (s.activatedCells.includes(k)) return false; // not on a glowing combo
    const t = s.cells.get(k)!.tile;
    if (t === GLINT || t === CORE) return false; // not on a Glint or another Core
    return true;
  };
  const mineralCells = s.order.filter((k) => {
    if (!isCandidate(k)) return false;
    const t = s.cells.get(k)!.tile;
    return t !== null && t !== GLINT && t !== CORE; // a coverable mineral
  });
  const candidates = mineralCells.length > 0 ? mineralCells : s.order.filter(isCandidate);
  if (candidates.length === 0) return null;
  const k = candidates[Math.floor(rng() * candidates.length)];
  const cell = s.cells.get(k)!;
  if (cell.tile !== null && cell.tile !== GLINT && cell.tile !== CORE) {
    cell.buried = cell.tile; // bury the covered mineral (recoverable later)
  } else {
    cell.buried = null;
  }
  cell.tile = CORE;
  cell.inert = false;
  pushLog(s, { text: logText("nebuliteRespawned"), kind: "core", sticky: logIsSticky("nebuliteRespawned") });
  return k;
}

function comboLabel(names: ComboName[]): string {
  const pretty: Record<ComboName, string> = {
    Echo: "Echo", Trips: "Trips", Quad: "Quad", Pentad: "Pentad",
    Hex: "Hex", Drift: "Drift", LongDrift: "Long Drift", FullDrift: "Full Drift",
  };
  return names.map((n) => pretty[n]).join(" + ");
}

/**
 * Apply a placement. The placement activates a combo (absorbing connected
 * matching board tiles). The combo is added to the activated group, which
 * persists across turns until it banks (6+ tiles) or the player busts.
 */
export function place(state: GameState, cellKey: string, choice = 0, opts?: { preview?: boolean }): GameState {
  if (state.phase !== "playing") return state;
  // PREVIEW: describePlace commits internally to read the outcome — it must not
  // apply a hidden Quadriant's ×4 (that would leak the gem's presence via the
  // picker/hint score) nor resolve any bonus gem. Real placements pass nothing.
  const preview = opts?.preview ?? false;
  const tile = visibleTile(state);
  if (tile === null) return state;

  // RULE 2: was a Core respawn already armed BEFORE this placement? If so, the
  // Core respawns at the END of resolving this move (one placement later).
  const respawnDue = state.coreRespawnPending > 0;

  const plan = planMove(state, cellKey, choice);
  const s = clone(state);
  ageInertTiles(s); // last turn's forced tiles lose their red outline / become normal
  s.moves += 1;

  // ---- BUST ----
  if (!plan || !plan.isLegalBuild || plan.newCombos.length === 0) {
    // was this bust FORCED (no legal cell existed anywhere for this tile)?
    // Only medium needs the (pricey) scan — easy rescues every bust anyway.
    const wasForced = s.rescueMode === "medium" ? !hasLegalFor(state, visibleTile(state) as TileVal) : true;
    return doBust(s, cellKey, respawnDue, wasForced);
  }

  const cell = s.cells.get(cellKey)!;
  const covered = cell.tile;
  const buriedUnder = cell.buried; // mineral beneath a Glint/Core being covered
  // fresh resolution record for this placement
  s.lastResolved = emptyResolved();

  // place the tile (it covers the cell; the player's tile now occupies it).
  // A newly placed mineral buries nothing. A ZENITH fills in as its chosen value
  // (a concrete mineral) and flags the cell so the bank grants the flat bonus.
  s.hand.shift();
  const isZenith = tile === ZENITH && plan.wildValue != null;
  cell.tile = isZenith ? (plan.wildValue as TileVal) : tile;
  cell.inert = false;
  cell.buried = null;
  cell.zenithFill = isZenith ? true : cell.zenithFill;
  // If we just covered a Glint/Core that had a mineral buried beneath it, that
  // mineral returns to the player's hand.
  if ((covered === GLINT || covered === CORE) && buriedUnder !== null && buriedUnder !== GLINT && buriedUnder !== CORE) {
    s.hand.push(buriedUnder);
    s.lastResolved.buriedToHand.push({ key: cellKey, value: buriedUnder as number });
  }

  // add the newly-activated combo(s) to the activated group
  s.activatedCombos = [...s.activatedCombos, ...plan.newCombos];
  const cellUnion = new Set<string>(s.activatedCells);
  for (const c of plan.newCombos) for (const k of c.cells) cellUnion.add(k);
  s.activatedCells = [...cellUnion];
  s.pendingCoveredVal = covered;
  s.pendingCoveredKey = cellKey;

  if (plan.banks) {
    // ---- BANK only the connected cluster containing this placement ----
    const cluster = new Set(plan.clusterCells);
    let names = plan.clusterComboNames;
    // FAILSAFE: the named combos must account for exactly the banked tiles (capped at
    // two Hexes = 12). If they OVER-count — which would over-score — re-derive the
    // names from the true banked count for the cluster's dominant value.
    const bankedTiles = Math.min(cluster.size, 12);
    const namedTiles = names.reduce((sum, n) => sum + COMBO_SIZE[n], 0);
    if (namedTiles > bankedTiles) {
      names = nameSameValueMerge(bankedTiles, dominantClusterValue(s, cluster), 0);
    }
    const coveredCore = covered === CORE;
    // QUADRIANT buried under a cluster tile reveals in THIS bank — 4× that tile's
    // face value into the base before the multiplier. Skipped in a preview commit.
    const quadBonusBase = preview ? 0 : applyClusterQuadriant(s, cluster);
    const scored = scoreBank({ names, multiplier: plan.multiplier, coveredCore, bonusBase: quadBonusBase });
    const zenithBonus = preview ? 0 : applyClusterZenith(s, cluster);
    s.score += scored.total + zenithBonus;
    s.maxBankScore = Math.max(s.maxBankScore, scored.total + zenithBonus);
    s.banks += 1;
    for (const n of names) s.comboCounts[n] = (s.comboCounts[n] ?? 0) + 1;
    if (scored.chain.name) s.chainCounts[scored.chain.name] = (s.chainCounts[scored.chain.name] ?? 0) + 1;
    if (coveredCore) { s.coreBanked = true; s.coresCollected += 1; }

    // RULE 1: if this bank was a Hex taken from a same-value strand of 7+, the
    // leftover same-value tiles of that strand move to the player's HAND.
    const strandToHand: { key: string; value: number }[] = [];
    const placedVal = tile as number;
    if (placedVal !== GLINT && placedVal !== CORE) {
      // full connected same-value strand containing the placed cell. An ADOPTED
      // joker-Core reads as the value it mirrored, so the strand passes THROUGH it
      // to same-value tiles on its far side. A Core counts as adopted-at-this-value
      // when it is (a) banking in THIS cluster, (b) locked into an earlier activated
      // combo mirroring this value, or (c) adjacent to this placement (it mirrored
      // the placed value the moment the tile landed). A Core that was never adopted
      // has NO value yet and stays a wall.
      const lockedVals = lockedCoreValues(s);
      const adjToPlaced = new Set(s.adj.get(cellKey) ?? []);
      const matches = (k: string): boolean => {
        const t = s.cells.get(k)!.tile;
        if (t === placedVal) return true;
        if (t === CORE) {
          if (cluster.has(k)) return true; // joker-Core banking in this cluster
          const locked = lockedVals.get(k);
          if (locked === placedVal) return true; // adopted earlier at this value
          if (locked === undefined && adjToPlaced.has(k)) return true; // adopted by this placement
        }
        return false;
      };
      const strand = new Set<string>();
      const stack = [cellKey];
      while (stack.length) {
        const k = stack.pop()!;
        if (strand.has(k)) continue;
        if (!matches(k)) continue;
        strand.add(k);
        for (const nb of s.adj.get(k) ?? []) if (!strand.has(nb)) stack.push(nb);
      }
      // leftover = every same-value strand tile NOT in the banked cluster. The strand is
      // same-value-connected to the placed tile, so ALL of it is this one blob — including
      // tiles that belong to a separate activated combo (e.g. an Echo) sitting further down
      // the same strand. Those must overflow to the hand too; previously an `!activatedCells`
      // guard skipped them, orphaning them on the board (neither banked nor sent to hand). A
      // genuinely separate combo (a different value, or a same-value blob not touching this
      // one) is never reached by this flood, so it's unaffected. Cores never overflow.
      for (const k of strand) {
        if (!cluster.has(k) && s.cells.get(k)!.tile === placedVal) {
          strandToHand.push({ key: k, value: placedVal });
        }
      }
    }

    // clear only the cluster's tiles off the board (leave gaps). The covered
    // tile on the finishing placement is the multiplier and is discarded.
    // RULE 1: a joker-Core inside the cluster banks for +500, recovers its buried
    // tile to the hand, and arms its respawn.
    let clusterHadCore = false;
    for (const k of cluster) {
      const cc = s.cells.get(k)!;
      if (cc.tile === CORE) {
        clusterHadCore = true;
        s.score += CORE_BONUS;
        s.coreBanked = true; s.coresCollected += 1;
        if (cc.buried !== null && cc.buried !== GLINT && cc.buried !== CORE) {
          s.hand.push(cc.buried);
          s.lastResolved.buriedToHand.push({ key: k, value: cc.buried as number });
        }
      }
      cc.tile = null;
      cc.inert = false;
      cc.buried = null;
    }
    if (clusterHadCore && !s.coreRespawnDisabled) {
      s.coreRespawnPending = 1;
      pushLog(s, { text: logText("nebuliteCompletedRespawn", { bonus: CORE_BONUS }), kind: "core", sticky: logIsSticky("nebuliteCompletedRespawn") });
    } else if (clusterHadCore) {
      pushLog(s, { text: logText("nebuliteCompleted", { bonus: CORE_BONUS }), kind: "core", sticky: logIsSticky("nebuliteCompleted") });
    }
    // RULE 1 + MOTHER LODE: the overflow strand tiles (all the same mineral) clear
    // off the board. Every full 6 are REFINED into one Nebulite in the hand; any
    // remainder come to the hand as normal minerals. Plus a score bonus per tile.
    const overflowCount = strandToHand.length;
    const nebulites = Math.floor(overflowCount / REFINE_PER_NEBULITE);
    const refinedCells = strandToHand.slice(0, nebulites * REFINE_PER_NEBULITE).map((t) => t.key);
    const remainder = strandToHand.slice(nebulites * REFINE_PER_NEBULITE); // still to hand
    const overflowBonus = overflowCount * OVERFLOW_BONUS_PER_TILE;
    for (const { key } of strandToHand) {
      s.cells.get(key)!.tile = null;
      s.cells.get(key)!.inert = false;
      s.cells.get(key)!.buried = null;
    }
    for (const { value } of remainder) s.hand.push(value as TileVal);
    for (let i = 0; i < nebulites; i++) s.hand.push(CORE);
    s.nebulitesRefined += nebulites; // "acquired a Nebulite" for level objectives
    s.score += overflowBonus;
    if (overflowCount > 0) {
      s.lastResolved.motherLode = { bonus: overflowBonus, sourceValue: placedVal, refinedCells, nebulites };
    }
    // clear the activated combos/cells this bank consumed: the banked cluster AND any
    // same-value overflow tiles that just left the board for the hand. A combo untouched
    // by either stays pending (it's a genuinely separate build).
    const consumed = new Set<string>(cluster);
    for (const t of strandToHand) consumed.add(t.key);
    s.activatedCombos = s.activatedCombos.filter((c) => !c.cells.some((k) => consumed.has(k)));
    // rebuild the glow from the surviving combos so no cleared/overflowed cell is left
    // glowing (activatedCells is always exactly the union of activatedCombos' cells).
    s.activatedCells = [...new Set(s.activatedCombos.flatMap((c) => c.cells))];
    s.pendingCoveredVal = null;
    s.pendingCoveredKey = null;

    const multTxt = plan.multiplier > 1 ? ` ×${plan.multiplier}` : "";
    const chainTxt = scored.chain.name ? ` (${chainLabel(scored.chain.name)})` : "";
    pushLog(s, {
      text: logText("banked", { combo: comboLabel(names), multiplier: multTxt, chain: chainTxt, points: scored.total }),
      kind: coveredCore ? "core" : "bank",
    });
    if (coveredCore) pushLog(s, { text: logText("nebuliteBanked", { bonus: CORE_BONUS }), kind: "core", sticky: logIsSticky("nebuliteBanked") });
    if (overflowCount > 0) {
      const mineral = MINERAL_NAME[placedVal] ?? "tiles";
      if (nebulites > 0) {
        const nebTxt = nebulites === 1 ? "a Nebulite" : `${nebulites} Nebulites`;
        const remTxt = remainder.length > 0 ? ` (+${remainder.length} to hand)` : "";
        pushLog(s, {
          text: logText("motherLode", { count: overflowCount, mineral, nebulites: nebTxt, remainder: remTxt, bonus: overflowBonus }),
          kind: "lode",
        });
      } else {
        pushLog(s, {
          text: logText("overflow", { count: overflowCount, mineral, bonus: overflowBonus }),
          kind: "lode",
        });
      }
    }
    // RULE 2/6 + Glint/buried: resolve everything cut off by this clear. Only the
    // un-refined remainder tiles animate to the hand (the refined ones fuse instead).
    s.lastResolved.strandToHand = remainder;
    applyResolution(s, stateRng(s));
  } else {
    // ---- non-banking activation (group glows, persists) ----
    // The covered tile goes to hand (Core grants its bonus; Glint is a hazard).
    if (covered !== null) {
      if (covered === CORE) {
        s.score += CORE_BONUS;
        s.coreBanked = true; s.coresCollected += 1;
        pushLog(s, { text: logText("coveredNebulite", { bonus: CORE_BONUS }), kind: "core", sticky: logIsSticky("coveredNebulite") });
      } else if (covered === GLINT) {
        s.hand.push(GLINT);
        pushLog(s, { text: logText("pickedUpDross"), kind: "glint", sticky: logIsSticky("pickedUpDross") });
      } else {
        s.hand.push(covered);
      }
    }
    const clusterSize = plan.clusterCells.length;
    pushLog(s, {
      text: logText("activated", { combo: comboLabel(plan.newCombos.map((c) => c.name)), size: clusterSize, threshold: BANK_THRESHOLD }),
      kind: "info",
    });

    // RULE 3: if this was the player's LAST tile and it formed a combo that did
    // not reach the bank threshold, bank that cluster anyway (even a lone Echo).
    if (s.hand.length === 0 && !isEmptyBoard(s)) {
      forceBankFinalCluster(s, plan);
    }
  }

  // THE ABYSS COLLAPSES: if the board has dropped to the trigger, shrink it now, then
  // clean up what the collapse (or a Glint-clear reshuffle) left isolated — looping so a
  // late isolation that itself crosses the trigger resolves the collapse THIS turn rather
  // than deferring it to a later move. (Runs before the normal respawn; the shrink handles
  // the Core's final respawn.)
  settleCollapse(s, resolveLateIsolation);

  // RULE 2: if a Core respawn was armed before this move, do it now (one
  // placement later) — unless the shrink just disabled respawns.
  if (respawnDue && !s.coreRespawnDisabled) {
    s.coreRespawnPending = 0;
    const at = respawnCore(s, stateRng(s));
    if (at) s.lastResolved.coreRespawnedAt = at;
  }

  if (!preview) revealBonusGems(s);
  updateHandReveal(s);
  if (isEmptyBoard(s)) return endGame(s, true);
  if (s.hand.length === 0) return endGame(s, false);
  return s;
}

export function isBonusGem(t: TileVal | null | undefined): t is BonusGem {
  return t === RESURRECT || t === QUADRIANT || t === ZENITH;
}

/** Reveal any ACHIEVEMENT BONUS GEM now sitting on an EMPTIED cell — a robust
 *  chokepoint run at each resolution tail, so no clear path can lose a gem. A
 *  Resurrect resolves immediately (recover a used bust, or add a life above the
 *  max); Quadriant's in-bank ×4 is applied where the bank resolves (this sweep
 *  only fires for a Quadriant emptied OUTSIDE a scoring bank — it then just
 *  animates away, having granted nothing). */
/** Apply a single revealed bonus gem's effect (Resurrect grants a life; the
 *  others just flag for the UI). `key` is the board cell, or a synthetic label
 *  for a gem orphaned by a collapse. */
function resolveBonusGem(s: GameState, key: string, gem: BonusGem): void {
  if (gem === RESURRECT) {
    const wasRecover = s.livesLeft < 3;
    s.livesLeft += 1; // recover a used bust, or add a life above the max
    s.lastResolved.bonusRevealed.push({ key, gem, effect: wasRecover ? "recover" : "life" });
    pushLog(s, { text: logText("resurrectRevealed", { effect: wasRecover ? "bust recovered" : "extra life" }), kind: "core", sticky: logIsSticky("resurrectRevealed") });
  } else {
    // a Quadriant/Zenith that surfaced without an active bank to boost — no
    // effect yet (their in-bank/hand mechanics land in the next increment)
    s.lastResolved.bonusRevealed.push({ key, gem, effect: gem === QUADRIANT ? "quad" : "zenith" });
  }
}

function revealBonusGems(s: GameState): void {
  for (const k of s.order) {
    const cell = s.cells.get(k)!;
    if (cell.tile !== null || !isBonusGem(cell.bonusGem)) continue;
    const gem = cell.bonusGem;
    cell.bonusGem = null;
    resolveBonusGem(s, k, gem);
  }
}

/** QUADRIANT in a banking cluster: 4× the covering tile's face value, added to
 *  the base BEFORE the multiplier. Consumes the gem (so the reveal sweep won't
 *  re-fire) and records it for the bank overview. Returns the pre-multiplier
 *  bonus to feed scoreBank's bonusBase. */
function applyClusterQuadriant(s: GameState, cluster: Iterable<string>): number {
  let bonusBase = 0;
  for (const k of cluster) {
    const cc = s.cells.get(k)!;
    if (cc.bonusGem !== QUADRIANT) continue;
    const face = typeof cc.tile === "number" && cc.tile >= 1 && cc.tile <= 6 ? cc.tile * 100 : 0;
    const bonus = 4 * face;
    bonusBase += bonus;
    cc.bonusGem = null;
    s.lastResolved.bonusRevealed.push({ key: k, gem: QUADRIANT, effect: "quad", coveredValue: face, bonus });
    pushLog(s, { text: logText("quadriantRevealed", { face, bonus }), kind: "core", sticky: logIsSticky("quadriantRevealed") });
  }
  return bonusBase;
}

/** Deal the one ZENITH into the hand the moment GLINT RUSH arms (once per run). */
function dealZenith(s: GameState): void {
  if (!s.zenithUnlocked || s.zenithDealt) return;
  s.zenithDealt = true;
  s.hand.push(ZENITH);
  s.lastResolved.bonusRevealed.push({ key: "hand", gem: ZENITH, effect: "zenith" });
  pushLog(s, { text: logText("zenithDealt"), kind: "rush", sticky: logIsSticky("zenithDealt") });
}

/** ZENITH filled into a banking cluster grants a flat bonus (added AFTER the
 *  multiplier). Clears the flag and records it for the UI. Returns the bonus. */
function applyClusterZenith(s: GameState, cluster: Iterable<string>): number {
  let bonus = 0;
  for (const k of cluster) {
    const cc = s.cells.get(k)!;
    if (!cc.zenithFill) continue;
    cc.zenithFill = false;
    bonus += ZENITH_BONUS;
    s.lastResolved.bonusRevealed.push({ key: k, gem: ZENITH, effect: "zenith", bonus: ZENITH_BONUS });
    pushLog(s, { text: logText("zenithBanked", { bonus: ZENITH_BONUS }), kind: "core", sticky: logIsSticky("zenithBanked") });
  }
  return bonus;
}

/** Flip the hand-reveal hysteresis (once true it stays): at the difficulty
 *  threshold, or when GLINT RUSH arms. Pre-rush reveals announce themselves. */
function updateHandReveal(s: GameState) {
  if (s.handRevealed || s.phase !== "playing") return;
  if (s.deathMatch || s.hand.length <= s.revealAt) {
    s.handRevealed = true;
    if (!s.deathMatch) {
      pushLog(s, { text: logText("handRevealed"), kind: "info", sticky: logIsSticky("handRevealed") });
    }
  }
}

/** TRUE if placing `value` as the next tile has ANY non-busting cell. Uses the
 *  pure planner (NOT describePlace, whose bust path commits a full place() —
 *  which would recurse straight back into the rescue). Authoritative for wild
 *  Nebulites too: a wild "opportunity" exists exactly when the planner finds a
 *  legal build for it. Dross always busts. */
function hasLegalFor(s: GameState, value: TileVal): boolean {
  if (value === null || value === GLINT) return false;
  let probe = s;
  if (s.hand[0] !== value) {
    probe = clone(s);
    probe.hand = [value, ...probe.hand.slice(1)];
  }
  for (const k of probe.order) {
    try {
      const plan = planMove(probe, k, 0);
      if (plan && plan.isLegalBuild && plan.newCombos.length > 0) return true;
    } catch {
      /* invalid target — skip */
    }
  }
  return false;
}

/** Move the first tile of `value` to the front of the hand (invisible while the
 *  hand is hidden — the post-bust reshuffle already randomised the order). */
function forceHandFront(s: GameState, value: TileVal): void {
  const i = s.hand.indexOf(value as TileVal & number);
  if (i > 0) {
    s.hand.splice(i, 1);
    s.hand.unshift(value as TileVal & number);
  }
}

/** Relocate one tile as part of the bust's nudge (recorded in lastResolved.nudged
 *  so the UI animates it like any other drift). Refuses moves that would strand
 *  a neighbour (bust isolation DISCARDS tiles — the rescue must never feed it). */
function rescueMove(s: GameState, from: string, to: string): boolean {
  const src = s.cells.get(from);
  const dst = s.cells.get(to);
  if (!src || !dst || src.tile === null || dst.tile !== null) return false;
  if (s.activatedCells.includes(from) || s.activatedCells.includes(to)) return false;
  // the vacated cell's occupied neighbours must each keep at least one
  // occupied neighbour of their own
  for (const nb of s.adj.get(from) ?? []) {
    const c = s.cells.get(nb);
    if (!c || c.tile === null) continue;
    const still = (s.adj.get(nb) ?? []).some((k2) => k2 !== from && s.cells.get(k2)?.tile !== null);
    if (!still && !(nb === to)) return false;
  }
  dst.tile = src.tile;
  dst.inert = src.inert;
  dst.buried = src.buried;
  if (src.bonusGem) { dst.bonusGem = src.bonusGem; src.bonusGem = null; }
  src.tile = null;
  src.inert = false;
  src.buried = null;
  s.lastResolved.nudged.push({ from, to });
  if (s.lastResolved.inertAt === from) s.lastResolved.inertAt = to;
  return true;
}

/** Try to ARRANGE the board (within the bust's shuffle) so `value` gains a legal
 *  move: an Echo anchor for 2/6 (a matching tile or wild with an empty
 *  neighbour, walked one step into the open if boxed in), or a Trips
 *  opportunity — two matching tiles adjacent-with-an-empty-neighbour or one
 *  empty cell apart (relocating ONE tile a short hop when needed). */
function tryArrangeFor(s: GameState, value: TileVal, rng: () => number): boolean {
  const v = value as number;
  const cellsOf = (val: number) => s.order.filter((k) => s.cells.get(k)!.tile === val && !s.activatedCells.includes(k));
  const emptyNb = (k: string) => (s.adj.get(k) ?? []).filter((n) => s.cells.get(n)!.tile === null);
  const own = cellsOf(v);
  const anchors = v === 2 || v === 6 ? [...own, ...cellsOf(CORE)] : [];

  // ECHO (2/6): any anchor with an empty neighbour already works (hasLegalFor
  // said no, so none does) — walk ONE anchor a single step into the open
  for (const a of shuffle(anchors, rng)) {
    for (const to of shuffle((s.adj.get(a) ?? []).filter((n) => s.cells.get(n)!.tile === null), rng)) {
      // moving it there only helps if the destination has ANOTHER empty nb
      if (emptyNb(to).some((n) => n !== a) && rescueMove(s, a, to)) return hasLegalFor(s, value);
    }
  }

  // TRIPS: pairs of `v` — already adjacent, one-gap, or one short hop apart
  const pairs: [string, string][] = [];
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) pairs.push([own[i], own[j]]);
  // (a) adjacent pair missing only an empty neighbour → walk one of them
  for (const [a, b] of pairs) {
    if (!(s.adj.get(a) ?? []).includes(b)) continue;
    if (emptyNb(a).length || emptyNb(b).length) continue; // would have been legal already
    for (const src of [a, b]) {
      const other = src === a ? b : a;
      for (const to of (s.adj.get(other) ?? []).filter((n) => s.cells.get(n)!.tile === null)) {
        if (rescueMove(s, src, to)) return hasLegalFor(s, value);
      }
    }
  }
  // (b) one-gap pair with the gap EMPTY → already an opportunity; hasLegalFor
  //     would have caught it. One-gap with the gap OCCUPIED, or further apart:
  //     hop EITHER tile next to the other — try every pair, both directions,
  //     every empty destination (an applied-but-insufficient hop just reads as
  //     one more nudge; keep trying)
  for (const [a, b] of pairs) {
    for (const [src, anchor] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const to of (s.adj.get(anchor) ?? []).filter((n) => s.cells.get(n)!.tile === null)) {
        if (to === src) continue;
        if (rescueMove(s, src, to)) {
          if (hasLegalFor(s, value)) return true;
        }
      }
    }
  }
  return hasLegalFor(s, value);
}

/** THE BUST RESCUE — quietly keep a stuck player alive inside the systems they
 *  already believe are random. Easy: after EVERY bust. Medium: only when the
 *  bust was FORCED (no legal cell existed for the busted tile). Hard: never.
 *
 *  Hidden hand: reorder is invisible — if the natural next tile can't move,
 *  bring forward one that can (2, 6, a wild with a real opportunity, then the
 *  most-represented value); if NOTHING can, arrange the board (a nudge-sized
 *  rearrangement) and then bring the matching tile forward. A Dross at the
 *  front is never rescued away — the trap is the trap.
 *
 *  Revealed hand: no reordering (the player sees the order). Only when NO tile
 *  in the hand has a move do we arrange the board — once per game on medium,
 *  freely on easy. */
function rescueAfterBust(s: GameState, wasForced: boolean, rng: () => number): void {
  if (s.rescueMode === "off" || s.deathMatch || s.phase !== "playing") return;
  if (s.livesLeft <= 0 || s.hand.length === 0) return;
  if (s.rescueMode === "medium" && !wasForced) return;

  const distinct = [...new Set(s.hand)].filter((t) => t !== GLINT) as TileVal[];
  if (distinct.length === 0) return;
  const legal = distinct.filter((t) => hasLegalFor(s, t));

  if (!s.handRevealed) {
    if (s.hand[0] === GLINT) return; // never rescue around the trap
    if (legal.includes(s.hand[0] as TileVal)) return; // already fine
    if (legal.length > 0) {
      // priority: 2, 6, the wild, then the value with most board copies
      const copies = (t: TileVal) => s.order.filter((k) => s.cells.get(k)!.tile === t).length;
      const pick =
        legal.find((t) => t === 2) ??
        legal.find((t) => t === 6) ??
        legal.find((t) => t === CORE) ??
        [...legal].sort((a, b) => copies(b) - copies(a))[0];
      forceHandFront(s, pick);
      return;
    }
    // nothing in the hand can move: arrange the board for the best candidate
    const copies = (t: TileVal) => s.order.filter((k) => s.cells.get(k)!.tile === t).length;
    for (const t of [...distinct].sort((a, b) => copies(b) - copies(a))) {
      if (t === CORE) continue; // a wild can't be arranged FOR — anchors handle it
      if (tryArrangeFor(s, t, rng)) {
        forceHandFront(s, t);
        return;
      }
    }
    return;
  }

  // revealed hand
  if (legal.length > 0) return; // the player can see and pick it themselves
  if (s.rescueMode === "medium" && s.rescueRevealedUsed) return;
  const copies = (t: TileVal) => s.order.filter((k) => s.cells.get(k)!.tile === t).length;
  for (const t of [...distinct].sort((a, b) => copies(b) - copies(a))) {
    if (t === CORE) continue;
    if (tryArrangeFor(s, t, rng)) {
      if (s.rescueMode === "medium") s.rescueRevealedUsed = true;
      return;
    }
  }
}

function doBust(s: GameState, cellKey: string, respawnDue: boolean, wasForced = true): GameState {
  s.busts += 1;
  s.livesLeft -= 1;

  // fresh resolution record (the bust path doesn't pass through place()'s reset).
  // Reset BEFORE the recoveries below so their buriedToHand entries survive.
  s.lastResolved = emptyResolved();

  // The cell the player clicked already held a tile (you can only bust by placing
  // onto an occupied or gap cell). If it held a MINERAL, that mineral isn't lost —
  // it returns to the hand. If it held a Glint/Core hiding a buried mineral, the
  // buried mineral returns too (and is animated). (The clicked cell is then reused
  // for the forced inert drop below.)
  {
    const clicked = s.cells.get(cellKey)!;
    if (clicked.tile !== null && clicked.tile !== GLINT && clicked.tile !== CORE) {
      s.hand.push(clicked.tile);
      s.lastResolved.buriedToHand.push({ key: cellKey, value: clicked.tile as number });
    } else if ((clicked.tile === GLINT || clicked.tile === CORE) && clicked.buried !== null && clicked.buried !== GLINT && clicked.buried !== CORE) {
      s.hand.push(clicked.buried);
      s.lastResolved.buriedToHand.push({ key: cellKey, value: clicked.buried as number });
    }
    clicked.tile = null;
    clicked.inert = false;
    clicked.buried = null;
  }

  // lose the whole activated group (clear it, unscored). A buried mineral under a
  // Glint/Core in that group still returns to the hand (and is animated).
  for (const k of s.activatedCells) {
    const cc = s.cells.get(k)!;
    if ((cc.tile === CORE || cc.tile === GLINT) && cc.buried !== null && cc.buried !== GLINT && cc.buried !== CORE) {
      s.hand.push(cc.buried);
      s.lastResolved.buriedToHand.push({ key: k, value: cc.buried as number });
    }
    cc.tile = null;
    cc.inert = false;
    cc.buried = null;
  }
  const lost = s.activatedCells.length;
  s.activatedCombos = [];
  s.activatedCells = [];
  s.pendingCoveredVal = null;
  s.pendingCoveredKey = null;

  // discard the busted (visible) tile
  const busted = s.hand.shift();

  pushLog(s, {
    text:
      busted === GLINT
        ? logText("bustDross", { lost: lost ? logText("bustLostDross", { count: lost }) : "" })
        : logText("bust", { lost: lost ? logText("bustLost", { count: lost }) : "" }),
    kind: "bust",
  });

  // THIRD BUST — the game is over IMMEDIATELY. No forced tile, no collapse, no
  // reshuffle: a post-bust shuffle could isolate the remaining tiles and dress
  // the loss up as a board clear. The run ends on the bust itself (the UI plays
  // the final heart's flight-and-burst before the end card).
  if (s.livesLeft <= 0) return endGame(s, false);

  // NOTE: isolation is deliberately NOT resolved here. During a bust the placed
  // tile is removed, which can momentarily leave a neighbour "isolated" — but the
  // forced inert tile is about to drop onto the bust cell and reconnect it. So we
  // wait: isolation is resolved once, at the very end, AFTER the inert drop and the
  // reshuffle, with the board in its final shape.

  // forced next tile dropped inert into the bust cell. We TRACK where this tile
  // ends up as the board mutates below (shrink remap + nudge drift), so the UI can
  // keep it hidden through the whole animation and only reveal it on the final drop.
  let inertAt: string | null = null;
  // GLINT RUSH exception: during the final round a bust does NOT force a tile onto
  // the board. The endgame is about clearing — punishing a bust by GROWING the
  // board is a death spiral, so in rush you only lose the tile and the life.
  if (s.deathMatch) {
    pushLog(s, { text: logText("rushNoForcedTile"), kind: "rush", sticky: logIsSticky("rushNoForcedTile") });
  } else {
    // A hard-won Nebulite is never wasted as the forced inert tile: skip past any
    // Nebulites and drop the first ordinary tile instead (the Nebulites stay in the
    // hand). If the only tiles left are Nebulites, no tile is forced down.
    const forcedIdx = s.hand.findIndex((t) => t !== CORE);
    if (forcedIdx >= 0) {
      const next = s.hand.splice(forcedIdx, 1)[0];
      const cell = s.cells.get(cellKey)!;
      cell.tile = next;
      cell.inert = true;
      inertAt = cellKey;
      pushLog(s, { text: logText("forcedInert"), kind: "info", sticky: logIsSticky("forcedInert") });
    }
  }

  // THE ABYSS COLLAPSES (also checked after a bust clears tiles). Follow the inert
  // tile through the collapse remap.
  maybeShrink(s, stateRng(s));
  if (inertAt && s.lastResolved.shrunk) {
    const m = s.lastResolved.shrunk.mapping.find((mm) => mm.from === inertAt);
    inertAt = m ? m.to : null;
  }

  // RULE 2: armed-before-this-move Core respawn fires now (unless shrink disabled).
  if (respawnDue && !s.coreRespawnDisabled) {
    s.coreRespawnPending = 0;
    const at = respawnCore(s, stateRng(s));
    if (at) s.lastResolved.coreRespawnedAt = at;
  }

  if (s.deathMatch) {
    // GLINT RUSH: a bust does NOT reshuffle — the shuffle could isolate tiles and
    // hand the player a lucky clear. Isolation caused by the cluster loss itself
    // (no shuffle involved) still resolves normally.
    s.lastResolved.inertAt = inertAt;
    // a late isolation here can itself cross a collapse trigger the check above missed —
    // settle so the collapse resolves THIS bust, not a later move (see settleCollapse)
    settleCollapse(s, resolveLateIsolation);
  } else {
    // After a bust, reshuffle the stack and nudge the board (a few tiles drift by
    // one cell). Follow the inert tile if the nudge drifted it.
    const didReshuffle = reshuffleHand(s, stateRng(s));
    if (didReshuffle) s.lastResolved.reshuffled = true;
    s.lastResolved.nudged = nudgeBoard(s, stateRng(s));
    if (inertAt) {
      const m = s.lastResolved.nudged.find((mm) => mm.from === inertAt);
      if (m) inertAt = m.to;
    }
    s.lastResolved.inertAt = inertAt;
    if (didReshuffle || s.lastResolved.nudged.length > 0) {
      pushLog(s, { text: logText("reshuffled"), kind: "glint", sticky: logIsSticky("reshuffled") });
    }
    // tiles isolated in a BUST's wake are DISCARDED — no points, nothing to the
    // hand. Only Dross-clear reshuffles pay out isolation; a bust never does.
    // That discard can itself cross a collapse trigger the check above missed, so settle
    // here — following the inert tile through any late collapse remap — and let the
    // collapse resolve THIS bust rather than deferring it to a later move.
    settleCollapse(s, discardLateIsolation, () => {
      if (inertAt && s.lastResolved.shrunk) {
        const m = s.lastResolved.shrunk.mapping.find((mm) => mm.from === inertAt);
        inertAt = m ? m.to : null;
        s.lastResolved.inertAt = inertAt;
      }
    });
    // THE BUST RESCUE rides the shuffle it just caused — invisible by design
    // (board moves join the nudge list; the hand reorder happens inside an
    // already-shuffled hidden hand). It runs on the FINAL board — after the
    // isolation discard — so nothing it arranges can be swept away.
    rescueAfterBust(s, wasForced, stateRng(s));
  }

  revealBonusGems(s);
  updateHandReveal(s);
  // Out of lives -> game over (a loss). Otherwise continue if tiles/board remain.
  if (s.livesLeft <= 0) return endGame(s, false);
  if (isEmptyBoard(s)) return endGame(s, true);
  if (s.hand.length === 0) return endGame(s, false);
  return s;
}

/**
 * RULE 3 (last tile): bank the connected cluster the final placement is part of,
 * even though it's under the normal 6-tile threshold. Scores by combo name (no
 * multiplier needed — covered tile already handled), clears the cluster (with
 * joker-Core handling), and resolves anything isolated by the clear.
 */
function forceBankFinalCluster(s: GameState, plan: MovePlan): void {
  const cluster = new Set(plan.clusterCells);
  const names = plan.clusterComboNames;
  const scored = scoreBank({ names, multiplier: 1, coveredCore: false, bonusBase: applyClusterQuadriant(s, cluster) });
  const zenithBonusFC = applyClusterZenith(s, cluster);
  s.score += scored.total + zenithBonusFC;
  s.maxBankScore = Math.max(s.maxBankScore, scored.total + zenithBonusFC);
  s.banks += 1;
  for (const n of names) s.comboCounts[n] = (s.comboCounts[n] ?? 0) + 1;
  if (scored.chain.name) s.chainCounts[scored.chain.name] = (s.chainCounts[scored.chain.name] ?? 0) + 1;

  for (const k of cluster) {
    const cc = s.cells.get(k)!;
    if (cc.tile === CORE) {
      s.score += CORE_BONUS;
      s.coreBanked = true; s.coresCollected += 1;
      if (cc.buried !== null && cc.buried !== GLINT && cc.buried !== CORE) {
        s.hand.push(cc.buried);
      }
    }
    cc.tile = null;
    cc.inert = false;
    cc.buried = null;
  }
  s.activatedCombos = s.activatedCombos.filter((c) => !c.cells.some((k) => cluster.has(k)));
  s.activatedCells = s.activatedCells.filter((k) => !cluster.has(k));
  pushLog(s, { text: logText("lastTileBanked", { combo: comboLabel(names), points: scored.total }), kind: "bank", sticky: logIsSticky("lastTileBanked") });
  applyResolution(s, stateRng(s));
}

/**
 * OPTION 3 (early bank, the Farkle choice): bank the activated cluster that contains
 * `cellKey` RIGHT NOW, at BASE value (no multiplier, no chain). Used by the timed
 * BANK button that appears just after the player makes a combo, letting them lock in
 * points and clear tiles before risking the next placement. Other glowing combos are
 * untouched. Returns the new state (may end the game if the board clears).
 */
export function bankClusterNow(state: GameState, cellKey: string): GameState {
  if (state.phase !== "playing") return state;
  if (state.freeBanksLeft <= 0) return state; // no free banks remaining
  if (!state.activatedCells.includes(cellKey)) return state; // nothing to bank here
  const s = clone(state);
  ageInertTiles(s); // last turn's forced tiles lose their red outline / become normal
  s.lastResolved = emptyResolved();
  s.freeBanksLeft -= 1;

  const cluster = activatedCluster(s, new Set(s.activatedCells), cellKey);
  if (cluster.size === 0) return state;

  // combo names within this cluster
  const names: ComboName[] = [];
  for (const c of s.activatedCombos) {
    if (c.cells.some((k) => cluster.has(k))) names.push(c.name);
  }
  if (names.length === 0) return state;

  const scored = scoreBank({ names, multiplier: 1, coveredCore: false, bonusBase: applyClusterQuadriant(s, cluster) });
  const zenithBonusEB = applyClusterZenith(s, cluster);
  s.score += scored.total + zenithBonusEB;
  s.maxBankScore = Math.max(s.maxBankScore, scored.total + zenithBonusEB);
  s.banks += 1;
  for (const n of names) s.comboCounts[n] = (s.comboCounts[n] ?? 0) + 1;
  if (scored.chain.name) s.chainCounts[scored.chain.name] = (s.chainCounts[scored.chain.name] ?? 0) + 1;

  let clusterHadCore = false;
  for (const k of cluster) {
    const cc = s.cells.get(k)!;
    if (cc.tile === CORE) {
      clusterHadCore = true;
      s.score += CORE_BONUS;
      s.coreBanked = true; s.coresCollected += 1;
      if (cc.buried !== null && cc.buried !== GLINT && cc.buried !== CORE) {
        s.hand.push(cc.buried);
        s.lastResolved.buriedToHand.push({ key: k, value: cc.buried as number });
      }
    }
    cc.tile = null;
    cc.inert = false;
    cc.buried = null;
  }
  s.activatedCombos = s.activatedCombos.filter((c) => !c.cells.some((k) => cluster.has(k)));
  s.activatedCells = s.activatedCells.filter((k) => !cluster.has(k));
  if (clusterHadCore && !s.coreRespawnDisabled) s.coreRespawnPending = 1;

  pushLog(s, { text: logText("bankedEarly", { combo: comboLabel(names), points: scored.total }), kind: "bank", sticky: logIsSticky("bankedEarly") });
  applyResolution(s, stateRng(s));
  // collapse + late isolation, looped so a late isolation that crosses the trigger can't
  // defer the collapse to a later move (see settleCollapse)
  settleCollapse(s, resolveLateIsolation);
  revealBonusGems(s);
  updateHandReveal(s); // an early bank can trigger the FINAL collapse — GLINT RUSH must reveal the hand NOW, not one placement late

  if (isEmptyBoard(s)) return endGame(s, true);
  if (s.hand.length === 0) return endGame(s, false);
  return s;
}

/**
 * (Formerly RULE 5, no moves.) UNUSED since CASH OUT landed: a last tile with no
 * legal move no longer auto-ends the game — ending the run is always the player's
 * decision (cash out during GLINT RUSH, or place the tile and take the bust).
 * Kept for reference should a stuck-detection prompt ever return.
 */
export function endStuck(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const s = clone(state);
  s.lastResolved = emptyResolved();
  s.busts += 1;
  pushLog(s, { text: logText("noLegalMove"), kind: "bust", sticky: logIsSticky("noLegalMove") });
  return endGame(s, false);
}

// CASH OUT conversion rates: unspent resources become points when the player
// banks the run during GLINT RUSH.
export const CASHOUT_PER_LIFE = 250;
export const CASHOUT_PER_FREE_BANK = 150;
export const CASHOUT_PER_GEM_VALUE = 100; // hand minerals: face value × this

/** What a cash-out is worth right now: unspent lives, unused free banks, and the
 *  minerals still in hand (face value × 100, same rate as the board-clear leftover
 *  bonus). Dross and Nebulites in hand convert to nothing. */
export function cashOutValue(s: GameState): { lives: number; banks: number; gems: number; total: number } {
  const lives = s.livesLeft * CASHOUT_PER_LIFE;
  const banks = s.freeBanksLeft * CASHOUT_PER_FREE_BANK;
  let gems = 0;
  for (const t of s.hand) {
    if (t !== null && t !== GLINT && t !== CORE) gems += (t as number) * CASHOUT_PER_GEM_VALUE;
  }
  return { lives, banks, gems, total: lives + banks + gems };
}

/**
 * CASH OUT — GLINT RUSH only. The player ends the run by CHOICE (it's never
 * auto-triggered), converting every unspent life, free bank and hand mineral
 * into points. The hand is spent by the conversion. The normal end-of-run
 * accounting still applies afterwards (unbanked-combo penalty, isolated-tile
 * banking, Nebulite-left penalty).
 */
export function cashOut(state: GameState): GameState {
  if (state.phase !== "playing" || !state.deathMatch) return state;
  const s = clone(state);
  s.lastResolved = emptyResolved();
  // scoreBase = banked during play, BEFORE the cash-out conversion; the conversion is
  // recorded as tally steps so the summary reveals it AT the pop-up (endGame appends the
  // remaining end-of-run adjustments). scoreBase + Σ endTally.delta = the final.
  s.scoreBase = s.score;
  const v = cashOutValue(s);
  // record-only: the delta is NOT added to s.score here — the pop-up applies it live.
  const add = (kind: EndTallyKind, delta: number) => { if (delta !== 0) s.endTally.push({ kind, delta }); };
  add("busts", v.lives);
  add("banks", v.banks);
  add("hand", v.gems);
  s.cashedOut = v.total;
  s.endBonus = { lives: v.lives, banks: v.banks, gems: v.gems };
  // Nebulites still in the hand are BANKED by the conversion — they count as
  // collected (the wallet's rule: banked or cleared, never merely refined)
  const handCores = s.hand.filter((t) => t === CORE).length;
  if (handCores > 0) {
    s.coresCollected += handCores;
    s.coreBanked = true;
  }
  // an UNUSED Zenith carried into the cash-out banks for its flat bonus
  const handZeniths = s.hand.filter((t) => t === ZENITH).length;
  if (handZeniths > 0) {
    add("zenith", handZeniths * ZENITH_BONUS);
    s.lastResolved.bonusRevealed.push({ key: "hand", gem: ZENITH, effect: "zenith", bonus: handZeniths * ZENITH_BONUS });
    pushLog(s, { text: logText("zenithBanked", { bonus: handZeniths * ZENITH_BONUS }), kind: "core", sticky: logIsSticky("zenithBanked") });
  }
  s.hand = []; // the hand is converted along with the lives and banks
  pushLog(s, {
    text: logText("cashedOut", { total: v.total, lives: v.lives, banks: v.banks, gems: v.gems }),
    kind: "bank",
  });
  return endGame(s, false);
}

function endGame(s: GameState, won: boolean): GameState {
  // cashOut() begins the tally (its conversion steps) BEFORE calling endGame; a natural
  // end starts it here. scoreBase = everything banked from the board during play — the
  // score the header shows through the end animation. Every end-of-run adjustment below
  // is a labelled `endTally` step so the POP-UP applies it (never before the pop-up),
  // and scoreBase + Σ delta = the pre-floor final.
  const fromCashout = s.endTally.length > 0;
  if (!fromCashout) s.scoreBase = s.score;
  // record-only: the delta is NOT added to s.score here. s.score stays at scoreBase (the
  // board-collected total shown during play); the pop-up applies each step live IN view.
  const add = (kind: EndTallyKind, delta: number) => {
    if (delta === 0) return;
    s.endTally.push({ kind, delta });
  };

  // RULE 3 penalty: any activated combos still glowing (never banked) cost their
  // BASE combo value (no multiplier/chain). Applies whether won or lost.
  if (s.activatedCombos.length > 0) {
    let penalty = 0;
    for (const c of s.activatedCombos) penalty += COMBO_POINTS[c.name];
    if (penalty > 0) {
      add("unbanked", -penalty);
      pushLog(s, { text: logText("unbankedPenalty", { penalty }), kind: "bust" });
    }
    // they're resolved now (no longer pending)
    s.activatedCombos = [];
    s.activatedCells = [];
  }

  if (won) {
    // CASH-OUT PARITY: clearing the board converts the same unspent riches a
    // cash-out would — remaining busts, free banks AND hand minerals — at the
    // same rates, with the breakdown recorded for the run summary.
    const v = cashOutValue(s);
    const handCores = s.hand.filter((t) => t === CORE).length;
    if (handCores > 0) {
      // hand Nebulites are banked with the win — collected for the wallet
      s.coresCollected += handCores;
      s.coreBanked = true;
    }
    // an UNUSED Zenith carried into the clear banks for its flat bonus
    const handZeniths = s.hand.filter((t) => t === ZENITH).length;
    if (handZeniths > 0) {
      add("zenith", handZeniths * ZENITH_BONUS);
      s.lastResolved.bonusRevealed.push({ key: "hand", gem: ZENITH, effect: "zenith", bonus: handZeniths * ZENITH_BONUS });
      pushLog(s, { text: logText("zenithBanked", { bonus: handZeniths * ZENITH_BONUS }), kind: "core", sticky: logIsSticky("zenithBanked") });
    }
    if (v.total > 0 || handCores > 0 || handZeniths > 0) {
      add("busts", v.lives);
      add("banks", v.banks);
      add("hand", v.gems);
      s.endBonus = { lives: v.lives, banks: v.banks, gems: v.gems };
      s.hand = [];
      pushLog(s, {
        text: logText("clearedConverted", { total: v.total, lives: v.lives, banks: v.banks, gems: v.gems }),
        kind: "bank",
        sticky: logIsSticky("clearedConverted"),
      });
    }
    // RULE 4: clearing the board awards a flat bonus, scaled by the board's
    // STARTING shape (bigger boards pay more — 5000 / 7500 / 10000).
    const clearBonus = boardClearBonus(s.startShape);
    add("clear", clearBonus);
    s.lastResolved.clearBonus = clearBonus;
    pushLog(s, { text: logText("clearedBonus", { bonus: clearBonus }), kind: "bank", sticky: logIsSticky("clearedBonus") });
    s.phase = "won";
  } else {
    // Out of tiles (or stuck). Before tallying, BANK any tiles left isolated on the
    // board — a lone tile with no neighbours banks for its face value, exactly as it
    // would mid-game. Loop, since banking one can isolate another. (No reshuffle/
    // nudge here — the game is over.)
    let banked = 0;
    for (let guard = 0; guard < 200; guard++) {
      const before = s.lastResolved.isolatedToScore.length;
      const r = resolveIsolatedTiles(s);
      s.lastResolved.isolatedToScore.push(...r.banked);
      s.lastResolved.pairToHand.push(...r.toHand);
      s.lastResolved.buriedToHand.push(...r.buriedToHand);
      for (const b of r.banked) banked += b.points;
      if (s.lastResolved.isolatedToScore.length === before) break; // nothing new resolved
    }
    // resolveIsolatedTiles added these points to s.score; record the tally step here (this
    // is an END-of-run bank, so s.score is reset to scoreBase below and the pop-up reveals it).
    if (banked !== 0) s.endTally.push({ kind: "boardTiles", delta: banked });

    // tiles-left penalty: each tile still on the board (after the isolated-tile
    // banking above) costs its FACE value — a mineral 1–6 costs 100–600, a Nebulite
    // (Core) costs 500. Dross (Glint) and bonus gems are free.
    let leftPoints = 0, leftCount = 0;
    for (const k of s.order) {
      const t = s.cells.get(k)!.tile;
      const pen = typeof t === "number" && t >= 1 && t <= 6 ? t * 100 : t === CORE ? CORE_BONUS : 0;
      if (pen > 0) { leftPoints += pen; leftCount += 1; }
    }
    if (leftPoints > 0) {
      add("tiles", -leftPoints);
      s.gemsLeftPenalty = { count: leftCount, points: leftPoints };
      pushLog(s, { text: logText("gemsLeftPenalty", { count: leftCount, points: leftPoints }), kind: "bust", sticky: logIsSticky("gemsLeftPenalty") });
    }
    s.phase = "lost";
  }

  // Nothing above is awarded before the pop-up: reset `score` to scoreBase (the board-
  // collected total shown during play — this also reverts the isolated-tile banking that
  // resolveIsolatedTiles added). `finalScore` is the floored total the summary lands on
  // (a heavy penalty never shows a negative — 0 is the natural bottom, like the wallet).
  s.score = s.scoreBase;
  s.finalScore = Math.max(0, s.scoreBase + s.endTally.reduce((n, t) => n + t.delta, 0));
  pushLog(s, {
    text: logText(won ? "clearedFinal" : "outOfTiles", { score: s.finalScore }),
    kind: won ? "bank" : "bust",
    sticky: logIsSticky(won ? "clearedFinal" : "outOfTiles"),
  });
  return s;
}

// ============================================================================
// ANIMATION SUPPORT (pure, read-only)
// ----------------------------------------------------------------------------
// describePlace() computes WHAT a placement will do without mutating state, so
// the UI can choreograph an animation and then commit the real place(). The
// engine logic itself is untouched.
// ============================================================================

export type PlaceKind = "bank" | "bust" | "activate";

export interface PlaceOutcome {
  kind: PlaceKind;
  placedKey: string;
  placedVal: TileVal;
  coveredVal: TileVal | null;

  // BANK: cells that clear, ordered breadth-first from the placed tile, so the
  // UI can light them up one-by-one outward, then fly them to the score.
  bankOrder: string[];
  bankScore: number;
  multiplier: number;
  coveredCore: boolean;

  // ACTIVATE (non-banking): where a covered tile goes.
  coveredToHand: boolean;        // covered mineral or Glint -> hand
  coveredCoreToScore: boolean;   // covered Core -> +500 (fly to score)

  // BUST: activated cells lost (cleared, unscored).
  bustLostCells: string[];

  // RULE 3 (last tile): true when this placement is the final hand tile and its
  // combo is force-banked even though the cluster is under 6. The UI animates it
  // exactly like a normal bank. `penalties` lists the OTHER activated combos that
  // never banked — each gets a red outline and a red negative number flown to the
  // score (its base value is deducted). Set only when this ends the game.
  isLastTileBank: boolean;
  endsGame: boolean;
  endsWon: boolean; // board cleared as a result (Rule 4 +5000 applies)
  penalties: { cells: string[]; value: number; name: ComboName }[];

  // BANK: the cluster's combo decomposition for the COMBO LINEUP moment — one row
  // per combo (pretty name + its cells; run=true for Drifts, so the UI can order
  // the row by value). A cell may appear in TWO rows (the placed tile bridging a
  // set and a run); the UI renders its second occurrence as a "ghost" copy.
  // `chainName` is the chain the bank formed (Convergence / Accord / ...), if any.
  bankCombos: { name: string; cells: string[]; run: boolean }[];
  chainName: string | null;
}

/** One lineup row per combo in the banked cluster: the prior activated combos
 *  that joined this bank (unless the new combos fully subsume them) followed by
 *  the placement's own combo(s). When a same-value MERGE renamed the cluster
 *  (e.g. two bridged Trips scored as a Hex), the per-combo rows no longer match
 *  the scored names — fall back to a single truthful row of the whole cluster
 *  under the scored label. */
function bankComboRows(
  s: GameState,
  plan: MovePlan
): { name: string; cells: string[]; run: boolean }[] {
  const isRun = (n: ComboName) => n === "Drift" || n === "LongDrift" || n === "FullDrift";
  const cluster = new Set(plan.clusterCells);
  const newCells = new Set<string>();
  for (const c of plan.newCombos) for (const k of c.cells) newCells.add(k);

  const rows: { comboName: ComboName; cells: string[] }[] = [];
  for (const c of s.activatedCombos) {
    if (!c.cells.some((k) => cluster.has(k))) continue; // not part of this bank
    if (c.cells.every((k) => newCells.has(k))) continue; // subsumed by the new combos
    rows.push({ comboName: c.name, cells: [...c.cells] });
  }
  for (const c of plan.newCombos) rows.push({ comboName: c.name, cells: [...c.cells] });

  // truthfulness check: the rows must tile the cluster exactly AND carry the same
  // names the bank scored — otherwise (merge rename / failsafe) show one row.
  const uniq = new Set(rows.flatMap((r) => r.cells));
  const namesMatch =
    [...rows.map((r) => r.comboName)].sort().join("|") === [...plan.clusterComboNames].sort().join("|");
  if (uniq.size !== cluster.size || [...uniq].some((k) => !cluster.has(k)) || !namesMatch) {
    return [{ name: comboLabel(plan.clusterComboNames), cells: plan.clusterCells.slice(), run: false }];
  }
  return rows.map((r) => ({ name: comboLabel([r.comboName]), cells: r.cells, run: isRun(r.comboName) }));
}

/** BFS order of cluster cells from the placed tile (drives light-up order). */
function bfsOrderWithin(s: GameState, cluster: Set<string>, start: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift()!;
    if (!cluster.has(k)) continue;
    out.push(k);
    for (const nb of s.adj.get(k) ?? []) {
      if (cluster.has(nb) && !seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  for (const k of cluster) if (!out.includes(k)) out.push(k);
  return out;
}

/** Read-only description of what placing the visible tile at cellKey will do. */
export function describePlace(state: GameState, cellKey: string, choice = 0): PlaceOutcome {
  const placedVal = visibleTile(state) as TileVal;
  const plan = planMove(state, cellKey, choice);
  const cell = state.cells.get(cellKey)!;
  const coveredVal = cell.tile;

  if (!plan || !plan.isLegalBuild || plan.newCombos.length === 0) {
    const committed = place(state, cellKey, choice, { preview: true });
    return {
      kind: "bust", placedKey: cellKey, placedVal, coveredVal,
      bankOrder: [], bankScore: 0, multiplier: 1, coveredCore: false,
      coveredToHand: false, coveredCoreToScore: false,
      bustLostCells: [...state.activatedCells],
      isLastTileBank: false,
      endsGame: committed.phase !== "playing",
      endsWon: committed.phase === "won",
      penalties: [],
      bankCombos: [], chainName: null,
    };
  }

  if (plan.banks) {
    const cluster = new Set(plan.clusterCells);
    const names = plan.clusterComboNames;
    const coveredCore = coveredVal === CORE;
    const scored = scoreBank({ names, multiplier: plan.multiplier, coveredCore });
    const committed = place(state, cellKey, choice, { preview: true });
    return {
      kind: "bank", placedKey: cellKey, placedVal, coveredVal,
      bankOrder: bfsOrderWithin(state, cluster, cellKey),
      bankScore: scored.total, multiplier: plan.multiplier, coveredCore,
      coveredToHand: false, coveredCoreToScore: false, bustLostCells: [],
      isLastTileBank: false,
      endsGame: committed.phase !== "playing",
      endsWon: committed.phase === "won",
      penalties: [],
      bankCombos: bankComboRows(state, plan), chainName: scored.chain.name ? chainLabel(scored.chain.name) : null,
    };
  }

  // Non-banking activation. But if this is the LAST hand tile, Rule 3 force-banks
  // the cluster anyway — detect that by committing and checking the result, so the
  // UI can animate it like a normal bank plus the penalty deductions.
  const committed = place(state, cellKey, choice, { preview: true });
  const wasForceBanked = committed.banks > state.banks; // a bank happened despite plan.banks=false
  if (wasForceBanked) {
    const cluster = new Set(plan.clusterCells);
    const names = plan.clusterComboNames;
    const scored = scoreBank({ names, multiplier: 1, coveredCore: false });
    // penalties = activated combos that existed before but are NOT in this cluster
    const penalties = state.activatedCombos
      .filter((c) => !c.cells.some((k) => cluster.has(k)))
      .map((c) => ({ cells: [...c.cells], value: COMBO_POINTS[c.name], name: c.name }));
    return {
      kind: "bank", placedKey: cellKey, placedVal, coveredVal,
      bankOrder: bfsOrderWithin(state, cluster, cellKey),
      bankScore: scored.total, multiplier: 1, coveredCore: false,
      coveredToHand: false, coveredCoreToScore: false, bustLostCells: [],
      isLastTileBank: true,
      endsGame: committed.phase !== "playing",
      endsWon: committed.phase === "won",
      penalties,
      bankCombos: bankComboRows(state, plan), chainName: scored.chain.name ? chainLabel(scored.chain.name) : null,
    };
  }

  const coveredToHand = coveredVal !== null && coveredVal !== CORE;
  const coveredCoreToScore = coveredVal === CORE;
  return {
    kind: "activate", placedKey: cellKey, placedVal, coveredVal,
    bankOrder: [], bankScore: 0, multiplier: 1, coveredCore: false,
    coveredToHand, coveredCoreToScore, bustLostCells: [],
    isLastTileBank: false,
    endsGame: committed.phase !== "playing",
    endsWon: committed.phase === "won",
    penalties: [],
    bankCombos: [], chainName: null,
  };
}

/** The DISTINCT resolutions available to this placement — when there are two
 *  or more, the UI shows the pre-select-and-confirm picker. Each option's
 *  `cells` is the union of its combos' cells (option i pairs with
 *  describePlace/place called with choice=i). Wild Nebulites and Dross never
 *  offer a choice. */
export function placeAlternatives(state: GameState, cellKey: string): { cells: string[] }[] {
  const tile = visibleTile(state);
  if (tile === null || tile === GLINT || tile === CORE) return [];
  if (!state.cells.get(cellKey)) return [];
  if (state.activatedCells.includes(cellKey)) return [];
  const opts = enumerateActivationChoices(cellKey, tile as number, boardViewFor(state));
  return opts.map((o) => ({ cells: [...new Set(o.flatMap((c) => c.cells))] }));
}

/** THE TEACHING HINT (Tutorial / Academy first turns): the best available
 *  placement for the CURRENT tile — favouring runs (Drifts pay to clear early;
 *  sets keep), then the largest activation. Returns the cells to glow (target
 *  included), or null when nothing is playable. */
export function bestPlacementHint(state: GameState): string[] | null {
  const isRun = (n: ComboName) => n === "Drift" || n === "LongDrift" || n === "FullDrift";
  let best: { cells: string[]; score: number } | null = null;
  for (const k of state.order) {
    try {
      const plan = planMove(state, k, 0);
      if (!plan || !plan.isLegalBuild || plan.newCombos.length === 0) continue;
      const cells = [...new Set([k, ...plan.newCombos.flatMap((c) => c.cells)])];
      const score = (plan.newCombos.some((c) => isRun(c.name)) ? 1_000_000 : 0) + cells.length;
      if (!best || score > best.score) best = { cells, score };
    } catch {
      /* invalid target — skip */
    }
  }
  return best ? best.cells : null;
}

/** Append a single info log entry without otherwise changing state. */
export function logOnly(state: GameState, text: string): GameState {
  const s = clone(state);
  pushLog(s, { text, kind: "info" });
  return s;
}
