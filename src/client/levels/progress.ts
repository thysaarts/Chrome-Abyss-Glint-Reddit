/**
 * Campaign progress + leaderboard — persisted in localStorage.
 *
 * Progress is a single number: `unlocked`, the highest-reached (frontier) level index.
 * A level is COMPLETED if it's below the frontier, CURRENT if it is the frontier, and
 * LOCKED above it. Finishing the frontier level advances the frontier only when the NEXT
 * level's unlock predicate is satisfied by that run.
 */
import { readVersioned, writeVersioned, removeStored } from "../game/storage";
import { LEVELS, RunResult } from "./levels";

// The short-lived ON-DEVICE level generator is gone (levels are pre-generated
// into the CMS now, and The Master Core caps the list) — sweep its storage.
try {
  removeStored("glint.gen.v1");
} catch {
  /* ignore */
}

const PROGRESS_KEY = "glint.progress.v1";
const SCORES_KEY = "glint.scores.v1";
const RESULTS_KEY = "glint.results.v1";
const TUTORIAL_KEY = "glint.tutorial.v1";
const SAVE_V = 1; // bump + pass migrate() to readVersioned when a payload shape changes

export type LevelStatus = "completed" | "current" | "locked";

/** Has the player finished the scripted Tutorial (Level 0)? Gates the app's
 *  earning + the Collection / Achievements / Shop tabs until it's done. */
export function tutorialDone(): boolean {
  return readVersioned<boolean>(TUTORIAL_KEY, false, SAVE_V) === true;
}

/** Mark the scripted Tutorial complete — unlocks all app features. */
export function markTutorialDone(): void {
  writeVersioned(TUTORIAL_KEY, true, SAVE_V);
}


/** The REAL stored frontier, regardless of any testing override. */
export function storedFrontier(): number {
  return Math.min(readVersioned<number>(PROGRESS_KEY, 0, SAVE_V), LEVELS.length - 1);
}

/** The frontier: the highest unlocked level index (0 on a fresh install). */
export function unlockedIndex(): number {
  return storedFrontier();
}

export function levelStatus(num: number): LevelStatus {
  const frontier = unlockedIndex();
  if (num < frontier) return "completed";
  if (num === frontier) return "current";
  return "locked";
}

/** Finished `num`; advance the frontier if the next level's requirement is met.
 *  Returns true when this run FRESHLY unlocked the next level (for the level-menu
 *  unlock celebration). */
/**
 * Advance the campaign frontier if this run met the NEXT level's unlock target.
 * `qualifies` gates it on a LEGITIMATE finish — cleared the board, cashed out, or ran
 * out of tiles. A GAME OVER (busted out of lives) never advances, even if the target's
 * number was reached mid-run (e.g. a Nebulite refined then forfeited on the loss).
 */
export function completeLevel(num: number, run: RunResult, qualifies = true): boolean {
  if (!qualifies) return false; // a game over / abandoned run doesn't count toward any target
  const frontier = storedFrontier();
  if (num !== frontier) return false; // only the frontier level advances the campaign
  const next = LEVELS[num + 1];
  if (next && next.unlockedBy(run)) {
    writeVersioned(PROGRESS_KEY, num + 1, SAVE_V);
    return true;
  }
  return false;
}

// ---- per-level results (best score + cleared-the-board), for the level tiles ----
export interface LevelResult {
  best: number; // highest score achieved on this level
  cleared: boolean; // the board was fully CLEARED at least once (not just played)
}

export function levelResult(num: number): LevelResult | null {
  return readVersioned<Record<number, LevelResult>>(RESULTS_KEY, {}, SAVE_V)[num] ?? null;
}

/** Record a finished campaign run against its level (any run, replays included). */
export function recordLevelResult(num: number, run: RunResult): void {
  const all = readVersioned<Record<number, LevelResult>>(RESULTS_KEY, {}, SAVE_V);
  const prev = all[num];
  all[num] = {
    best: Math.max(prev?.best ?? 0, run.score),
    cleared: (prev?.cleared ?? false) || run.boardCleared,
  };
  writeVersioned(RESULTS_KEY, all, SAVE_V);
}

// ---- leaderboard ----
export interface ScoreEntry {
  score: number;
  level: string; // the level name (or "Quick Start")
}

export function topScores(): ScoreEntry[] {
  return readVersioned<ScoreEntry[]>(SCORES_KEY, [], SAVE_V);
}

/** Record a run's score; keep the top 6. */
export function recordScore(score: number, level: string): void {
  if (score <= 0) return;
  const all = [...topScores(), { score, level }].sort((a, b) => b.score - a.score).slice(0, 6);
  writeVersioned(SCORES_KEY, all, SAVE_V);
}

/** Wipe ALL campaign progress: frontier, per-level results, and the leaderboard.
 *  Used by Settings → Data → Reset progress. Does not touch player settings. */
export function resetAllProgress(): void {
  try {
    removeStored(PROGRESS_KEY);
    removeStored(SCORES_KEY);
    removeStored(RESULTS_KEY);
    removeStored(TUTORIAL_KEY);
  } catch {
    /* ignore */
  }
}
