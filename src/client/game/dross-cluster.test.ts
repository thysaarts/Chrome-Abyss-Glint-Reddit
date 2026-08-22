import { describe, it, expect } from "vitest";
import { newGame, place, isLegalTarget, GameState, GLINT, MAX_DROSS_CLUSTER } from "./engine";
import { shrinkBoard, Cell } from "./shrink";
import { hexCells, keyOf } from "./hex";
import { runInitial, RunSpec } from "./runConfig";
import { LEVELS } from "../levels/levels";

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

/**
 * THE DROSS CLUSTER CAP — the game never seeds or drifts three Dross into one
 * connected blob (a pair is a hazard to play around; a trio is a wall that can
 * strand a pocket of the board through no fault of the player's). Levels run up
 * to 9 Dross, so this is not a rare shape.
 *
 * The cap covers placements the GAME makes: initial seeding and the reshuffle's
 * board nudge. A player who chooses to place a picked-up Dross beside two others
 * is still free to.
 */

/** Every connected Dross blob on the board, largest first. */
function drossBlobs(s: GameState): number[] {
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const k of s.order) {
    if (seen.has(k) || s.cells.get(k)!.tile !== GLINT) continue;
    let size = 0;
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const nb of s.adj.get(cur) ?? []) {
        if (seen.has(nb) || s.cells.get(nb)!.tile !== GLINT) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

const biggestBlob = (s: GameState): number => drossBlobs(s)[0] ?? 0;

/** the same measure over a raw shrink result (no GameState to hand) */
function biggestBlobIn(cells: Map<string, Cell>, adj: Map<string, string[]>, order: string[]): number {
  const fake = { cells, adj, order } as unknown as GameState;
  return biggestBlob(fake);
}

const levelSpec = (levelNum: number, seed: number): RunSpec => ({
  kind: "level", levelNum, seed, difficulty: "medium",
  bonusGems: { resurrect: false, quadriant: false, zenith: false },
});

/** The Dross-heaviest levels — where the cap has the most work to do. */
const HEAVY = LEVELS.map((l, i) => ({ i, dross: l.params.dross ?? 0 }))
  .sort((a, b) => b.dross - a.dross)
  .slice(0, 6);

describe("initial seeding never builds a Dross wall", () => {
  it("holds across 400 boards on the Dross-heaviest levels", () => {
    let boards = 0;
    let pairs = 0;
    for (const { i } of HEAVY) {
      for (let seed = 1; seed <= 70; seed++) {
        const s = runInitial(levelSpec(i, seed));
        const big = biggestBlob(s);
        expect(big).toBeLessThanOrEqual(MAX_DROSS_CLUSTER);
        if (big === 2) pairs++;
        boards++;
      }
    }
    expect(boards).toBeGreaterThan(400);
    // pairs must still HAPPEN — a cap that quietly scattered every Dross to
    // isolation would change the game's texture, not just remove the wall
    expect(pairs).toBeGreaterThan(0);
  });

  it("holds on a small dense board carrying 9 Dross", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const s = newGame({ seed, side: 4, dross: 9, nebulites: 1, handSize: 9 });
      expect(biggestBlob(s)).toBeLessThanOrEqual(MAX_DROSS_CLUSTER);
    }
  });

  it("still seeds every Dross the level asked for", () => {
    for (const { i, dross } of HEAVY) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = runInitial(levelSpec(i, seed));
        const onBoard = [...s.cells.values()].filter((c) => c.tile === GLINT).length;
        expect(onBoard).toBe(dross);
      }
    }
  });

  it("leaves Nebulites alone — they are a prize, not a hazard", () => {
    // a board seeded with many Nebulites may absolutely cluster them
    let clustered = false;
    for (let seed = 1; seed <= 80 && !clustered; seed++) {
      const s = newGame({ seed, side: 4, dross: 0, nebulites: 12, handSize: 9 });
      const cores = new Set([...s.cells.entries()].filter(([, c]) => c.tile === 7).map(([k]) => k));
      clustered = [...cores].some((k) => (s.adj.get(k) ?? []).filter((nb) => cores.has(nb)).length >= 2);
    }
    expect(clustered).toBe(true);
  });
});

describe("the collapse never squeezes one together", () => {
  // the inward squeeze of a shrink was the third source (found by playing games
  // out, not by reading the code): ring-5 Dross collapse toward the centre and
  // can land side by side
  it("holds across 300 collapses of Dross-heavy boards, losing no Dross", () => {
    let collapses = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { cells, order } = emptyBoard(6);
      const keys = order.slice();
      // deterministic pseudo-random fill: 26 minerals + 6 Dross
      const pick = (n: number, salt: number) => keys[(seed * 7919 + salt * 104729) % keys.length + 0] && keys[(seed * 7919 + salt * 104729) % keys.length];
      const used = new Set<string>();
      const take = (salt: number): string => {
        let k = pick(0, salt)!;
        let guard = 0;
        while (used.has(k) && guard++ < keys.length) k = keys[(keys.indexOf(k) + 1) % keys.length];
        used.add(k);
        return k;
      };
      for (let i = 0; i < 26; i++) cells.get(take(i))!.tile = ((i % 6) + 1) as number;
      for (let i = 0; i < 6; i++) cells.get(take(100 + i))!.tile = GLINT;
      const before = [...cells.values()].filter((c) => c.tile === GLINT).length;
      const r = shrinkBoard({ fromSide: 6, toSide: 5, cells, order, activatedCombos: [], drossValue: GLINT, maxDrossCluster: MAX_DROSS_CLUSTER });
      const after = [...r.cells.values()].filter((c) => c.tile === GLINT).length;
      expect(after).toBe(before); // the cap relocates Dross, it never deletes any
      expect(biggestBlobIn(r.cells, r.adj, r.order)).toBeLessThanOrEqual(MAX_DROSS_CLUSTER);
      collapses++;
    }
    expect(collapses).toBe(300);
  });
});

describe("the reshuffle's board nudge never drifts one together either", () => {
  it("holds through long played-out games (reshuffles and collapses included)", () => {
    let reshuffles = 0;
    let collapses = 0;
    let moves = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // Dross-heavy small board = frequent Dross clears = frequent reshuffles
      let s = newGame({ seed, side: 5, dross: 7, nebulites: 2, handSize: 9 });
      expect(biggestBlob(s)).toBeLessThanOrEqual(MAX_DROSS_CLUSTER);
      for (let turn = 0; turn < 120 && s.phase === "playing"; turn++) {
        const legal = s.order.filter((k) => isLegalTarget(s, k));
        if (!legal.length) break;
        // deterministic pseudo-random pick, so a failure is reproducible
        s = place(s, legal[(seed * 31 + turn * 17) % legal.length]);
        moves++;
        if (s.lastResolved.reshuffled || s.lastResolved.nudged.length) reshuffles++;
        if (s.lastResolved.shrunk) collapses++;
        expect(biggestBlob(s)).toBeLessThanOrEqual(MAX_DROSS_CLUSTER);
      }
    }
    expect(moves).toBeGreaterThan(500);
    expect(reshuffles).toBeGreaterThan(0); // the nudge path was actually exercised
    expect(collapses).toBeGreaterThan(0); // …and so was the collapse path
  });
});
