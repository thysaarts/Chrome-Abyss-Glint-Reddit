/**
 * BOARD SHRINK (the Abyss collapses)
 * ==================================
 * When the larger board (side-6, 91 cells) drops to a low tile count, it collapses
 * to the next size down (side-5, 61 cells). The remap re-concentrates the surviving
 * tiles so stranded pieces can become adjacent again — the lever that makes a full
 * clear actually reachable.
 *
 * Remap priority (to keep things intact):
 *   1. PRE-BANKED (activated) combos are mapped FIRST, as rigid groups. If a combo
 *      lies entirely on rings 0-4 it doesn't move at all. If it touches ring 5, we
 *      search for a translation of the whole combo shape that lands every cell on a
 *      free cell of the new board, preferring the smallest shift.
 *   2. Loose tiles on rings 0-4 keep their position.
 *   3. Loose tiles on ring 5 (which has no equivalent on the smaller board) collapse
 *      inward to the nearest free cell, preferring the same angular direction.
 *   4. Any remaining conflicts spill to the nearest free cell.
 *
 * The function is pure-ish: it builds and returns the new cells/order/adj plus the
 * mapping (oldKey -> newKey) and the relocated activated-combo cell lists, so the
 * engine can rebuild GameState and the UI can animate the movement.
 */

import { Axial, keyOf, parseKey, hexCells, neighbours, ringOf, hexDistance, HEX_DIRS } from "./hex";

export interface Cell {
  coord: Axial;
  tile: number | null;
  inert: boolean;
  buried: number | null;
  bonusGem?: number | null; // hidden achievement gem — must travel with its tile
}

export interface ShrinkInput {
  fromSide: number;
  toSide: number;
  cells: Map<string, Cell>;
  order: string[];
  activatedCombos: { name: string; cells: string[] }[];
  /** hole cells of the collapsing board: only CENTRAL ones survive the collapse
   *  (those inside the new footprint, most central first), capped at ceil(60%)
   *  of the previous count, and never at the cost of connectivity or capacity */
  obstacles?: string[];
}

export interface ShrinkResult {
  side: number;
  cells: Map<string, Cell>;
  order: string[];
  adj: Map<string, string[]>;
  mapping: Map<string, string>; // oldKey -> newKey (for occupied cells that moved/kept)
  activatedCombos: { name: string; cells: string[] }[]; // with remapped cell keys
  obstacles: string[]; // the holes that survived onto the new board
  orphanedBonus: number[]; // bonus-gem values whose covering tile the collapse discarded
}

/** All candidate cells of the target board, ordered by ring then angle (stable). */
function targetCells(toSide: number): Axial[] {
  return hexCells(toSide);
}

/** Angle of a cell from centre (for "same direction" preference). */
function angleOf(c: Axial): number {
  // convert axial to pixel-ish to get a stable angle
  const x = c.q + c.r / 2;
  const y = c.r;
  return Math.atan2(y, x);
}

/** Nearest free target cell to `from`, preferring same ring/angle. */
function nearestFree(from: Axial, free: Set<string>, targetSet: Set<string>): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  const fa = angleOf(from);
  for (const k of free) {
    const c = parseKey(k);
    if (!targetSet.has(k)) continue;
    const d = hexDistance(from, c);
    // angular difference (0..pi)
    let da = Math.abs(angleOf(c) - fa);
    if (da > Math.PI) da = 2 * Math.PI - da;
    const score = d * 10 + da; // distance dominates, angle breaks ties
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/**
 * Try to place a rigid combo (a set of old cells) onto the target board. Returns a
 * map oldCellKey -> newCellKey if a fitting translation exists, else null.
 * We try the identity translation first (no move), then expanding shifts.
 */
function placeRigidCombo(
  comboCells: string[],
  free: Set<string>,
  targetSet: Set<string>
): Map<string, string> | null {
  const coords = comboCells.map(parseKey);
  // candidate translations: 0 (identity), then all vectors toward centre up to a few steps
  const tries: Axial[] = [{ q: 0, r: 0 }];
  for (let radius = 1; radius <= 4; radius++) {
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) === radius) {
          tries.push({ q, r });
        }
      }
    }
  }
  for (const t of tries) {
    const mapped = coords.map((c) => ({ q: c.q + t.q, r: c.r + t.r }));
    const keys = mapped.map(keyOf);
    const ok = keys.every((k) => targetSet.has(k) && free.has(k));
    const noDup = new Set(keys).size === keys.length;
    if (ok && noDup) {
      const m = new Map<string, string>();
      comboCells.forEach((oldK, i) => m.set(oldK, keys[i]));
      return m;
    }
  }
  return null;
}

/**
 * GLINT RUSH de-island pass: relocate any occupied tile that ended up with NO
 * occupied neighbours to the nearest free cell that IS adjacent to the surviving
 * cluster, so the small final board reads as one group rather than scattered singles.
 * Loose tiles only (activated combo cells are ≥2-adjacent, so never isolated).
 * Updates `mapping` so the UI still animates each tile to its final spot.
 */
