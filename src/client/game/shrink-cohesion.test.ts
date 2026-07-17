import { describe, expect, it } from "vitest";
import { shrinkBoard, Cell } from "./shrink";
import { hexCells, keyOf, parseKey, neighbours } from "./hex";
import { newGame, place, isLegalTarget, GameState } from "./engine";

/**
 * DECISION RECORD R1 / R3 / R4 — activated combos come out of a collapse CONNECTED.
 *
 * R1: when a combo can't stay rigid, its stray cells are placed TOUCHING the
 *     entry's already-placed cells whenever the geometry allows.
 * R3: a tile is never left scattered-but-glowing — if an entry can't be kept in
 *     one piece it is de-activated (its gems stay on the board as plain tiles;
 *     the engine's isolation pass banks any that ended up fully cut off).
 * R4: the WHOLE broken entry de-activates — a Quad missing its D is not a Quad.
 *     Overlapping entries that survived intact (the Trips inside it) keep their
 *     own cells activated.
 *
 * The invariant, checked here at the shrink level and across live playthroughs:
 * every activated-combo entry returned by a collapse is one connected group.
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

function entryConnected(cells: string[]): boolean {
  if (cells.length <= 1) return true;
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = parseKey(stack.pop()!);
    for (const n of neighbours(c, set)) {
      const nk = keyOf(n);
      if (!seen.has(nk)) { seen.add(nk); stack.push(nk); }
    }
  }
  return seen.size === set.size;
}

describe("collapse keeps activated combos connected (decision record R1/R3/R4)", () => {
  it("a combo that cannot stay whole is de-activated, never returned in pieces", () => {
    // A Trips on rings 2-4 (keeps its place through a 6→5 collapse) extended to a
    // Quad whose D sits on ring 5 — a ring that does not exist on the new board,
    // so the pinned translation always fails and D must be placed individually.
    // Activated pair-walls occupy every target cell touching the Trips, so no
    // attaching placement exists either. Old behaviour: D scatters to a far free
    // cell and the Quad comes out disconnected but still glowing. Required:
    // the Quad de-activates whole (R3/R4) while the intact Trips inside it stays.
    const { cells, order } = emptyBoard(6);
    const trips = ["2,0", "3,0", "4,0"];
    const dKey = "5,0"; // ring 5 — no identity target on the side-5 board
    for (const k of [...trips, dKey]) cells.get(k)!.tile = 6;
    const wallPairs: string[][] = [
      ["1,0", "1,1"],
      ["2,-1", "3,-1"],
      ["2,1", "3,1"],
      ["4,-1", "4,-2"],
    ];
    for (const pair of wallPairs) for (const k of pair) cells.get(k)!.tile = 2;

    const combos = [
      ...wallPairs.map((p) => ({ name: "Echo", cells: p })),
      { name: "Trips", cells: trips },
      { name: "Quad", cells: [...trips, dKey] },
    ];
    const before = countValues(cells);
    const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });

    // conservation still holds — de-activation edits the ledger, never the tiles
    expect(Object.fromEntries(countValues(result.cells))).toEqual(Object.fromEntries(before));
    // THE INVARIANT: every surviving entry is one connected group
    for (const c of result.activatedCombos) {
      expect(entryConnected(c.cells), `${c.name} [${c.cells.join(" ")}] must be connected`).toBe(true);
    }
    // the intact Trips survives even though the Quad had to die
    const tripsEntry = result.activatedCombos.find((c) => c.name === "Trips");
    expect(tripsEntry, "the intact Trips entry must survive the collapse").toBeTruthy();
  });

  it("R1: a stray cell attaches to its combo when a touching cell is free", () => {
    // Same shape, no walls: D (ring 5) must be placed individually — and with
    // free cells touching the Trips available, the Quad must come out CONNECTED,
    // not merely "somewhere nearby".
    const { cells, order } = emptyBoard(6);
    const trips = ["2,0", "3,0", "4,0"];
    const dKey = "5,0";
    for (const k of [...trips, dKey]) cells.get(k)!.tile = 6;
    const combos = [
      { name: "Trips", cells: trips },
      { name: "Quad", cells: [...trips, dKey] },
    ];
    const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });
    const quad = result.activatedCombos.find((c) => c.name === "Quad");
    expect(quad, "the Quad survives — an attaching cell was free").toBeTruthy();
    expect(entryConnected(quad!.cells), `Quad [${quad!.cells.join(" ")}] connected`).toBe(true);
    expect(quad!.cells.length).toBe(4);
  });

  it("R4 downgrade: a one-shot Pentad losing its stray gem becomes a legal Quad", () => {
    // A Pentad along the q-axis whose E sits on ring 5 (no identity target).
    // An Echo of 6s shares its first two cells, so the Pentad takes the PINNED
    // path (identity) and only E needs individual placement — which the walls
    // deny any attaching cell. The Pentad breaks; its surviving 4-gem remainder
    // is a valid Quad and must come out as one, still glowing.
    const { cells, order } = emptyBoard(6);
    const line = ["1,0", "2,0", "3,0", "4,0"];
    const eKey = "5,0";
    for (const k of [...line, eKey]) cells.get(k)!.tile = 6;
    const wallPairs: string[][] = [
      ["0,0", "0,1"],
      ["1,1", "2,1"],
      ["3,1", "2,2"],
      ["1,-1", "2,-1"],
      ["3,-1", "4,-1"],
    ];
    for (const pair of wallPairs) for (const k of pair) cells.get(k)!.tile = 2;
    const combos = [
      ...wallPairs.map((p) => ({ name: "Echo", cells: p })),
      { name: "Echo", cells: ["1,0", "2,0"] }, // pins the Pentad's translation
      { name: "Pentad", cells: [...line, eKey] },
    ];
    const before = countValues(cells);
    const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });

    expect(Object.fromEntries(countValues(result.cells))).toEqual(Object.fromEntries(before));
    for (const c of result.activatedCombos) {
      expect(entryConnected(c.cells), `${c.name} [${c.cells.join(" ")}] connected`).toBe(true);
    }
    expect(result.activatedCombos.find((c) => c.name === "Pentad")).toBeUndefined();
    const quad = result.activatedCombos.find((c) => c.name === "Quad");
    expect(quad, "the 4-gem remainder downgrades to a Quad").toBeTruthy();
    expect([...quad!.cells].sort()).toEqual([...line].sort());
  });

  it("R4 downgrade: a Long Drift losing its end gem becomes a legal Drift", () => {
    const { cells, order } = emptyBoard(6);
    const line = ["1,0", "2,0", "3,0", "4,0"];
    const eKey = "5,0";
    const runVals = [2, 3, 4, 5];
    line.forEach((k, i) => { cells.get(k)!.tile = runVals[i]; });
    cells.get(eKey)!.tile = 6; // the run's 6, stranded on ring 5
    const wallPairs: string[][] = [
      ["0,0", "0,1"],
      ["1,1", "2,1"],
      ["3,1", "2,2"],
      ["1,-1", "2,-1"],
      ["3,-1", "4,-1"],
    ];
    for (const pair of wallPairs) for (const k of pair) cells.get(k)!.tile = 2;
    const combos = [
      ...wallPairs.map((p) => ({ name: "Echo", cells: p })),
      { name: "Echo", cells: ["0,0", "1,0"] }, // shares 1,0 → pins the drift's translation
      { name: "LongDrift", cells: [...line, eKey] },
    ];
    const result = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: combos });
    for (const c of result.activatedCombos) {
      expect(entryConnected(c.cells), `${c.name} [${c.cells.join(" ")}] connected`).toBe(true);
    }
    expect(result.activatedCombos.find((c) => c.name === "LongDrift")).toBeUndefined();
    const drift = result.activatedCombos.find((c) => c.name === "Drift");
    expect(drift, "the 2-3-4-5 remainder downgrades to a Drift").toBeTruthy();
    expect([...drift!.cells].sort()).toEqual([...line].sort());
  });

  it("holds across randomised boards with connected combos (300 runs)", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 300; run++) {
      const fromSide = run % 3 === 0 ? 5 : 6;
      const toSide = fromSide - 1;
      const { cells, order } = emptyBoard(fromSide);
      const all = new Set(order);
      // grow 1-4 CONNECTED activated blobs (real combos are connected pre-collapse)
      const combos: { name: string; cells: string[] }[] = [];
      const used = new Set<string>();
      const comboCount = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < comboCount; i++) {
        const start = order[Math.floor(rnd() * order.length)];
        if (used.has(start)) continue;
        const blob = [start];
        used.add(start);
        const size = 2 + Math.floor(rnd() * 4);
        while (blob.length < size) {
          const from = blob[Math.floor(rnd() * blob.length)];
          const opts = neighbours(parseKey(from), all).map(keyOf).filter((k) => !used.has(k));
          if (opts.length === 0) break;
          const next = opts[Math.floor(rnd() * opts.length)];
          blob.push(next);
          used.add(next);
        }
        if (blob.length < 2) continue;
        const v = 1 + Math.floor(rnd() * 6);
        for (const k of blob) cells.get(k)!.tile = v;
        combos.push({ name: "Trips", cells: blob });
        // half the time, append an overlapping "extended" entry (Trips ⊂ Quad)
        if (rnd() < 0.5) {
          const from = blob[Math.floor(rnd() * blob.length)];
          const opts = neighbours(parseKey(from), all).map(keyOf).filter((k) => !used.has(k));
          if (opts.length > 0) {
            const extra = opts[Math.floor(rnd() * opts.length)];
            used.add(extra);
            cells.get(extra)!.tile = v;
            combos.push({ name: "Quad", cells: [...blob, extra] });
          }
        }
      }
      // scatter loose tiles for crowding
      for (const k of order) {
        if (!used.has(k) && rnd() < 0.3) cells.get(k)!.tile = 1 + Math.floor(rnd() * 6);
      }
      const before = countValues(cells);
      const result = shrinkBoard({ fromSide, toSide, cells, order, activatedCombos: combos });
      expect(Object.fromEntries(countValues(result.cells)), `run ${run} conservation`).toEqual(Object.fromEntries(before));
      for (const c of result.activatedCombos) {
        expect(entryConnected(c.cells), `run ${run}: ${c.name} [${c.cells.join(" ")}] connected`).toBe(true);
        for (const k of c.cells) {
          expect(result.cells.get(k)?.tile ?? null, `run ${run}: activated ${k} holds a tile`).not.toBeNull();
        }
      }
    }
  });

  it("LIVE invariant: entries stay connected across seeded playthroughs", () => {
    const legalTargets = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));
    const offenders: string[] = [];
    for (let seed = 1; seed <= 80 && offenders.length === 0; seed++) {
      let g = newGame({ seed, side: 6 });
      for (let m = 0; m < 300 && g.phase === "playing"; m++) {
        const targets = legalTargets(g);
        if (targets.length === 0) break;
        g = place(g, targets[(seed * 31 + m * 17) % targets.length]);
        const adjConnected = (cells: string[]): boolean => {
          if (cells.length <= 1) return true;
          const set = new Set(cells);
          const seen = new Set([cells[0]]);
          const stack = [cells[0]];
          while (stack.length) {
            const k = stack.pop()!;
            for (const n of g.adj.get(k) ?? []) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
          }
          return seen.size === set.size;
        };
        for (const c of g.activatedCombos) {
          if (!adjConnected(c.cells)) {
            offenders.push(`seed ${seed} move ${m}: ${c.name} [${c.cells.join(" ")}] disconnected (side ${g.side})`);
            break;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 120000);
});
