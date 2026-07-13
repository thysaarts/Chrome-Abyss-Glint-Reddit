/**
 * ACTIVATION DETECTION
 * ====================
 * The core of the corrected rule. When the player places ONE tile, it does not
 * merely add itself to a group — it ACTIVATES a whole combo by absorbing the
 * connected matching board tiles around the placement.
 *
 * Two combo families a placement can create:
 *  - a same-value blob: the placed tile + all edge-connected tiles of the SAME
 *    value (forms Echo/Trips/Quad/Pentad/Hex depending on size).
 *  - a straight: the placed tile sits in a connected run of CONSECUTIVE values
 *    (forms Drift / Long Drift / Full Drift).
 *
 * The function returns the best valid combo the placement forms, as the SET of
 * board cells involved (so the UI can glow them and the engine can clear them
 * on bank). Returns null if the placement forms no valid combo on its own.
 *
 * Existing combos elsewhere on the board are NOT activated — only the one the
 * placement directly creates/joins.
 */

import { Axial, keyOf, neighbours } from "./hex";
import { MineralValue } from "../theme/theme";
import { ComboName, COMBO_POINTS, chainBonus } from "./combos";

export const GLINT = 0;
export const CORE = 7;

export interface ActivatedCombo {
  name: ComboName;
  cells: string[]; // cell keys involved (includes the placed cell)
}

interface BoardView {
  cellSet: Set<string>;
  adj: Map<string, string[]>;
  valueAt: (key: string) => number | null; // 1..6, or GLINT/CORE, or null(gap)
  lockedCells?: Set<string>; // cells already in an activated combo (a locked joker-Core can't re-mirror)
}

/** value-at that overlays a hypothetical placement of `placedVal` at `placedKey`. */
function makeValueAt(
  base: (k: string) => number | null,
  placedKey: string,
  placedVal: number
): (k: string) => number | null {
  return (k: string) => (k === placedKey ? placedVal : base(k));
}

function isMineral(v: number | null): v is number {
  return v !== null && v !== GLINT && v !== CORE;
}

/** Connected same-value blob containing `start`, under a given value function. */
function sameValueBlob(
  start: string,
  value: number,
  view: BoardView,
  valueAt: (k: string) => number | null
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    if (valueAt(k) !== value) continue;
    seen.add(k);
    for (const nb of view.adj.get(k) ?? []) if (!seen.has(nb)) stack.push(nb);
  }
  return seen;
}

function setComboName(size: number, value: number): ComboName | null {
  if (size === 2 && (value === 2 || value === 6)) return "Echo";
  if (size === 3) return "Trips";
  if (size === 4) return "Quad";
  if (size === 5) return "Pentad";
  if (size === 6) return "Hex";
  // size 2 of a non-2/6 mineral is NOT a combo; >6 handled separately (nearest 6)
  return null;
}

/**
 * Breadth-first collect up to `limit` same-value cells starting from `start`,
 * expanding outward through same-value neighbours. Used when a same-value strand
 * is larger than 6: we bank a Hex from the 6 tiles NEAREST the placed tile.
 * Ties at the frontier are broken deterministically by the adjacency order.
 */