function declusterIsolated(
  newCells: Map<string, Cell>,
  target: Axial[],
  targetSet: Set<string>,
  mapping: Map<string, string>,
  activatedSet: Set<string>
): void {
  const nbrs = new Map<string, string[]>();
  for (const c of target) nbrs.set(keyOf(c), neighbours(c, targetSet).map(keyOf));
  const occ = (k: string) => (newCells.get(k)?.tile ?? null) !== null;
  // an ACTIVATED cell is never "isolated": relocating a player's activated tile
  // would strand the combo lists (a stale activated cell then rejects the next
  // placement as "nothing newly activated" — a phantom bust)
  const isIsolated = (k: string) => occ(k) && !activatedSet.has(k) && !nbrs.get(k)!.some(occ);
  const repoint = (fromK: string, toK: string) => {
    for (const [oldK, newK] of mapping) if (newK === fromK) { mapping.set(oldK, toK); break; }
  };
  let guard = 0;
  let moved = true;
  while (moved && guard++ < 30) {
    moved = false;
    for (const c of target) {
      const k = keyOf(c);
      if (!isIsolated(k)) continue;
      // nearest free cell that touches an occupied tile other than k (an attach point)
      let best: string | null = null;
      let bestD = Infinity;
      for (const c2 of target) {
        const fk = keyOf(c2);
        if (occ(fk)) continue;
        if (!nbrs.get(fk)!.some((nn) => nn !== k && occ(nn))) continue;
        const d = hexDistance(c, c2);
        if (d < bestD) { bestD = d; best = fk; }
      }
      if (!best) continue;
      const src = newCells.get(k)!;
      const dst = newCells.get(best)!;
      dst.tile = src.tile; dst.inert = src.inert; dst.buried = src.buried;
      if (src.bonusGem) { dst.bonusGem = src.bonusGem; src.bonusGem = null; }
      src.tile = null; src.inert = false; src.buried = null;
      repoint(k, best);
      moved = true;
    }
  }
}

