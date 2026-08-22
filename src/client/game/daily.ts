/**
 * THE COMMUNITY DAILY — the pure maths of the shared board, in ONE module so
 * the client, the tests and the SERVER VERIFIER (src/server/verifyDaily.ts)
 * can never drift: the same UTC day always derives the same seed, metric and
 * fresh board everywhere.
 *
 * Ported from the web build's daily.ts (itself ported from this build's
 * original Community Daily — the maths has come home). KEEP PURE: no
 * window/localStorage/UI imports — this bundles into the Devvit server.
 */
import type { DailyMetric } from "../../shared/api";
import { newGame, GameState, NewGameOpts } from "./engine";

/** Today's date in UTC as YYYY-MM-DD — the whole world shares one "day". */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Deterministic board seed for a given UTC day. THE REDDIT SERVER'S exact
 *  derivation (FNV-1a, kept positive, mod 1e9) — src/server/index.ts must
 *  always agree with this, or the verifier replays the wrong board. */
export function dailySeed(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000_000;
}

// the specialist metrics that rotate on the "off" days (Tue/Thu/Sat/Sun)
const SPECIALIST: DailyMetric[] = ["bankscore", "refined", "nebulite", "banks", "chains"];

/** Which metric a day's board is ranked by — mirrors the server's rotation
 *  (Mon/Wed/Fri = raw score; other days cycle the specialists by day number). */
export function metricFor(day: string): DailyMetric {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay(); // 0=Sun … 6=Sat
  if (wd === 1 || wd === 3 || wd === 5) return "score";
  const dayNum = Math.floor(d.getTime() / 86_400_000);
  return SPECIALIST[dayNum % SPECIALIST.length] ?? "score";
}

/** The fixed board config for the daily — identical for everyone, launched with
 *  `start({ ...dailyGame(seed, metric), exact: true })`. No difficulty shift, no
 *  bonus gems, no bust rescue: a clean competitive board decided purely by the
 *  seed — plus the metric, which on "Most Nebulite refined" days must make its
 *  own goal reachable: a seeded 12-tile refine setup for both Duneglass and
 *  Vigilite (the campaign's nebuliteRig — the refine-rig parity rule). */
export function dailyGame(seed: number, metric: DailyMetric): NewGameOpts {
  return {
    seed,
    side: 6,
    collapseAt1: 30,
    collapseAt2: 15,
    singularityAt: 45,
    revealAt: 4,
    rescueMode: "off",
    handSize: 9,
    ...(metric === "refined" ? { nebuliteRig: true } : {}),
  };
}

/** The daily's FRESH board — the exact same initial state the client boots (exact
 *  mode: bonus gems forced off). Shared by the client, the replay test, and the
 *  server verifier so all three reproduce the identical board from a seed. */
export function dailyInitial(seed: number, metric: DailyMetric): GameState {
  return newGame({ ...dailyGame(seed, metric), bonusGems: { resurrect: false, quadriant: false, zenith: false } });
}

/** The run snapshot the daily reads at game end. */
export interface DailySnapshot {
  score: number;
  maxBankScore: number;
  nebulitesRefined: number;
  coresCollected: number;
  banks: number;
  chains: number; // total chains banked this run
  gameOver: boolean; // busted out (forfeits every metric)
}

/** GAME OVER = busted out of lives — NOT a cash-out or an out-of-tiles finish
 *  (the engine ends those with phase "lost" too). */
export const dailyGameOver = (g: GameState): boolean => g.phase === "lost" && g.cashedOut === 0 && g.livesLeft <= 0;

/** A finished state folded into the snapshot the metric reads. */
export function dailySnapshot(g: GameState): DailySnapshot {
  return {
    score: g.finalScore,
    maxBankScore: g.maxBankScore,
    nebulitesRefined: g.nebulitesRefined,
    coresCollected: g.coresCollected,
    banks: g.banks,
    chains: (g.chainCounts.Convergence ?? 0) + (g.chainCounts.Harmony ?? 0) + (g.chainCounts.Accord ?? 0) + (g.chainCounts.Sweep ?? 0),
    gameOver: dailyGameOver(g),
  };
}

/** The value a run scored toward a metric. A GAME OVER forfeits EVERY metric,
 *  score included: a failed run posts nothing to a competitive board (the
 *  2026-08-04 forfeit ruling). */
export function measureDaily(metric: DailyMetric, s: DailySnapshot): number {
  if (s.gameOver) return 0;
  switch (metric) {
    case "score": return Math.max(0, s.score);
    case "bankscore": return Math.max(0, s.maxBankScore);
    case "refined": return Math.max(0, s.nebulitesRefined);
    case "nebulite": return Math.max(0, s.coresCollected);
    case "banks": return Math.max(0, s.banks);
    case "chains": return Math.max(0, s.chains);
  }
}
