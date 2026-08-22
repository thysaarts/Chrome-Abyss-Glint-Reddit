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
import { readVersioned, writeVersioned } from "./storage";
import { LifetimeStats, loadStats } from "./stats";
import type { FinishedRun } from "./stats";
import { storedFrontier } from "../levels/progress";

/** Closing out ALL of today's dailies pays this one-off Nebulite cherry —
 *  the wallet credit (App), the pop-up count-up and the tab chip all read it. */
export const SET_BONUS_NEBULITE = 10;

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
  | "turn" // internal chain name "Sweep"
  | "nobust" // the lifetime no-bust streak (games in a row without busting — target N; 1 = this game clean)
  | "versus"; // versus VICTORIES (vs the house or another player) — folded by recordVersusWin, never by solo runs

export interface DailyEntry {
  id: string;
  type: ObjectiveType;
  target: number;
  // "run" (default) = the target must be hit within one game; "day" = progress
  // ACCUMULATES across today's runs, from 0 at the daily rollover ("Clear a
  // board 3 times"). nobust ignores scope — it always reads the live streak.
  scope?: "run" | "day";
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

/** A "YYYY-MM-DD" local-date key as a plain day count (UTC arithmetic on the
 *  parsed parts — the key is already the player's local calendar date). */
function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  return Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / 86400000);
}

/** A cycle's freshly shuffled type wheel (before boundary smoothing). */
function rawWheel(cycle: number, types: string[]): string[] {
  const wheel = types.slice();
  const rng = mulberry32(hashStr(`cycle:${cycle}`));
  for (let i = wheel.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wheel[i], wheel[j]] = [wheel[j], wheel[i]];
  }
  return wheel;
}

/** The three objective types dealt on a given day: the day's window of the
 *  cycle wheel (reshuffled once per cycle, dealt three types per day, so days
 *  within a cycle never share a type — the windows partition one shuffle).
 *
 *  Boundary smoothing: the cycle's FIRST window must not repeat the previous
 *  cycle's LAST window, so repeats are swapped out to later slots. The whole
 *  cycle uses the one smoothed wheel (day windows stay disjoint), and swap
 *  targets exclude the cycle's own last window — a last window is therefore
 *  invariant under smoothing, which is what lets the previous cycle's be read
 *  straight off its raw shuffle. Net: consecutive days NEVER share a type
 *  (guaranteed with 9+ types in the bank; best-effort below that). */
function dealTypes(day: number, types: string[], cycleDays: number): string[] {
  const cycle = Math.floor(day / cycleDays);
  const wheel = rawWheel(cycle, types);
  if (cycleDays > 1) {
    const lastStart = (cycleDays - 1) * 3;
    const prev = new Set(rawWheel(cycle - 1, types).slice(lastStart, lastStart + 3));
    const okTarget = (q: number) => (q < lastStart || q >= lastStart + 3) && !prev.has(wheel[q]);
    let swap = 3;
    for (let p = 0; p < 3; p++) {
      if (!prev.has(wheel[p])) continue;
      while (swap < wheel.length && !okTarget(swap)) swap++;
      if (swap >= wheel.length) break;
      [wheel[p], wheel[swap]] = [wheel[swap], wheel[p]];
    }
  }
  const start = (day % cycleDays) * 3;
  return wheel.slice(start, start + 3);
}

/** The three daily challenges for a given local date, drawn from the CMS bank.
 *
 *  Guarantee: the three are all DIFFERENT objective types — never two "refine
 *  Nebulite" challenges on one day. The distinct types form a wheel that is
 *  reshuffled once per cycle (a cycle is floor(types/3) days) and dealt three
 *  types per day, so consecutive days share no type (cycle boundaries are
 *  smoothed — see dealTypes) and every type gets its turn before the wheel
 *  respins. WITHIN a type, the entry is chosen per-date, so a type's
 *  different bank variants still alternate. */
