/**
 * CHALLENGES / MILESTONES / REWARDS logic.
 *
 * Daily challenges are pulled from a CMS-managed BANK (content.challenges.dailyBank):
 * three are chosen per day, deterministically from the local date, so everyone
 * gets the same three that day without a server. Objectives are evaluated by a
 * fixed `type` the engine understands; the display text, target and reward come
 * from the CMS.
 *
 * Milestones (lifetime count-ups) and rewards (achievements) read their names from
 * the CMS and their thresholds / earn-conditions here.
 */
import { CONTENT } from "../content/content";
import { LifetimeStats } from "./stats";
import type { FinishedRun } from "./stats";

export type ObjectiveType =
  | "dross"
  | "score"
  | "nebulite"
  | "fulldrift"
  | "clear"
  | "banks"
  | "rush"
  | "cashout"
  | "bankscore" // the largest SINGLE bank (combo/chain, multiplier included)
  | "convergence" // chains banked
  | "harmony"
  | "accord"
  | "turn"; // internal chain name "Sweep"

export interface DailyEntry {
  id: string;
  type: ObjectiveType;
  target: number;
  text: string;
  // the reward on completion: "nebulite" pays +5 Nebulite; the other kinds grant a
  // specific Collection item, referenced by its id/key in rewardId.
  rewardKind: "nebulite" | "sticker" | "music" | "theme";
  rewardId: string;
  icon?: string; // a Glyph key (see ui/Glyphs); empty → the type's own glyph
}

// ---- seeded RNG from a date string (same day → same picks for everyone) ----
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The three daily challenges for a given local date, drawn from the CMS bank. */
export function pickDailyChallenges(dateKey: string): DailyEntry[] {
  const bank = (CONTENT.challenges?.dailyBank ?? []) as DailyEntry[];
  if (bank.length <= 3) return bank.slice();
  const rng = mulberry32(hashStr(dateKey));
  const idx = bank.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 3).map((i) => bank[i]);
}

/** How far a finished run got toward an objective type (a raw value vs. target). */
export function measureRun(type: ObjectiveType, run: FinishedRun): number {
  switch (type) {
    case "dross": return run.drossCleared;
    case "score": return run.score;
    case "nebulite": return run.nebulitesAcquired;
    case "banks": return run.banks;
    case "fulldrift": return run.fullDrift ? 1 : 0;
    case "clear": return run.won ? 1 : 0;
    case "rush": return run.reachedRush ? 1 : 0;
    case "cashout": return run.cashedOut ? 1 : 0;
    case "bankscore": return run.maxBankScore ?? 0;
    case "convergence": return run.chains?.convergence ?? 0;
    case "harmony": return run.chains?.harmony ?? 0;
    case "accord": return run.chains?.accord ?? 0;
    case "turn": return run.chains?.turn ?? 0;
  }
}

/** For recordRun: today's three challenges + what this run scored toward each. */
export function evalDailyForRun(dateKey: string, run: FinishedRun): { id: string; value: number; target: number }[] {
  return pickDailyChallenges(dateKey).map((c) => ({ id: c.id, value: measureRun(c.type, run), target: c.target }));
}

// ---- milestones (lifetime count-ups) ----
/** One milestone tier: a lifetime threshold and the REAL reward crossing it
 *  grants — Nebulite (a flat `amount`) or a specific Collection item. */
export interface MilestoneTier {
  threshold: number;
  rewardKind: string; // "nebulite" | "sticker" | "music" | "theme"
  rewardId: string; // the item id/key (empty for nebulite)
  amount: number; // nebulite payout (ignored for items)
}

export interface Milestone {
  key: string;
  name: string;
  value: number;
  tier: number; // how many thresholds passed
  target: number; // the next threshold (== value's max when maxed)
  base: number; // the previous threshold (bar starts here)
  progress: number; // 0..1 within the current tier
  nextReward: MilestoneTier | null;
  maxed: boolean;
}