export function shrinkBoard(input: ShrinkInput): ShrinkResult {
  const { toSide, cells, order, activatedCombos } = input;
  let target = targetCells(toSide);
  const targetSet = new Set(target.map(keyOf));

  // ---- obstacle carry-through: keep only CENTRAL holes, max ceil(60%) of the
  // previous count; outer-rim holes simply vanish. Each kept hole must leave the
  // new board connected and with room for every surviving tile. ----
  const keptObstacles: string[] = [];
  const prevObstacles = input.obstacles ?? [];
  if (prevObstacles.length > 0) {
    const occupiedTiles = order.filter((k) => (cells.get(k)?.tile ?? null) !== null).length;
    const cap = Math.ceil(prevObstacles.length * 0.6);
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
    const central = prevObstacles
      .filter((k) => targetSet.has(k))
      .sort((a, b) => ringOf(parseKey(a)) - ringOf(parseKey(b))); // most central first
    for (const k of central) {
      if (keptObstacles.length >= cap) break;
      if (targetSet.size - 1 <= occupiedTiles + 2) break; // keep breathing room
      targetSet.delete(k);
      if (isConnected(targetSet)) keptObstacles.push(k);
      else targetSet.add(k); // would split the smaller board — this hole vanishes
    }
    target = target.filter((c) => targetSet.has(keyOf(c)));
  }

  const free = new Set(targetSet); // cells not yet assigned

  // new cell store, all empty to start
  const newCells = new Map<string, Cell>();
  for (const c of target) {
    newCells.set(keyOf(c), { coord: c, tile: null, inert: false, buried: null, bonusGem: null });
  }

  const mapping = new Map<string, string>();
  const placeTile = (oldKey: string, newKey: string) => {
    const src = cells.get(oldKey)!;
    const dst = newCells.get(newKey)!;
    dst.tile = src.tile;
    dst.inert = src.inert;
    dst.buried = src.buried;
    dst.bonusGem = src.bonusGem ?? null;
    free.delete(newKey);
    mapping.set(oldKey, newKey);
  };

  // ---- 1. activated combos first, as rigid groups ----
  // The combo list may hold OVERLAPPING entries (extending a Trips to a Quad
  // appends the Quad while the Trips stays listed — they share cells; a set and
  // a straight can share one). A source cell must be placed exactly ONCE: cells
  // already mapped by an earlier combo keep their destination and merely PIN the
  // translation for the rest of this combo (bug028 — re-placing shared cells
  // duplicated their tiles, conjuring gems out of a collapse).
  const newActivated: { name: string; cells: string[] }[] = [];
  for (const combo of activatedCombos) {
    const fixed = combo.cells.filter((k) => mapping.has(k));
    const pending = [...new Set(combo.cells.filter((k) => !mapping.has(k)))];
    let m: Map<string, string> | null = null;

    if (fixed.length === 0) {
      m = placeRigidCombo(combo.cells, free, targetSet);
      if (m) for (const [oldK, newK] of m) placeTile(oldK, newK);
    } else {
      // shared cells pin the translation: every fixed cell must agree on ONE
      // shift, and every pending cell must land free under that same shift
      const o0 = parseKey(fixed[0]);
      const n0 = parseKey(mapping.get(fixed[0])!);
      const t = { q: n0.q - o0.q, r: n0.r - o0.r };
      const consistent = fixed.every((k) => {
        const o = parseKey(k);
        const n = parseKey(mapping.get(k)!);
        return n.q - o.q === t.q && n.r - o.r === t.r;
      });
      if (consistent) {
        const shift = (k: string) => {
          const c = parseKey(k);
          return keyOf({ q: c.q + t.q, r: c.r + t.r });
        };
        const targets = pending.map(shift);
        const ok = targets.every((k) => targetSet.has(k) && free.has(k)) && new Set(targets).size === targets.length;
        if (ok) {
          m = new Map<string, string>();
          for (const k of fixed) m.set(k, mapping.get(k)!);
          pending.forEach((k, i) => {
            placeTile(k, targets[i]);
            m!.set(k, targets[i]);
          });
        }
      }
    }

    if (m) {
      newActivated.push({ name: combo.name, cells: combo.cells.map((k) => m!.get(k)!) });
    } else {
      // couldn't keep it rigid; already-placed cells stay put, the rest are
      // placed individually (best effort) — never a second copy of any cell.
      const placed: string[] = fixed.map((k) => mapping.get(k)!);
      for (const oldK of pending) {
        const c = parseKey(oldK);
        const dest = targetSet.has(oldK) && free.has(oldK) ? oldK : nearestFree(c, free, targetSet);
        if (dest) { placeTile(oldK, dest); placed.push(dest); }
      }
      const unique = [...new Set(placed)];
      if (unique.length >= 2) newActivated.push({ name: combo.name, cells: unique });
    }
  }

  // ---- 2 & 3. loose occupied tiles: interior keeps, ring-(fromSide-1) collapses ----
  const interiorRing = toSide - 1; // rings 0..interiorRing exist on the new board
  // first, all interior loose tiles that can keep their spot
  for (const oldKey of order) {
    if (mapping.has(oldKey)) continue; // already placed (was in a combo)
    const cell = cells.get(oldKey)!;
    if (cell.tile === null) continue; // gap, nothing to move
    const c = parseKey(oldKey);
    if (ringOf(c) <= interiorRing && free.has(oldKey)) {
      placeTile(oldKey, oldKey); // stays in place
    }
  }
  // then, the remaining loose tiles (outer ring, or interior cells whose spot got
  // taken) collapse to the nearest free cell.
  for (const oldKey of order) {
    if (mapping.has(oldKey)) continue;
    const cell = cells.get(oldKey)!;
    if (cell.tile === null) continue;
    const c = parseKey(oldKey);
    const dest = nearestFree(c, free, targetSet);
    if (dest) placeTile(oldKey, dest);
    // if no free cell at all (board full) the tile is dropped — shouldn't happen
    // since we only shrink when tile count < new board size.
  }

  // ---- GLINT RUSH: on the final collapse to 37 cells, consolidate any stragglers
  // next to the cluster so the small board isn't a scatter of lone tiles ----
  if (toSide === 4) {
    const activatedSet = new Set(newActivated.flatMap((c) => c.cells));
    declusterIsolated(newCells, target, targetSet, mapping, activatedSet);
  }

  // ---- validate the remapped combos: every activated cell must hold a tile ----
  const prunedActivated = newActivated
    .map((c) => ({ name: c.name, cells: c.cells.filter((k) => (newCells.get(k)?.tile ?? null) !== null) }))
    .filter((c) => c.cells.length >= 2);

  // ---- rebuild adjacency for the new board ----
  const adj = new Map<string, string[]>();
  for (const c of target) {
    adj.set(keyOf(c), neighbours(c, targetSet).map(keyOf));
  }
  const newOrder = target.map(keyOf);

  // ACHIEVEMENT BONUS GEMS whose covering tile fell into the abyss (an old cell
  // NOT remapped onto the new board): don't lose an EARNED ability to a collapse.
  // Count gems before (old board) vs after (new board); the shortfall is orphaned.
  const tally = (m: Map<string, Cell>) => {
    const c = new Map<number, number>();
    for (const [, cell] of m) if (cell.bonusGem != null) c.set(cell.bonusGem, (c.get(cell.bonusGem) ?? 0) + 1);
    return c;
  };
  const before = tally(cells as Map<string, Cell>);
  const after = tally(newCells);
  const orphanedBonus: number[] = [];
  for (const [gem, bc] of before) for (let i = 0; i < bc - (after.get(gem) ?? 0); i++) orphanedBonus.push(gem);

  return { side: toSide, cells: newCells, order: newOrder, adj, mapping, activatedCombos: prunedActivated, obstacles: keptObstacles, orphanedBonus };
}
