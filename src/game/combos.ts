/**
 * COMBOS & SCORING
 * ================
 * A combo is detected ONLY on the set of tiles the player has ACTIVATED this
 * turn (the glowing-outline group). Existing board combos the player has not
 * touched never count.
 *
 * Matched-set family: Echo (pair of 2s or 6s only), Trips(3), Quad(4),
 *                     Pentad(5), Hex(6 — self-banks).
 * Sequence family:    Drift (4 consecutive distinct values),
 *                     Long Drift (5 consecutive),
 *                     Full Drift (6 consecutive — self-banks).
 *
 * Banking threshold: an activated group banks only when it totals >= 6 tiles
 * AND decomposes cleanly into valid combos.
 */

import { MineralValue } from "../theme/theme";

export type ComboName = "Echo" | "Trips" | "Quad" | "Pentad" | "Hex" | "Drift" | "LongDrift" | "FullDrift";
// Sweep = two Drifts banked together (Chrome Abyss language for multiple Drifts)
export type ChainName = "Convergence" | "Harmony" | "Accord" | "Sweep";

export const COMBO_POINTS: Record<ComboName, number> = {
  Echo: 300,
  Trips: 300,
  Quad: 400,
  Pentad: 500,
  Hex: 600,
  Drift: 400,
  LongDrift: 600,
  FullDrift: 800,
};

/** How many tiles each combo name accounts for (used to reconcile a bank's named
 *  combos against the tiles actually banked). */
export const COMBO_SIZE: Record<ComboName, number> = {
  Echo: 2,
  Trips: 3,
  Quad: 4,
  Pentad: 5,
  Hex: 6,
  Drift: 4,
  LongDrift: 5,
  FullDrift: 6,
};

export const CHAIN_POINTS: Record<ChainName, number> = {
  Convergence: 100,
  Harmony: 300,
  Accord: 200,
  Sweep: 200,
};

export const CORE_BONUS = 500;
export const ZENITH_BONUS = 6000; // flat bonus a Zenith adds to the bank it completes (or banked unused)
export const BANK_THRESHOLD = 6;
export const BOARD_CLEAR_BONUS = 5000; // Rule 4: flat bonus for clearing the board
export const BOARD_CLEAR_BONUS_BIG = 7500; // a bigger wedge board (>91 cells)
export const BOARD_CLEAR_BONUS_SQUARE = 10000; // the biggest board — the full square

/** The clear bonus for a board that STARTED as `startShape`: the standard
 *  hexagon (or a smaller board) pays 5000; a corner-wedge board pays 7500; the
 *  full square — the biggest board there is — pays 10000. */
export function boardClearBonus(startShape: string): number {
  if (startShape === "square") return BOARD_CLEAR_BONUS_SQUARE;
  if (startShape && startShape !== "hexagon") return BOARD_CLEAR_BONUS_BIG;
  return BOARD_CLEAR_BONUS;
}