interface MilestoneDef {
  key: string;
  name: string;
  tiers?: MilestoneTier[];
  // legacy shape (pre-structured tiers) — a stale CMS draft may still carry it
  thresholds?: number[];
  rewards?: string[];
}

/** A def's tiers, tolerating the legacy thresholds/rewards shape. */
function tiersOf(d: MilestoneDef): MilestoneTier[] {
  if (Array.isArray(d.tiers)) return d.tiers;
  return (d.thresholds ?? []).map((t, i) => ({ threshold: t, rewardKind: "nebulite", rewardId: "", amount: 10 * (i + 1) }));
}

function milestoneValue(key: string, s: LifetimeStats): number {
  switch (key) {
    case "boardsCleared": return s.boardsCleared;
    case "nebulitesAcquired": return s.nebulitesAcquired;
    case "drossSwept": return s.drossSwept;
    case "banksTotal": return s.banksTotal;
    case "gamesPlayed": return s.gamesPlayed;
    case "deepestLevel": return s.deepestLevel;
    default: return 0;
  }
}

export function computeMilestones(s: LifetimeStats): Milestone[] {
  const defs = (CONTENT.challenges?.milestones ?? []) as MilestoneDef[];
  return defs.map((d) => {
    const tiers = tiersOf(d);
    const value = milestoneValue(d.key, s);
    let tier = 0;
    while (tier < tiers.length && value >= tiers[tier].threshold) tier++;
    const maxed = tier >= tiers.length;
    const base = tier === 0 ? 0 : tiers[tier - 1].threshold;
    const target = maxed ? (tiers[tiers.length - 1]?.threshold ?? 0) : tiers[tier].threshold;
    const progress = maxed ? 1 : Math.max(0, Math.min(1, (value - base) / Math.max(1, target - base)));
    return { key: d.key, name: d.name, value, tier, target, base, progress, nextReward: maxed ? null : tiers[tier], maxed };
  });
}

/** The tiers a finished run just crossed (prev value < threshold ≤ new value) —
 *  these are the milestone rewards to grant at run end. */
export function crossedMilestoneTiers(prev: LifetimeStats, next: LifetimeStats): MilestoneTier[] {
  const defs = (CONTENT.challenges?.milestones ?? []) as MilestoneDef[];
  const crossed: MilestoneTier[] = [];
  for (const d of defs) {
    const before = milestoneValue(d.key, prev);
    const after = milestoneValue(d.key, next);
    for (const t of tiersOf(d)) {
      if (before < t.threshold && after >= t.threshold) crossed.push(t);
    }
  }
  return crossed;
}

// ---- rewards / achievements ----
export interface Achievement {
  key: string;
  name: string;
  desc: string;
  earned: boolean;
  shape: string;
  color: string;
  // ACHIEVEMENT BONUS GEMS render the real in-game crystal (TileGem) rather than
  // the flat display gem: this is that tile's value (8/9/10), else undefined
  tileValue?: number;
  // live progress toward the goal (e.g. 12 of 30) — bonus-gem achievements only
  progress?: { current: number; target: number };
}

// gem shape + colour per achievement key (the display; names/descs come from CMS)
const REWARD_GEM: Record<string, { shape: string; color: string }> = {
  firstClear: { shape: "heptagon", color: "#7fe9f5" },
  rushHour: { shape: "invtri", color: "#ff9a5a" },
  cashedOut: { shape: "octagon", color: "#ffd166" },
  fullDrift: { shape: "kite", color: "#9d7bff" },
  motherLode: { shape: "marquise", color: "#ff6fa5" },
  trailblazer: { shape: "lozenge", color: "#34d98b" },
  shapeShifter: { shape: "pear", color: "#5fe0d0" },
  harmonizer: { shape: "trillion", color: "#c9b0ff" },
  fourCorners: { shape: "square", color: "#ffd166" },
  milestoner: { shape: "stone", color: "#b8c0cc" },
  centurion: { shape: "emerald", color: "#6aa8ff" },
  masterCore: { shape: "nonagon", color: "#ff5a76" },
};

