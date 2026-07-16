import { describe, expect, it } from "vitest";
import { shrinkBoard, Cell } from "./shrink";
import { hexCells, keyOf } from "./hex";
import { newGame, place, isLegalTarget, GameState } from "./engine";

/**
 * BUG028 — tile conservation through the collapse.
 *
 * The engine's activated-combo list may hold OVERLAPPING entries: extending a
 * Trips into a Quad appends the Quad while the Trips stays listed, so most of
 * their cells are shared. The collapse places combos as rigid groups — and it
 * must never place the same source cell twice (that duplicated the shared
 * tiles: a 4-gem build came out of a collapse as a 14-gem cluster).
 *
 * The invariant: the multiset of tile values on the board is IDENTICAL before
 * and after a collapse. Nothing added, nothing lost, nothing revalued.
 */

function emptyBoard(side: number): { cells: Map<string, Cell>; order: string[] } {
  const cells = new Map<string, Cell>();
  const order: string[] = [];
  for (const c of hexCells(side)) {
    const k = keyOf(c);
    cells.set(k, { coord: c, tile: null, inert: false, buried: null, bonusGem: null });
    order.push(k);
  }
  return { cells, order };
}

const countValues = (cells: Map<string, Cell>): Map<number, number> => {
  const m = new Map<number, number>();
  for (const [, c] of cells) if (c.tile !== null) m.set(c.tile, (m.get(c.tile) ?? 0) + 1);
  return m;
};