function bfsNearestSameValue(
  start: string,
  value: number,
  limit: number,
  view: BoardView,
  valueAt: (k: string) => number | null
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length && out.length < limit) {
    const k = queue.shift()!;
    if (valueAt(k) !== value) continue;
    out.push(k);
    for (const nb of view.adj.get(k) ?? []) {
      if (!seen.has(nb) && valueAt(nb) === value) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return out;
}

/**
 * Find the connected component (any mineral tiles) containing `placedKey`, and
 * within it try to find a straight (4, 5 or 6 consecutive values) that the placed
 * tile participates in. Returns the involved cells (one per value) or null.
 *
 * To keep the cells connected & sensible, we require that the chosen cells form
 * a connected sub-path; we approximate by: pick, for each needed value, a cell
 * of that value reachable from the placed cell through cells whose values are
 * within the band. This guarantees adjacency-connectivity of the straight.
 */
function findStraight(
  placedKey: string,
  placedVal: number,
  view: BoardView,
  valueAt: (k: string) => number | null,
  exclude?: Set<string>
): { name: ComboName; cells: string[] } | null {
  // BFS the connected mineral component around the placement
  const comp = new Set<string>();
  const stack = [placedKey];
  while (stack.length) {
    const k = stack.pop()!;
    if (comp.has(k)) continue;
    if (!isMineral(valueAt(k))) continue;
    comp.add(k);
    for (const nb of view.adj.get(k) ?? []) if (!comp.has(nb)) stack.push(nb);
  }

  // collect a representative cell for each value present in the component
  const cellsByValue = new Map<number, string[]>();
  for (const k of comp) {
    if (exclude?.has(k)) continue; // skip cells already used by another straight
    const v = valueAt(k)!;
    if (!cellsByValue.has(v)) cellsByValue.set(v, []);
    cellsByValue.get(v)!.push(k);
  }

  const nameByLength: Record<number, ComboName> = { 4: "Drift", 5: "LongDrift", 6: "FullDrift" };
  for (const length of [6, 5, 4] as const) {
    const lo = Math.max(1, placedVal - (length - 1));
    for (let start = lo; start <= placedVal; start++) {
      const band: number[] = [];
      for (let v = start; v < start + length; v++) band.push(v);
      if (band[0] < 1 || band[band.length - 1] > 6) continue;
      if (!band.includes(placedVal)) continue;
      if (band.every((v) => cellsByValue.has(v))) {
        // build a connected path covering one cell per band value, starting at placedKey.
        const chosen = buildConnectedStraight(placedKey, band, view, valueAt, exclude);
        if (chosen) {
          return { name: nameByLength[length], cells: chosen };
        }
      }
    }
  }
  return null;
}

/** EVERY maximal straight through the placed cell — the player-facing choice
 *  set. Same search as findStraight, but collecting instead of returning the
 *  first hit, then dropping any candidate whose cells are a subset of another's
 *  (a strictly-worse sub-band is never a meaningful choice). Order preserves
 *  the legacy preference (longest first, lowest band first), so index 0 is
 *  exactly what findStraight would have picked. */
function findAllStraights(
  placedKey: string,
  placedVal: number,
  view: BoardView,
  valueAt: (k: string) => number | null
): { name: ComboName; cells: string[] }[] {
  const comp = new Set<string>();
  const stack = [placedKey];
  while (stack.length) {
    const k = stack.pop()!;
    if (comp.has(k)) continue;
    if (!isMineral(valueAt(k))) continue;
    comp.add(k);
    for (const nb of view.adj.get(k) ?? []) if (!comp.has(nb)) stack.push(nb);
  }
  const cellsByValue = new Map<number, string[]>();
  for (const k of comp) {
    const v = valueAt(k)!;
    if (!cellsByValue.has(v)) cellsByValue.set(v, []);
    cellsByValue.get(v)!.push(k);
  }
  const nameByLength: Record<number, ComboName> = { 4: "Drift", 5: "LongDrift", 6: "FullDrift" };
  const found: { name: ComboName; cells: string[] }[] = [];
  for (const length of [6, 5, 4] as const) {
    const lo = Math.max(1, placedVal - (length - 1));
    for (let start = lo; start <= placedVal; start++) {
      const band: number[] = [];
      for (let v = start; v < start + length; v++) band.push(v);
      if (band[0] < 1 || band[band.length - 1] > 6) continue;
      if (!band.includes(placedVal)) continue;
      if (!band.every((v) => cellsByValue.has(v))) continue;
      // EVERY distinct physical chain for this band — the same value-band can
      // run through different tiles (a placed 6 with two 5s beside it has two
      // genuine 3-4-5-6 chains), and each is a real option the player may want.
      for (const cells of buildAllConnectedStraights(placedKey, band, view, valueAt)) {
        found.push({ name: nameByLength[length], cells });
      }
    }
  }
  // maximality: drop candidates whose cells are contained in another candidate's
  const keep = found.filter((a, i) =>
    !found.some((b, j) => j !== i && a.cells.every((k) => b.cells.includes(k)) && b.cells.length > a.cells.length)
  );
  // dedup identical cell sets (different band windows can land on the same cells)
  const seen = new Set<string>();
  return keep.filter((s) => {
    const sig = [...s.cells].sort().join("|");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/**
 * All DISTINCT ways this placement can resolve — the choice set for the
 * pre-select-and-confirm picker. Each entry is a full activation list (what
 * detectActivations would return had that straight been preferred): the
 * same-value set is common to every option; the options differ in WHICH
 * straight fires (and, without a set, which disjoint second straight rides
 * along). Index 0 is always the engine's classic best pick.
 */
export function enumerateActivationChoices(
  placedKey: string,
  placedVal: number,
  view: BoardView
): ActivatedCombo[][] {
  if (!isMineral(placedVal)) return [];
  const valueAt = makeValueAt(view.valueAt, placedKey, placedVal);

  const jokerCores = new Set<string>();
  for (const nb of view.adj.get(placedKey) ?? []) {
    if (view.valueAt(nb) === CORE && !view.lockedCells?.has(nb)) jokerCores.add(nb);
  }
  const setValueAt = (k: string): number | null => {
    if (k === placedKey) return placedVal;
    if (jokerCores.has(k)) return placedVal;
    return view.valueAt(k);
  };
  let setCombo: ActivatedCombo | null = null;
  const blob = sameValueBlob(placedKey, placedVal, view, setValueAt);
  if (blob.size >= 6) {
    setCombo = { name: "Hex", cells: bfsNearestSameValue(placedKey, placedVal, 6, view, setValueAt) };
  } else {
    const setName = setComboName(blob.size, placedVal);
    if (setName) setCombo = { name: setName, cells: [...blob] };
  }

  const straights = findAllStraights(placedKey, placedVal, view, valueAt);

  // A Nebulite that takes SHAPE this turn (an unlocked joker inside the set) becomes a FRESH
  // tile of placedVal — so, exactly like any freshly placed tile, it also activates a straight
  // running THROUGH it (a Drift the Nebulite sits in with its neighbours). Anchored on the
  // joker (read as placedVal), and only when it's part of a valid set — the set is what makes
  // the placement a legal build; the Drift rides along, just as a placed tile's does.
  const nebStraights: { name: ComboName; cells: string[] }[] = [];
  if (setCombo) {
    for (const jc of jokerCores) {
      if (!setCombo.cells.includes(jc)) continue;
      for (const st of findAllStraights(jc, placedVal, view, setValueAt)) nebStraights.push(st);
    }
  }
  const allStraights = [...straights, ...nebStraights];

  const options: ActivatedCombo[][] = [];
  if (allStraights.length === 0) {
    if (setCombo) options.push([setCombo]);
  } else if (setCombo) {
    for (const st of allStraights) options.push([setCombo, { name: st.name, cells: st.cells }]);
  } else {
    // no set: an option is one straight, or a pair of CELL-DISJOINT straights
    // (the engine activates at most two combos per placement). Every disjoint
    // pairing is a distinct option — three separate routes offer all three
    // pairs, not just the ones the classic pick happened to touch. Mirrored
    // pairs collapse in the signature dedup below.
    for (let i = 0; i < straights.length; i++) {
      const a = straights[i];
      const aCells = new Set(a.cells.filter((k) => k !== placedKey));
      let paired = false;
      for (let j = 0; j < straights.length; j++) {
        if (j === i) continue;
        const b = straights[j];
        if (b.cells.some((k) => k !== placedKey && aCells.has(k))) continue;
        options.push([
          { name: a.name, cells: a.cells },
          { name: b.name, cells: b.cells },
        ]);
        paired = true;
      }
      if (!paired) options.push([{ name: a.name, cells: a.cells }]);
    }
  }
  // dedup by full resolution signature
  const sigs = new Set<string>();
  const deduped = options.filter((o) => {
    const sig = o.map((c) => c.name + ":" + [...c.cells].sort().join(",")).sort().join("|");
    if (sigs.has(sig)) return false;
    sigs.add(sig);
    return true;
  });

  // SMART DEFAULT — the pre-selected option (index 0) must be the genuinely
  // best pick, and the engine commits index 0 when the player doesn't act:
  //  (1) most NEWLY banked tiles first — already-activated cells bank anyway,
  //      so an option that re-uses them adds less than one reaching fresh ones;
  //  (2) ties broken by ISOLATION: the option whose bank leaves more small
  //      remnants (a lone tile or a pair cut off sweeps for free) is the
  //      better position;
  //  (3) remaining ties keep the legacy discovery order (longest, lowest band).
  const activated = view.lockedCells ?? new Set<string>();
  const newCount = (o: ActivatedCombo[]): number => {
    const fresh = new Set<string>();
    for (const c of o) for (const k of c.cells) if (!activated.has(k)) fresh.add(k);
    return fresh.size;
  };
  const isoCount = (o: ActivatedCombo[]): number => {
    // bank the option's cells (plus everything already glowing, which banks
    // with them) and count the tiny components left behind
    const removed = new Set<string>(activated);
    for (const c of o) for (const k of c.cells) removed.add(k);
    removed.add(placedKey);
    const seen = new Set<string>();
    let score = 0;
    for (const k of view.cellSet) {
      if (seen.has(k) || removed.has(k) || valueAt(k) === null) continue;
      let size = 0;
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        for (const nb of view.adj.get(c) ?? []) {
          if (seen.has(nb) || removed.has(nb) || valueAt(nb) === null) continue;
          seen.add(nb);
          stack.push(nb);
        }
      }
      if (size <= 2) score++;
    }
    return score;
  };
  const scored = deduped.map((o, i) => ({ o, i, n: newCount(o), iso: isoCount(o) }));
  scored.sort((a, b) => b.n - a.n || b.iso - a.iso || a.i - b.i);

  // SAME-UNION COLLAPSE: two resolutions over the IDENTICAL set of cells are
  // indistinguishable in the picker (same blue ring, nothing grey to switch
  // to) and bank the same tiles — but their combo groupings can pay
  // differently. Keep only the highest-paying grouping per union; if that
  // leaves a single option, no picker ever opens (this was the "timer with
  // nothing to pick" sighting).
  const pointsOf = (o: ActivatedCombo[]): number => {
    let pts = 0;
    for (const c of o) pts += COMBO_POINTS[c.name] ?? 0;
    pts += chainBonus(o.map((c) => c.name)).points ?? 0;
    return pts;
  };
  const byUnion = new Map<string, { o: ActivatedCombo[]; i: number; pts: number }>();
  const orderKeys: string[] = [];
  for (const x of scored) {
    const union = [...new Set(x.o.flatMap((c) => c.cells))].sort().join("|");
    const pts = pointsOf(x.o);
    const cur = byUnion.get(union);
    if (!cur) {
      byUnion.set(union, { o: x.o, i: x.i, pts });
      orderKeys.push(union);
    } else if (pts > cur.pts) {
      byUnion.set(union, { o: x.o, i: cur.i, pts }); // keep the slot, upgrade the payout
    }
  }
  // cap the choice set so a dense cluster can't overwhelm the picker
  return orderKeys.map((u) => byUnion.get(u)!.o).slice(0, 6);
}

/**
 * Find a TRUE straight: a sequence of cells whose values are exactly the
 * consecutive band [start..start+len-1], where each cell is edge-adjacent to the
 * cell of the next value, AND the placed cell is part of the sequence.
 *
 * A reachability check is NOT enough (e.g. values 1,3,4 all touching a central 2
 * are "reachable" but do not form a 1-2-3-4 line). We require genuine
 * step-by-step adjacency between consecutive values.
 *
 * Approach: the placed cell has value placedVal at position `band.indexOf(placedVal)`.
 * We extend a chain downward (placedVal-1, -2, …) and upward (placedVal+1, …),
 * each step requiring an adjacent cell of exactly the next value. If both
 * directions can be filled to cover the whole band, it's a valid straight.
 */
function buildConnectedStraight(
  placedKey: string,
  band: number[],
  view: BoardView,
  valueAt: (k: string) => number | null,
  exclude?: Set<string>
): string[] | null {
  const placedVal = valueAt(placedKey)!;
  const idx = band.indexOf(placedVal);
  if (idx < 0) return null;

  const used = new Set<string>([placedKey]);
  const chain = new Map<number, string>();
  chain.set(placedVal, placedKey);

  // extend in one direction: from `fromKey` (value bandVal) find an adjacent cell
  // of value `nextVal`, recursing. Returns true if the whole direction filled.
  const extend = (fromKey: string, nextIndex: number, step: 1 | -1): boolean => {
    if (nextIndex < 0 || nextIndex >= band.length) return true; // reached the end
    const nextVal = band[nextIndex];
    for (const nb of view.adj.get(fromKey) ?? []) {
      if (used.has(nb)) continue;
      if (exclude?.has(nb)) continue; // cell reserved by another straight
      if (valueAt(nb) !== nextVal) continue;
      used.add(nb);
      chain.set(nextVal, nb);
      if (extend(nb, nextIndex + step, step)) return true;
      // backtrack
      used.delete(nb);
      chain.delete(nextVal);
    }
    return false;
  };

  // upward (increasing values) then downward (decreasing values)
  const upOk = extend(placedKey, idx + 1, 1);
  const downOk = upOk && extend(placedKey, idx - 1, -1);
  if (upOk && downOk && chain.size === band.length) {
    return [...chain.values()];
  }
  return null;
}

/**
 * EVERY distinct complete chain for a band — same walk as buildConnectedStraight
 * but exhaustive: instead of returning on the first full chain, the backtracking
 * continues and collects each complete filling (deduped by cell set, capped so a
 * dense same-value cluster can't explode the search). The FIRST result is the
 * chain buildConnectedStraight would have returned — discovery order is
 * identical — which keeps option 0 the engine's classic pick.
 */
function buildAllConnectedStraights(
  placedKey: string,
  band: number[],
  view: BoardView,
  valueAt: (k: string) => number | null,
  cap = 8
): string[][] {
  const placedVal = valueAt(placedKey)!;
  const idx = band.indexOf(placedVal);
  if (idx < 0) return [];

  const results: string[][] = [];
  const sigs = new Set<string>();
  const used = new Set<string>([placedKey]);
  const chain = new Map<number, string>([[placedVal, placedKey]]);

  // walk one direction exhaustively; every complete filling calls `done` (which
  // either starts the other direction or records the finished chain)
  const extend = (fromKey: string, nextIndex: number, step: 1 | -1, done: () => void): void => {
    if (results.length >= cap) return;
    if (nextIndex < 0 || nextIndex >= band.length) {
      done();
      return;
    }
    const nextVal = band[nextIndex];
    for (const nb of view.adj.get(fromKey) ?? []) {
      if (results.length >= cap) return;
      if (used.has(nb)) continue;
      if (valueAt(nb) !== nextVal) continue;
      used.add(nb);
      chain.set(nextVal, nb);
      extend(nb, nextIndex + step, step, done);
      used.delete(nb);
      chain.delete(nextVal);
    }
  };

  extend(placedKey, idx + 1, 1, () => {
    extend(placedKey, idx - 1, -1, () => {
      if (chain.size !== band.length) return;
      const cells = [...chain.values()];
      const sig = [...cells].sort().join("|");
      if (!sigs.has(sig)) {
        sigs.add(sig);
        results.push(cells);
      }
    });
  });
  return results;
}

/**
 * Given a placement, return the BEST valid combo it forms (set blob or straight),
 * or null if it forms none. Prefers larger tile counts. (Single-combo helper kept
 * for callers that only need the primary combo.)
 */
export function detectActivation(
  placedKey: string,
  placedVal: number,
  view: BoardView
): ActivatedCombo | null {
  const all = detectActivations(placedKey, placedVal, view);
  if (all.length === 0) return null;
  // primary = the one with the most cells
  return all.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
}

/**
 * Return EVERY combo a single placement legitimately forms, capped at two:
 *   - a same-value set (Echo/Trips/Quad/Pentad), or a Hex from the nearest 6 if
 *     the same-value strand is 6+
 *   - AND/OR a straight (Drift/FullDrift) through the placed cell
 * Allowed pairings: {set + straight} or {two distinct straights}. Two same-value
 * sets can't both apply (that's just one bigger blob). The placed cell is the
 * only tile that may belong to two combos.
 */
export function detectActivations(
  placedKey: string,
  placedVal: number,
  view: BoardView
): ActivatedCombo[] {
  if (!isMineral(placedVal)) return [];
  const valueAt = makeValueAt(view.valueAt, placedKey, placedVal);

  // RULE 1 (Core joker): a Core ADJACENT to the placed tile mirrors the placed
  // value for a MATCHING SET (not a straight). A Core that is ALREADY part of an
  // activated combo is LOCKED — it keeps the value it first mirrored and cannot be
  // re-mirrored or absorbed into a new combo until it banks and respawns.
  const jokerCores = new Set<string>();
  for (const nb of view.adj.get(placedKey) ?? []) {
    if (view.valueAt(nb) === CORE && !view.lockedCells?.has(nb)) jokerCores.add(nb);
  }
  const setValueAt = (k: string): number | null => {
    if (k === placedKey) return placedVal;
    if (jokerCores.has(k)) return placedVal; // Core mirrors the placed value
    return view.valueAt(k);
  };

  // --- the same-value set (or Hex from nearest 6), Core-joker aware ---
  let setCombo: ActivatedCombo | null = null;
  const blob = sameValueBlob(placedKey, placedVal, view, setValueAt);
  if (blob.size >= 6) {
    const six = bfsNearestSameValue(placedKey, placedVal, 6, view, setValueAt);
    setCombo = { name: "Hex", cells: six };
  } else {
    const setName = setComboName(blob.size, placedVal);
    if (setName) setCombo = { name: setName, cells: [...blob] };
  }

  // --- the best straight through the placed cell (NO Core joker for straights) ---
  const straight = findStraight(placedKey, placedVal, view, valueAt);

  // Case A: both a set and a straight -> activate BOTH (Drift + set).
  if (setCombo && straight) {
    return [setCombo, { name: straight.name, cells: straight.cells }];
  }

  // Case B: a straight but no set -> look for a SECOND distinct straight (two
  // Drifts through the placed cell, e.g. a 1-2-3-4 and a 3-4-5-6 sharing the 3).
  if (straight && !setCombo) {
    const exclude = new Set(straight.cells.filter((k) => k !== placedKey));
    const second = findStraight(placedKey, placedVal, view, valueAt, exclude);
    if (second) {
      return [
        { name: straight.name, cells: straight.cells },
        { name: second.name, cells: second.cells },
      ];
    }
    return [{ name: straight.name, cells: straight.cells }];
  }

  // Case C: only a set.
  if (setCombo) return [setCombo];
  return [];
}

/** Build a BoardView from a cells map + adjacency. */
export function makeBoardView(
  order: string[],
  adj: Map<string, string[]>,
  valueAt: (k: string) => number | null,
  lockedCells?: Set<string>
): BoardView {
  return { cellSet: new Set(order), adj, valueAt, lockedCells };
}
