/**
 * LIFETIME STATS + DAILY CHALLENGE STATE — persisted in localStorage.
 *
 * Accumulated across every game (campaign or quick), these power the Challenges
 * milestones and the Achievements page. Device-local for now (like campaign
 * progress); they move to the cloud in the backend wave.
 */

import { readVersioned, writeVersioned, removeStored } from "./storage";

const STATS_KEY = "glint.stats.v1";
const DAILY_KEY = "glint.daily.v1";
const SAVE_V = 1; // bump + pass migrate() to readVersioned when stats/daily shapes change

export interface LifetimeStats {
  gamesPlayed: number;
  boardsCleared: number;
  nebulitesAcquired: number;
  drossSwept: number;
  banksTotal: number;
  deepestLevel: number; // highest CAMPAIGN level number reached (quick games don't count)
  // one-shot achievement flags
  reachedRush: boolean;
  cashedOut: boolean;
  fullDrift: boolean;
  clearedShaped: boolean;
  clearedSquare: boolean; // cleared the full square board (its own achievement)
  bankedHarmony: boolean; // banked a Harmony chain (three set-combos at once)
  beatMasterCore: boolean;
  maxBankScore: number; // lifetime best single bank
  convergenceTotal: number; // chains banked, lifetime
  harmonyTotal: number;
  accordTotal: number;
  turnTotal: number; // internal chain name "Sweep" — displayed as the CMS says
  // ACHIEVEMENT BONUS-GEM tracking
  noBustStreak: number; // completed games in a row with ZERO busts (Invincible → 30)
  rushCount: number; // lifetime count of runs that reached GLINT RUSH (Superluminal → 100)
  versusWins?: number; // YOU vs THE HOUSE + online versus victories (combined)
  // the Achievements LIFETIME bottom row (Thys 2026-08-21) — together games
  // never reach recordRun, so these are credited at their own settle points
  duelWins?: number; // Broker duels won (subset of versusWins)
  onlineVersusWins?: number; // online versus games won (subset of versusWins)
  coopClears?: number; // co-op boards cleared (either participant's device credits itself)
  // lifetime COUNTS behind "lifetime total"-scope collectible triggers (the old
  // boolean flags above can't express a target > 1). Absent in pre-existing
  // saves — readers guard with ?? 0; both start from 0 (no history to credit).
  fullDriftTotal: number; // Full Drifts banked, lifetime
  cashoutCount: number; // runs ended by a cash-out, lifetime
}

export const ZERO_STATS: LifetimeStats = {
  gamesPlayed: 0,
  boardsCleared: 0,
  nebulitesAcquired: 0,
  drossSwept: 0,
  banksTotal: 0,
  deepestLevel: 0,
  reachedRush: false,
  cashedOut: false,
  fullDrift: false,
  clearedShaped: false,
  clearedSquare: false,
  bankedHarmony: false,
  beatMasterCore: false,
  maxBankScore: 0,
  convergenceTotal: 0,
  harmonyTotal: 0,
  accordTotal: 0,
  turnTotal: 0,
  noBustStreak: 0,
  rushCount: 0,
  versusWins: 0,
  duelWins: 0,
  onlineVersusWins: 0,
  coopClears: 0,
  fullDriftTotal: 0,
  cashoutCount: 0,
};

/** Everything a finished run contributes — built in App from the final state. */
export interface FinishedRun {
  score: number;
  won: boolean;
  busts: number; // busts taken this run (0 keeps the no-bust streak alive)
  drossCleared: number;
  nebulitesAcquired: number;
  banks: number;
  reachedRush: boolean;
  cashedOut: boolean;
  fullDrift: boolean;
  fullDrifts: number; // Full Drifts banked this run (the COUNT behind fulldrift targets)
  levelNum: number; // campaign level, or -1 for a quick game
  shaped: boolean; // the board was a non-hexagon shape (the square counts separately)
  square: boolean; // the board was the full square
  harmony: boolean; // a Harmony chain banked this run
  boss: boolean; // this was the boss finale
  maxBankScore: number; // the largest single bank this run
  chains: { convergence: number; harmony: number; accord: number; turn: number }; // chains banked this run
}


export function loadStats(): LifetimeStats {
  return readVersioned<LifetimeStats>(STATS_KEY, ZERO_STATS, SAVE_V);
}

export function resetStats(): void {
  try {
    removeStored(STATS_KEY);
    removeStored(DAILY_KEY);
  } catch {
    /* ignore */
  }
}