describe("collapse conserves the tile multiset (bug028)", () => {
  it("overlapping activated combos are not duplicated by the remap", () => {
    const { cells, order } = emptyBoard(6);
    // a 5-tile same-value blob whose growth history left THREE overlapping
    // combo entries (Trips ⊂ Quad ⊂ Pentad) — exactly what extending produces
    const blob = ["0,0", "1,0", "1,-1", "2,-1", "2,-2"];
    for (const k of blob) cells.get(k)!.tile = 6; // Nuracite
    const combos = [
      { name: "Trips", cells: blob.slice(0, 3) },
      { name: "Quad", cells: blob.slice(0, 4) },
      { name: "Pentad", cells: blob.slice(0, 5) },
    ];
    // scatter some loose tiles, a few on the doomed outer ring
    const loose: [string, number][] = [["5,0", 1], ["0,5", 2], ["-5,5", 3], ["3,-5", 4], ["-2,-3", 5], ["4,-2", 6]];
    for (const [k, v] of loose) cells.get(k)!.tile = v;

    const before = countValues(cells);
    const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });
    const after = countValues(result.cells);

    expect(Object.fromEntries(after)).toEqual(Object.fromEntries(before));
    // every source cell must map to a UNIQUE destination
    const dests = [...result.mapping.values()];
    expect(new Set(dests).size).toBe(dests.length);
    // the activated combos survive, and their cells all exist on the new board
    for (const c of result.activatedCombos) {
      for (const k of c.cells) expect(result.cells.get(k)?.tile).not.toBeNull();
    }
  });

  it("a set+straight pair sharing one cell survives without duplication", () => {
    const { cells, order } = emptyBoard(6);
    // Trips of 3s and a Drift 1-2-3-4 sharing the "3" at 0,0 — the two-combo case
    const set3 = ["0,0", "0,-1", "1,-1"];
    const drift = ["0,0", "-1,1", "-1,2", "-2,3"];
    for (const k of set3) cells.get(k)!.tile = 3;
    cells.get("-1,1")!.tile = 2;
    cells.get("-1,2")!.tile = 1;
    cells.get("-2,3")!.tile = 4;
    // outer-ring stragglers to force real remapping work
    for (const [k, v] of [["5,-5", 6], ["-5,0", 6], ["0,5", 5]] as [string, number][]) cells.get(k)!.tile = v;

    const before = countValues(cells);
    const result = shrinkBoard({
      fromSide: 6,
      toSide: 5,
      cells,
      order,
      activatedCombos: [
        { name: "Trips", cells: set3 },
        { name: "Drift", cells: drift },
      ],
    });
    expect(Object.fromEntries(countValues(result.cells))).toEqual(Object.fromEntries(before));
    const dests = [...result.mapping.values()];
    expect(new Set(dests).size).toBe(dests.length);
  });

  it("activated cells always hold tiles after the FINAL collapse (decluster must not strand them)", () => {
    // the GLINT RUSH collapse (toSide 4) runs declusterIsolated; a combo that
    // fell to the scatter fallback can have isolated members, and moving them
    // (or moving another tile into a freed activated cell) strands the
    // activated lists — the live bust: placing on a stale 'activated' cell is
    // rejected as 'nothing newly activated'.
    let seed = 99;
    const rnd = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 300; run++) {
      const { cells, order } = emptyBoard(5);
      const keys = [...order];
      const occupied: string[] = [];
      for (const k of keys) {
        if (rnd() < 0.2) {
          cells.get(k)!.tile = 1 + Math.floor(rnd() * 6);
          occupied.push(k);
        }
      }
      if (occupied.length < 8) continue;
      const combos: { name: string; cells: string[] }[] = [];
      const comboCount = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < comboCount; i++) {
        const start = Math.floor(rnd() * (occupied.length - 5));
        const len = 2 + Math.floor(rnd() * 4);
        combos.push({ name: "Trips", cells: occupied.slice(start, start + len) });
      }
      const before = countValues(cells);
      const result = shrinkBoard({ fromSide: 5, toSide: 4, cells, order, activatedCombos: combos });
      expect(Object.fromEntries(countValues(result.cells)), `run ${run} conservation`).toEqual(Object.fromEntries(before));
      for (const c of result.activatedCombos) {
        for (const k of c.cells) {
          expect(result.cells.get(k)?.tile ?? null, `run ${run} activated cell ${k} must hold a tile`).not.toBeNull();
        }
      }
    }
  });

  it("holds across randomised overlapping-combo boards (200 seeds)", () => {
    let seed = 1;
    const rnd = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 200; run++) {
      const { cells, order } = emptyBoard(6);
      const keys = [...order];
      // random tiles
      const occupied: string[] = [];
      for (const k of keys) {
        if (rnd() < 0.25) {
          cells.get(k)!.tile = 1 + Math.floor(rnd() * 6);
          occupied.push(k);
        }
      }
      if (occupied.length < 8) continue;
      // build 1-3 combo entries from connected-ish slices, deliberately overlapping
      const combos: { name: string; cells: string[] }[] = [];
      const comboCount = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < comboCount; i++) {
        const start = Math.floor(rnd() * (occupied.length - 5));
        const len = 3 + Math.floor(rnd() * 3);
        combos.push({ name: "Trips", cells: occupied.slice(start, start + len) });
      }
      const before = countValues(cells);
      const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });
      const after = countValues(result.cells);
      expect(Object.fromEntries(after), `seed run ${run}`).toEqual(Object.fromEntries(before));
      const dests = [...result.mapping.values()];
      expect(new Set(dests).size, `seed run ${run} unique destinations`).toBe(dests.length);
    }
  });

  it("LIVE invariant: activated cells always hold tiles across seeded playthroughs", () => {
    // the end-to-end guard for the phantom-bust class: at no point in a real
    // game may the activated lists reference an empty cell (through collapses,
    // singularities, reshuffles, decluster — everything)
    const legalTargets = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));
    const offenders: string[] = [];
    for (let seed = 1; seed <= 120 && offenders.length === 0; seed++) {
      let g = newGame({ seed, side: 6 });
      for (let m = 0; m < 300 && g.phase === "playing"; m++) {
        const targets = legalTargets(g);
        if (targets.length === 0) break;
        g = place(g, targets[(seed * 31 + m * 17) % targets.length]);
        for (const k of g.activatedCells) {
          if ((g.cells.get(k)?.tile ?? null) === null) {
            offenders.push(`seed ${seed} move ${m}: activated cell ${k} is empty (side ${g.side})`);
            break;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 120000);
});