function counter(values: MineralValue[]): Map<MineralValue, number> {
  const m = new Map<MineralValue, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

const DRIFT_BY_LEN: Record<number, ComboName> = { 4: "Drift", 5: "LongDrift", 6: "FullDrift" };

/** Try to express a multiset as a chain of valid combos. Returns combo names or null. */
function decompose(cnt: Map<MineralValue, number>): ComboName[] | null {
  if (cnt.size === 0) return [];

  // Try a run first (longest first): 6/5/4 consecutive distinct single values.
  const singles = [...cnt.entries()].filter(([, k]) => k === 1).map(([v]) => v).sort((a, b) => a - b);
  for (const len of [6, 5, 4]) {
    for (let i = 0; i + len - 1 < singles.length; i++) {
      const w = singles.slice(i, i + len);
      if (w[len - 1] - w[0] === len - 1) {
        const next = new Map(cnt);
        for (const v of w) {
          const nv = (next.get(v) ?? 0) - 1;
          if (nv === 0) next.delete(v);
          else next.set(v, nv);
        }
        const rest = decompose(next);
        if (rest) return [DRIFT_BY_LEN[len], ...rest];
      }
    }
  }

  // Try a matched-set combo using the whole pile of the most frequent value.
  const byFreq = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  for (const [v, k] of byFreq) {
    let name: ComboName | null = null;
    if (k === 2 && (v === 2 || v === 6)) name = "Echo";
    else if (k === 3) name = "Trips";
    else if (k === 4) name = "Quad";
    else if (k === 5) name = "Pentad";
    else if (k === 6) name = "Hex";
    if (name) {
      const next = new Map(cnt);
      next.delete(v);
      const rest = decompose(next);
      if (rest) return [name, ...rest];
    }
  }
  return null;
}

export interface ComboResult {
  ok: boolean;
  names: ComboName[];
  tiles: number;
  selfBanks: boolean; // Hex or FullDrift completed on its own
}

/**
 * Is this activated group a legal BUILD IN PROGRESS — i.e. either a complete
 * valid combo/chain, OR a valid prefix that can still grow into one?
 *
 * This is what makes placing the first tile of a group legal (a group of 1 is
 * a valid prefix of every combo), and a pair of same-value tiles legal (prefix
 * of Trips/Quad/...), etc., without them yet scoring.
 *
 * Rules for a valid prefix:
 *   - empty or single tile: always a valid prefix.
 *   - all same value: a valid prefix of an n-of-a-kind (any count up to 6).
 *   - all distinct & consecutive: a valid prefix of a straight (Drift/FullDrift).
 *   - otherwise: try to peel off ONE completed sub-combo and check the rest is
 *     a valid prefix (supports building a chain: a completed Trips plus a
 *     growing second set).
 */
export function isBuildablePrefix(values: MineralValue[]): boolean {
  const n = values.length;
  if (n <= 1) return true;
  const cnt = counter(values);

  // all same value -> prefix of n-of-a-kind (cap 6)
  if (cnt.size === 1) {
    const [, k] = [...cnt.entries()][0];
    return k <= 6;
  }

  // all distinct & consecutive -> prefix of a straight
  const allSingle = [...cnt.values()].every((k) => k === 1);
  if (allSingle) {
    const vals = [...cnt.keys()].sort((a, b) => a - b);
    const consecutive = vals[vals.length - 1] - vals[0] + 1 === vals.length;
    if (consecutive && vals.length <= 6) return true;
  }

  // chain-in-progress: peel one completed sub-combo, rest must be a valid prefix
  // try peeling a completed n-of-a-kind (3,4,5,6 or Echo) from the most frequent
  for (const [v, k] of [...cnt.entries()].sort((a, b) => b[1] - a[1])) {
    let peelable = false;
    if (k === 3 || k === 4 || k === 5 || k === 6) peelable = true;
    if (k === 2 && (v === 2 || v === 6)) peelable = true;
    if (peelable) {
      const rest: MineralValue[] = [];
      for (const [vv, kk] of cnt) {
        if (vv === v) continue;
        for (let i = 0; i < kk; i++) rest.push(vv);
      }
      if (isBuildablePrefix(rest)) return true;
    }
  }
  // try peeling a completed run (Drift/Long Drift/Full Drift — consecutive singles)
  const singles = [...cnt.entries()].filter(([, k]) => k === 1).map(([v]) => v).sort((a, b) => a - b);
  for (const len of [6, 5, 4]) {
    for (let i = 0; i + len - 1 < singles.length; i++) {
      const w = singles.slice(i, i + len);
      if (w[len - 1] - w[0] === len - 1) {
        const used = new Set(w);
        const rest: MineralValue[] = [];
        for (const [vv, kk] of cnt) {
          const copies = used.has(vv) ? kk - 1 : kk;
          for (let j = 0; j < copies; j++) rest.push(vv);
        }
        if (isBuildablePrefix(rest)) return true;
      }
    }
  }

  return false;
}

/** Classify an activated group (by its mineral values). */
export function classifyGroup(values: MineralValue[]): ComboResult {
  const n = values.length;
  const cnt = counter(values);

  // Pure single combos -------------------------------------------------
  if (cnt.size === 1) {
    const [v, k] = [...cnt.entries()][0];
    if (k === 2 && (v === 2 || v === 6)) return { ok: true, names: ["Echo"], tiles: 2, selfBanks: false };
    if (k === 3) return { ok: true, names: ["Trips"], tiles: 3, selfBanks: false };
    if (k === 4) return { ok: true, names: ["Quad"], tiles: 4, selfBanks: false };
    if (k === 5) return { ok: true, names: ["Pentad"], tiles: 5, selfBanks: false };
    if (k === 6) return { ok: true, names: ["Hex"], tiles: 6, selfBanks: true };
    return { ok: false, names: [], tiles: n, selfBanks: false };
  }

  // Straight? all distinct, consecutive ---------------------------------
  const allSingle = [...cnt.values()].every((k) => k === 1);
  if (allSingle) {
    const vals = [...cnt.keys()].sort((a, b) => a - b);
    const run = vals[vals.length - 1] - vals[0] + 1 === vals.length;
    if (run && vals.length === 4) return { ok: true, names: ["Drift"], tiles: 4, selfBanks: false };
    if (run && vals.length === 5) return { ok: true, names: ["LongDrift"], tiles: 5, selfBanks: false };
    if (run && vals.length === 6) return { ok: true, names: ["FullDrift"], tiles: 6, selfBanks: true };
  }

  // Chains --------------------------------------------------------------
  const combos = decompose(cnt);
  if (combos) {
    const selfBanks = combos.length === 1 && (combos[0] === "Hex" || combos[0] === "FullDrift");
    return { ok: true, names: combos, tiles: n, selfBanks };
  }

  return { ok: false, names: [], tiles: n, selfBanks: false };
}

/** Which chain bonus (if any) applies to a multi-combo bank. Drift and Long Drift
 *  both count toward Accord and Sweep (Full Drift too, when it lands in a chain). */
export function chainBonus(names: ComboName[]): { name: ChainName | null; points: number } {
  if (names.length <= 1) return { name: null, points: 0 };
  const sets = names.filter((n) => n === "Echo" || n === "Trips" || n === "Quad" || n === "Pentad");
  const drifts = names.filter((n) => n === "Drift" || n === "LongDrift" || n === "FullDrift");

  if (drifts.length === 2 && names.length === 2) return { name: "Sweep", points: CHAIN_POINTS.Sweep };
  if (drifts.length >= 1 && sets.length >= 1) return { name: "Accord", points: CHAIN_POINTS.Accord };
  if (sets.length === 3 && drifts.length === 0) return { name: "Harmony", points: CHAIN_POINTS.Harmony };
  if (sets.length === 2 && drifts.length === 0) return { name: "Convergence", points: CHAIN_POINTS.Convergence };
  return { name: null, points: 0 };
}

/**
 * Final banked score for an activated group.
 * order: base sum -> x multiplier -> + chain bonus (+ core bonus if applicable)
 */
export function scoreBank(opts: {
  names: ComboName[];
  multiplier: number; // covered tile's value, or 1 for a gap-fill finish
  coveredCore: boolean;
  bonusBase?: number; // QUADRIANT: added to the base BEFORE the multiplier applies
}): { total: number; base: number; chain: { name: ChainName | null; points: number } } {
  const base = opts.names.reduce((s, n) => s + COMBO_POINTS[n], 0);
  const chain = chainBonus(opts.names);
  let total = (base + (opts.bonusBase ?? 0)) * opts.multiplier + chain.points;
  if (opts.coveredCore) total += CORE_BONUS;
  return { total, base, chain };
}