// ---- daily challenge progress (per local date) ----
export interface DailyState {
  date: string; // YYYY-MM-DD (local)
  progress: Record<string, number>; // challenge id -> best value achieved today
  done: string[]; // challenge ids completed today
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadDaily(): DailyState {
  const raw = readVersioned<DailyState>(DAILY_KEY, { date: todayKey(), progress: {}, done: [] }, SAVE_V);
  if (raw.date !== todayKey()) return { date: todayKey(), progress: {}, done: [] }; // a new day wipes progress
  return raw;
}

function saveDaily(d: DailyState): void {
  writeVersioned(DAILY_KEY, d, SAVE_V);
}

// ---- daily-challenge pop-ups: shown at most once per local day, per kind ----
const DAILY_POPUP_KEY = "glint.dailyPopup.v1";
export interface DailyPopupSeen {
  newDate?: string; // last date the "NEW CHALLENGES" pop-up was shown
  doneDate?: string; // last date the "CHALLENGE COMPLETED" pop-up was shown
}
export function loadDailyPopupSeen(): DailyPopupSeen {
  return readVersioned<DailyPopupSeen>(DAILY_POPUP_KEY, {}, SAVE_V);
}
export function markDailyPopupSeen(kind: "new" | "done"): void {
  const s = loadDailyPopupSeen();
  writeVersioned(DAILY_POPUP_KEY, { ...s, [kind === "new" ? "newDate" : "doneDate"]: todayKey() }, SAVE_V);
}

/** How one run's value folds into today's progress: "max" (the default) keeps
 *  the best single-run value; "sum" ACCUMULATES across today's runs — a
 *  "day"-scope challenge ("Clear a board 3 times") counts every run, starting
 *  from 0 at the daily rollover. */
export function foldDaily(prev: number, value: number, mode?: "max" | "sum"): number {
  return mode === "sum" ? prev + Math.max(0, value) : Math.max(prev, value);
}

/**
 * Fold a finished run into the lifetime stats, and update today's daily-challenge
 * progress. `evalDaily` maps today's active challenge ids to the value this run
 * achieved toward each (the caller supplies it, since challenge logic lives in
 * challenges.ts). Returns the ids that were newly completed by THIS run.
 */
export function recordRun(run: FinishedRun, evalDaily: (run: FinishedRun) => { id: string; value: number; target: number; mode?: "max" | "sum" }[]): string[] {
  const s = loadStats();
  s.gamesPlayed += 1;
  if (run.won) s.boardsCleared += 1;
  s.nebulitesAcquired += Math.max(0, run.nebulitesAcquired);
  s.drossSwept += Math.max(0, run.drossCleared);
  s.banksTotal += Math.max(0, run.banks);
  // deepestLevel is no longer tallied here — "deepest level" now means the
  // CURRENT FRONTIER (levels/progress) everywhere, so a reset truly resets it.
  // The field stays in the shape for save compatibility; readers ignore it.
  // no-bust streak: a clean completed run extends it; ANY bust resets it to 0.
  // (recordRun only fires on a genuinely finished game — a Replay mid-run never
  // reaches here, so abandoning doesn't touch the streak.)
  s.noBustStreak = (run.busts ?? 0) === 0 ? (s.noBustStreak ?? 0) + 1 : 0;
  if (run.reachedRush) { s.reachedRush = true; s.rushCount = (s.rushCount ?? 0) + 1; }
  if (run.cashedOut) { s.cashedOut = true; s.cashoutCount = (s.cashoutCount ?? 0) + 1; }
  if (run.fullDrift) s.fullDrift = true;
  s.fullDriftTotal = (s.fullDriftTotal ?? 0) + Math.max(0, run.fullDrifts ?? 0);
  if (run.won && run.shaped) s.clearedShaped = true;
  if (run.won && run.square) s.clearedSquare = true;
  if (run.harmony) s.bankedHarmony = true;
  if (run.won && run.boss) s.beatMasterCore = true;
  s.maxBankScore = Math.max(s.maxBankScore ?? 0, run.maxBankScore ?? 0);
  s.convergenceTotal = (s.convergenceTotal ?? 0) + (run.chains?.convergence ?? 0);
  s.harmonyTotal = (s.harmonyTotal ?? 0) + (run.chains?.harmony ?? 0);
  s.accordTotal = (s.accordTotal ?? 0) + (run.chains?.accord ?? 0);
  s.turnTotal = (s.turnTotal ?? 0) + (run.chains?.turn ?? 0);
  writeVersioned(STATS_KEY, s, SAVE_V);

  // daily progress
  const daily = loadDaily();
  const newly: string[] = [];
  for (const { id, value, target, mode } of evalDaily(run)) {
    daily.progress[id] = foldDaily(daily.progress[id] ?? 0, value, mode);
    if (daily.progress[id] >= target && !daily.done.includes(id)) {
      daily.done.push(id);
      newly.push(id);
    }
  }
  saveDaily(daily);
  return newly;
}

/** A CO-OP BOARD CLEARED — together games never reach recordRun, so the clear
 *  is credited here (each participant's device credits its own lifetime). */
export function recordCoopClear(): void {
  const s = loadStats();
  s.coopClears = (s.coopClears ?? 0) + 1;
  writeVersioned(STATS_KEY, s, SAVE_V);
}

/** A VERSUS WIN — vs the house (Broker duel) or another player online. Together
 *  games never reach recordRun (they don't touch solo records), so this is
 *  their one hook into the daily system: +1 into today's "versus"-type dailies
 *  (wins accumulate across games regardless of scope) and a lifetime counter.
 *  Returns the ids of dailies newly completed by this win. */
export function recordVersusWin(entries: { id: string; type: string; target: number }[], kind: "duel" | "online" = "online"): string[] {
  const s = loadStats();
  s.versusWins = (s.versusWins ?? 0) + 1;
  if (kind === "duel") s.duelWins = (s.duelWins ?? 0) + 1;
  else s.onlineVersusWins = (s.onlineVersusWins ?? 0) + 1;
  writeVersioned(STATS_KEY, s, SAVE_V);
  const daily = loadDaily();
  const newly: string[] = [];
  for (const e of entries) {
    if (e.type !== "versus") continue;
    daily.progress[e.id] = (daily.progress[e.id] ?? 0) + 1;
    if (daily.progress[e.id] >= e.target && !daily.done.includes(e.id)) {
      daily.done.push(e.id);
      newly.push(e.id);
    }
  }
  saveDaily(daily);
  return newly;
}