export function pickDailyChallenges(dateKey: string, bankOverride?: DailyEntry[]): DailyEntry[] {
  const bank = (bankOverride ?? CONTENT.challenges?.dailyBank ?? []) as DailyEntry[];
  if (bank.length <= 3) return bank.slice();

  // the bank grouped by objective type, in bank order
  const byType = new Map<string, DailyEntry[]>();
  for (const e of bank) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  const types = [...byType.keys()];

  const day = dayNumber(dateKey);
  const cycleDays = Math.max(1, Math.floor(types.length / 3));
  const todayTypes = dealTypes(day, types, cycleDays);

  // one entry per dealt type, chosen per-date
  const rng = mulberry32(hashStr(dateKey));
  const picks = todayTypes.map((t) => {
    const pool = byType.get(t)!;
    return pool[Math.floor(rng() * pool.length)];
  });

  // a bank with fewer than 3 distinct types cannot fill the set type-uniquely —
  // top up with unpicked entries so the day still gets its three
  const rest = bank.filter((e) => !picks.includes(e));
  while (picks.length < 3 && rest.length) {
    picks.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  return picks;
}

/** How far a finished run got toward an objective type (a raw value vs. target). */
export function measureRun(type: ObjectiveType, run: FinishedRun): number {
  switch (type) {
    case "dross": return run.drossCleared;
    case "score": return run.score;
    case "nebulite": return run.nebulitesAcquired;
    case "banks": return run.banks;
    case "fulldrift": return run.fullDrifts ?? (run.fullDrift ? 1 : 0);
    case "clear": return run.won ? 1 : 0;
    case "rush": return run.reachedRush ? 1 : 0;
    case "cashout": return run.cashedOut ? 1 : 0;
    case "bankscore": return run.maxBankScore ?? 0;
    case "convergence": return run.chains?.convergence ?? 0;
    case "harmony": return run.chains?.harmony ?? 0;
    case "accord": return run.chains?.accord ?? 0;
    case "turn": return run.chains?.turn ?? 0;
    // the SAME streak the Resurrect gem tracks: recordRun folds this run into
    // the stats (extend on clean, reset on any bust) BEFORE evaluating dailies,
    // so this reads the streak including the run that just finished
    case "nobust": return run.busts === 0 ? (loadStats().noBustStreak ?? 0) : 0;
    case "versus": return 0; // versus wins fold via recordVersusWin, not solo runs
  }
}

/** For recordRun: today's three challenges + what this run scored toward each.
 *  "day"-scope entries fold as a SUM across today's runs; everything else keeps
 *  the best single-run value. nobust always folds as max — measureRun already
 *  returns the whole streak, so summing would double-count it. */
export function evalDailyForRun(dateKey: string, run: FinishedRun): { id: string; value: number; target: number; mode: "max" | "sum" }[] {
  return pickDailyChallenges(dateKey).map((c) => ({
    id: c.id,
    value: measureRun(c.type, run),
    target: c.target,
    mode: c.scope === "day" && c.type !== "nobust" ? "sum" : "max",
  }));
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
    // "deepest level" IS the current frontier (highest unlocked level in this
    // account's progress) — a reset resets it; never a lifetime max
    case "deepestLevel": return storedFrontier();
    // the LIFETIME bottom row: together-game tallies
    case "duelWins": return s.duelWins ?? 0;
    case "onlineVersusWins": return s.onlineVersusWins ?? 0;
    case "coopClears": return s.coopClears ?? 0;
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

// ---- EXTRA GEMS (depth reward) ----
/** The CMS tier thresholds (campaign levels) at which a run deals another gem. */
export function extraGemTiers(): number[] {
  const t = (CONTENT.achievements as unknown as { extraGem?: { tiers?: number[] } }).extraGem?.tiers;
  return Array.isArray(t) ? t.filter((n) => typeof n === "number" && n > 0).slice().sort((a, b) => a - b) : [];
}

/** How many EXTRA GEMS this player's depth has earned (tiers passed). Frontier-
 *  based and permanent — it never un-earns, and it is declared in the RunSpec so
 *  the server replay builds the identical hand (it cannot see local progress). */
export function extraGemsFor(frontier: number = storedFrontier()): number {
  return extraGemTiers().filter((t) => frontier >= t).length;
}

/** How many EXTRA GEMS a given CAMPAIGN LEVEL deals. The tiers say where the
 *  reward applies, not just when it was earned: replaying a level BELOW a tier
 *  plays it as it was — a level-59 board never carries the level-60 reward.
 *  Bounded by what the player has actually earned (a level above the frontier
 *  is unplayable today, but the cap keeps that true if that ever changes). */
export function extraGemsForLevel(levelNum: number, frontier: number = storedFrontier()): number {
  return extraGemsFor(Math.min(levelNum, frontier));
}

/** Progress toward the NEXT extra gem: the bar + counter the Achievements page
 *  draws. `target` is the next tier (the last one once maxed). */
export function extraGemProgress(frontier: number = storedFrontier()): {
  tier: number; tiers: number[]; value: number; base: number; target: number; progress: number; maxed: boolean;
} {
  const tiers = extraGemTiers();
  const tier = tiers.filter((t) => frontier >= t).length;
  const maxed = tier >= tiers.length;
  const base = tier === 0 ? 0 : tiers[tier - 1];
  const target = maxed ? (tiers[tiers.length - 1] ?? 0) : tiers[tier];
  const progress = maxed ? 1 : Math.max(0, Math.min(1, (frontier - base) / Math.max(1, target - base)));
  return { tier, tiers, value: frontier, base, target, progress, maxed };
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
  // REDDIT ADAPTATION: no friends system here — the web build's `community`
  // achievement stays `cashedOut` on Reddit (same gem slot in the case).
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

/** Level-based achievements read the CURRENT FRONTIER (the highest unlocked
 *  level in this account's progress), NOT a lifetime stat — a reset resets
 *  them, and a level-1 player can never show "deepest 100" (decided
 *  2026-07-24). `frontier` is injectable so run-end diffing can compare the
 *  pre-run value against the post-run one. */
/** EARNED IS FOREVER (except "community", by design): several conditions read
 *  LIVE stats that can go back down — noBustStreak resets on a bust, and the
 *  Resurrect it unlocked used to vanish with it. Every earned achievement is
 *  LATCHED to storage the moment any evaluation sees it true; the latch syncs
 *  across devices (SYNC_KEYS, union merge). */
const LATCH_KEY = "glint.achievements.v1";
const LATCH_V = 1;
// (web's `community` achievement — the one allowed to un-earn itself — has no
// Reddit equivalent; every achievement here latches)
const NEVER_LATCH = new Set<string>();
let latchCache: Set<string> | null = null;
function latchedSet(): Set<string> {
  if (!latchCache) {
    const raw = readVersioned<string[]>(LATCH_KEY, [], LATCH_V);
    latchCache = new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  }
  return latchCache;
}
function latch(key: string): void {
  const s = latchedSet();
  if (s.has(key)) return;
  s.add(key);
  writeVersioned(LATCH_KEY, [...s], LATCH_V);
}

function achievementEarned(key: string, s: LifetimeStats, frontier: number = storedFrontier()): boolean {
  const live = achievementLive(key, s, frontier);
  if (NEVER_LATCH.has(key)) return live;
  if (live) { latch(key); return true; }
  return latchedSet().has(key);
}

function achievementLive(key: string, s: LifetimeStats, frontier: number): boolean {
  switch (key) {
    case "firstClear": return s.boardsCleared >= 1;
    case "rushHour": return s.reachedRush;
    case "cashedOut": return s.cashedOut;
    case "fullDrift": return s.fullDrift;
    case "motherLode": return s.nebulitesAcquired >= 1;
    case "trailblazer": return frontier >= 10;
    case "shapeShifter": return s.clearedShaped;
    case "harmonizer": return s.bankedHarmony;
    case "fourCorners": return s.clearedSquare;
    case "milestoner": return frontier >= 50;
    case "centurion": return s.gamesPlayed >= 100;
    case "masterCore": return s.beatMasterCore;
    // the three ability bonus-gems — earning the achievement unlocks the gem
    case "invincible": return (s.noBustStreak ?? 0) >= 30;
    case "crimsonEndurance": return frontier >= 40;
    case "superluminal": return (s.rushCount ?? 0) >= 100;
    default: return false;
  }
}

// the ability bonus-gems show live progress toward their goal (e.g. "12 / 30")
const REWARD_PROGRESS: Record<string, { of: (s: LifetimeStats, frontier: number) => number; target: number }> = {
  invincible: { of: (s) => s.noBustStreak ?? 0, target: 30 },
  crimsonEndurance: { of: (_s, frontier) => frontier, target: 40 },
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
export function abilityUnlocked(key: string, s: LifetimeStats, frontier: number = storedFrontier()): boolean {
  return devAbilitiesOn() || achievementEarned(key, s, frontier);
}

/** GENUINELY earned (never the dev ?abilities override) — the unlock CELEBRATION
 *  must only fire for the real thing. */
export function abilityAchieved(key: string, s: LifetimeStats, frontier: number = storedFrontier()): boolean {
  return achievementEarned(key, s, frontier);
}

/** UNLOCK CELEBRATIONS ARE PERSISTENT-UNTIL-SEEN: the popup used to exist only
 *  in the one run-end that crossed the threshold — Play again / exit / reload
 *  discarded it forever. Earned-but-uncelebrated gems now re-offer their popup
 *  at every run end until a Continue actually shows it. Device-local: each
 *  device celebrates once (a synced unlock still gets its moment). */
const CELEB_KEY = "glint.abilitycelebrated.v1";
const CELEB_V = 1;
export function celebratedAbilities(): Set<string> {
  const raw = readVersioned<string[]>(CELEB_KEY, [], CELEB_V);
  return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
}
export function markAbilitiesCelebrated(keys: string[]): void {
  const s = celebratedAbilities();
  for (const k of keys) s.add(k);
  writeVersioned(CELEB_KEY, [...s], CELEB_V);
}

export function computeAchievements(s: LifetimeStats, frontier: number = storedFrontier()): Achievement[] {
  const defs = (CONTENT.achievements?.rewards ?? []) as { key: string; name: string; desc: string }[];
  return defs.map((d) => {
    const earned = achievementEarned(d.key, s, frontier);
    return {
      key: d.key,
      name: d.name,
      desc: d.desc,
      earned,
      shape: REWARD_GEM[d.key]?.shape ?? "hexagon",
      color: REWARD_GEM[d.key]?.color ?? "#9d7bff",
      tileValue: REWARD_TILE[d.key],
      // once AWARDED the bar is a trophy, not a live meter: it stays full at
      // target/target even when the underlying stat later dips (e.g. a streak
      // resetting after the Resurrect was already earned)
      progress: REWARD_PROGRESS[d.key]
        ? {
            current: earned ? REWARD_PROGRESS[d.key].target : Math.min(REWARD_PROGRESS[d.key].of(s, frontier), REWARD_PROGRESS[d.key].target),
            target: REWARD_PROGRESS[d.key].target,
          }
        : undefined,
    };
  });
}

/** A lifetime stat-tile value by key (bestScore comes from the leaderboard). */
export function statValue(key: string, s: LifetimeStats, bestScore: number): number {
  if (key === "bestScore") return bestScore;
  return milestoneValue(key, s);
}
