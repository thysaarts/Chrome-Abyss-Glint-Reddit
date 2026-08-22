/**
 * RUN CONFIG — the single source of truth for how a SOLO run's game config is
 * built from a compact, verifiable spec.
 *
 * ANTI-CHEAT (all-time board): the client submits {spec, moves} at run end; the
 * verify-alltime edge function rebuilds the initial board from the SAME spec via
 * this module (bundled — see src/net/verifyEntry.ts), replays the moves, and the
 * score is whatever they actually produce. Because BOTH sides derive the config
 * from the spec through this one function, a client cannot smuggle a doctored
 * board (extra Nebulites, softer collapse points…) — everything about the run
 * except the seed and the difficulty/bonus-gem knobs (legitimate for everyone)
 * is pinned by the level number.
 *
 * KEEP PURE: no window/localStorage/UI imports — this bundles into a Deno edge
 * function. The difficulty table lives HERE and src/ui/settings.ts reads it, so
 * client and server can never drift.
 */
import { NewGameOpts, GameState, newGame } from "./engine";
import { LEVELS, LEVEL_DEFS } from "../levels/levels";

export type RunDifficulty = "easy" | "medium" | "hard";

/** Difficulty → the ENGINE-affecting knobs (UI knobs like the picker timer live in
 *  settings.ts). collapseShift moves the collapse/singularity triggers; revealAt is
 *  the hand-reveal threshold; rescueMode drives the engine's invisible bust rescue. */
export const DIFFICULTY_KNOBS: Record<RunDifficulty, { collapseShift: number; revealAt: number; rescueMode: "off" | "easy" | "medium"; handBonus: number }> = {
  // handBonus: extra STARTING tiles. Easy opens with one more, so the first few
  // placements have more choice — the hand refills from play either way, so this
  // eases the opening without meaningfully inflating the final score.
  easy: { collapseShift: 2, revealAt: 5, rescueMode: "easy", handBonus: 1 },
  medium: { collapseShift: 0, revealAt: 4, rescueMode: "medium", handBonus: 0 },
  hard: { collapseShift: -1, revealAt: 3, rescueMode: "off", handBonus: 0 },
};

export interface RunSpec {
  kind: "quick" | "level";
  levelNum?: number; // required when kind === "level"
  seed: number;
  /** only present when a Restart kept the previous board's obstacle carving */
  obstacleSeed?: number;
  difficulty: RunDifficulty;
  bonusGems: { resurrect: boolean; quadriant: boolean; zenith: boolean };
  /** EXTRA GEMS earned by depth (challenges.extraGemsFor). Declared here because
   *  the server replay cannot see local campaign progress. Absent on specs queued
   *  before the feature shipped — treated as 0. */
  extraGems?: number;
}

/** Structural validation — the server's whole input check. Everything else about
 *  the config is DERIVED, so a valid spec cannot describe an illegitimate board. */
export function validateRunSpec(s: unknown): s is RunSpec {
  if (!s || typeof s !== "object") return false;
  const r = s as Record<string, unknown>;
  if (r.kind !== "quick" && r.kind !== "level") return false;
  if (r.kind === "level" && !(Number.isInteger(r.levelNum) && (r.levelNum as number) >= 0 && (r.levelNum as number) < LEVELS.length)) return false;
  if (!Number.isInteger(r.seed) || (r.seed as number) <= 0) return false;
  if (r.obstacleSeed !== undefined && !Number.isInteger(r.obstacleSeed)) return false;
  if (r.difficulty !== "easy" && r.difficulty !== "medium" && r.difficulty !== "hard") return false;
  const b = r.bonusGems as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") return false;
  for (const k of ["resurrect", "quadriant", "zenith"]) if (typeof b[k] !== "boolean") return false;
  // optional (older queued specs omit it); when present it must be a sane count
  if (r.extraGems !== undefined && !(Number.isInteger(r.extraGems) && (r.extraGems as number) >= 0 && (r.extraGems as number) <= 6)) return false;
  return true;
}

/** The FULLY-RESOLVED newGame options for a spec — every engine-relevant field
 *  explicit (no defaults left to the caller), so the client's exact-mode start and
 *  the server's replay compose the identical initial state. Mirrors the difficulty
 *  math the game hook used to apply inline (shift + clamps). */
export function runOpts(spec: RunSpec): NewGameOpts {
  const knobs = DIFFICULTY_KNOBS[spec.difficulty];
  const level = spec.kind === "level" ? LEVELS[spec.levelNum!] : undefined;
  const p = level?.params;
  const shift = knobs.collapseShift;
  // EXTRA GEMS: the depth reward the spec declares, plus Easy's standing bonus.
  // (The per-level `extraTiles` param is retired — depth alone controls this.)
  const extraGems = Math.min(6, (spec.extraGems ?? 0) + knobs.handBonus);
  return {
    seed: spec.seed,
    side: p?.side ?? 6,
    shape: p?.boardShape,
    nebulites: p?.nebulites,
    dross: p?.dross,
    gaps: p?.gaps,
    obstacles: p?.obstacles,
    ...(spec.obstacleSeed !== undefined ? { obstacleSeed: spec.obstacleSeed } : {}),
    collapseAt1: Math.max(4, (p?.collapseAt1 ?? 30) + shift),
    collapseAt2: Math.max(3, (p?.collapseAt2 ?? 15) + shift),
    singularityAt: Math.max(6, (p?.singularityAt ?? 45) + shift),
    revealAt: knobs.revealAt,
    rescueMode: knobs.rescueMode,
    handSize: 9 + extraGems,
    extraGems,
    bonusGems: spec.bonusGems,
    // the next level unlocks via "Acquire N Nebulite" → this level guarantees a
    // refinable 12-tile setup (same rule launchLevel applied)
    nebuliteRig: level ? LEVEL_DEFS[level.num + 1]?.unlockRule?.type === "nebuliteAcquired" : undefined,
    // the GUIDED boards (Level 0's practice runs, Level 1 The Academy's closing
    // board) deal kindly — pinned to the level number here, so the server's replay
    // rigs exactly the same runs the client does
    tutorialRig: spec.kind === "level" && (spec.levelNum === 0 || spec.levelNum === 1),
  };
}

/** The spec's fresh initial board — the server-side anchor for the replay. */
export function runInitial(spec: RunSpec): GameState {
  return newGame({ handSize: 9, ...runOpts(spec) });
}

/** The leaderboard label — computed SERVER-side so it can't be spoofed. */
export function runLabel(spec: RunSpec): string {
  if (spec.kind === "level") {
    const lv = LEVELS[spec.levelNum!];
    return lv ? `Lv${lv.num}: ${lv.title}` : "Quick Start";
  }
  return "Quick Start";
}