// the three ACHIEVEMENT BONUS GEMS render the real crystal (TileGem value) — their
// gem case tile shows the exact heart / ruby radiant / elongated-hex the game uses
const REWARD_TILE: Record<string, number> = {
  invincible: 8, // RESURRECT (heart)
  crimsonEndurance: 9, // QUADRIANT (ruby radiant)
  superluminal: 10, // SUPERLUMINAL (elongated hex)
};

function achievementEarned(key: string, s: LifetimeStats): boolean {
  switch (key) {
    case "firstClear": return s.boardsCleared >= 1;
    case "rushHour": return s.reachedRush;
    case "cashedOut": return s.cashedOut;
    case "fullDrift": return s.fullDrift;
    case "motherLode": return s.nebulitesAcquired >= 1;
    case "trailblazer": return s.deepestLevel >= 10;
    case "shapeShifter": return s.clearedShaped;
    case "harmonizer": return s.bankedHarmony;
    case "fourCorners": return s.clearedSquare;
    case "milestoner": return s.deepestLevel >= 50;
    case "centurion": return s.gamesPlayed >= 100;
    case "masterCore": return s.beatMasterCore;
    // the three ability bonus-gems — earning the achievement unlocks the gem
    case "invincible": return (s.noBustStreak ?? 0) >= 30;
    case "crimsonEndurance": return s.deepestLevel >= 40;
    case "superluminal": return (s.rushCount ?? 0) >= 100;
    default: return false;
  }
}

// the ability bonus-gems show live progress toward their goal (e.g. "12 / 30")
const REWARD_PROGRESS: Record<string, { of: (s: LifetimeStats) => number; target: number }> = {
  invincible: { of: (s) => s.noBustStreak ?? 0, target: 30 },
  crimsonEndurance: { of: (s) => s.deepestLevel, target: 40 },
  superluminal: { of: (s) => s.rushCount ?? 0, target: 100 },
};

/** DEV/TEST: `?abilities=1` in the URL force-unlocks the three ability gems for
 *  the session (session only, no saved progress touched) — so the buried/dealt
 *  mechanics can be exercised without grinding the achievements. */
function devAbilitiesOn(): boolean {
  try {
    return typeof location !== "undefined" && new URLSearchParams(location.search).has("abilities");
  } catch {
    return false;
  }
}

/** True once the achievement that grants this bonus gem is earned — the gem then
 *  seeds in games. Keyed by achievement key ("invincible"/"crimsonEndurance"/
 *  "superluminal"). abilityUnlocked is only ever called for those three keys. */
export function abilityUnlocked(key: string, s: LifetimeStats): boolean {
  return devAbilitiesOn() || achievementEarned(key, s);
}

export function computeAchievements(s: LifetimeStats): Achievement[] {
  const defs = (CONTENT.achievements?.rewards ?? []) as { key: string; name: string; desc: string }[];
  return defs.map((d) => ({
    key: d.key,
    name: d.name,
    desc: d.desc,
    earned: achievementEarned(d.key, s),
    shape: REWARD_GEM[d.key]?.shape ?? "hexagon",
    color: REWARD_GEM[d.key]?.color ?? "#9d7bff",
    tileValue: REWARD_TILE[d.key],
    progress: REWARD_PROGRESS[d.key]
      ? { current: Math.min(REWARD_PROGRESS[d.key].of(s), REWARD_PROGRESS[d.key].target), target: REWARD_PROGRESS[d.key].target }
      : undefined,
  }));
}

/** A lifetime stat-tile value by key (bestScore comes from the leaderboard). */
export function statValue(key: string, s: LifetimeStats, bestScore: number): number {
  if (key === "bestScore") return bestScore;
  return milestoneValue(key, s);
}
