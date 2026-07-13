import { describe, it, expect } from "vitest";
import {
  newGame,
  place,
  describePlace,
  visibleTile,
  isLegalTarget,
  hasAnyLegalMove,
  GameState,
} from "./engine";

const SEED = 12345;

/** The board+hand facts that must stay stable for a given seed. Maps/adjacency
 *  are derived, so comparing tiles-in-order + hand + score is enough. */
function snapshot(g: GameState) {
  return {
    side: g.side,
    order: [...g.order],
    tiles: g.order.map((k) => g.cells.get(k)!.tile),
    hand: [...g.hand],
    score: g.score,
    phase: g.phase,
    moves: g.moves,
  };
}

const firstLegal = (g: GameState) => g.order.find((k) => isLegalTarget(g, k));

describe("newGame", () => {
  it("is deterministic for a given seed", () => {
    expect(snapshot(newGame({ seed: SEED }))).toEqual(snapshot(newGame({ seed: SEED })));
  });

  it("produces different boards for different seeds", () => {
    expect(snapshot(newGame({ seed: 1 }))).not.toEqual(snapshot(newGame({ seed: 2 })));
  });

  it("starts a valid side-6 board", () => {
    const g = newGame({ seed: SEED, side: 6 });
    expect(g.side).toBe(6);
    expect(g.order.length).toBe(91); // the full hexagon
    expect(g.phase).toBe("playing");
    expect(g.score).toBe(0);
    expect(g.moves).toBe(0);
    expect(g.hand.length).toBeGreaterThan(0);
    expect(visibleTile(g)).toBe(g.hand[0]);
    expect(hasAnyLegalMove(g)).toBe(true);
  });

  it("honours a smaller side", () => {
    expect(newGame({ seed: SEED, side: 4 }).order.length).toBe(37);
  });
});

describe("place() — purity & progression", () => {
  it("never mutates the input state", () => {
    const g = newGame({ seed: SEED });
    const target = firstLegal(g)!;
    const before = snapshot(g);
    place(g, target); // discard result
    expect(snapshot(g)).toEqual(before);
  });

  it("returns a new state that advances the run", () => {
    const g = newGame({ seed: SEED });
    const target = firstLegal(g)!;
    const next = place(g, target);
    expect(next).not.toBe(g);
    expect(next.moves).toBe(g.moves + 1);
    expect(["playing", "won", "lost"]).toContain(next.phase);
  });

  it("a preview does not mutate and reports a known kind", () => {
    const g = newGame({ seed: SEED });
    const target = firstLegal(g)!;
    const before = snapshot(g);
    const kind = describePlace(g, target).kind;
    expect(["bank", "bust", "activate"]).toContain(kind);
    expect(snapshot(g)).toEqual(before); // describePlace is a preview only
  });

  it("a run of legal placements stays internally consistent", () => {
    let g = newGame({ seed: SEED });
    for (let i = 0; i < 12 && g.phase === "playing"; i++) {
      const target = firstLegal(g);
      if (!target) break;
      const prevMoves = g.moves;
      g = place(g, target);
      expect(g.moves).toBe(prevMoves + 1);
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.hand.length).toBeGreaterThanOrEqual(0);
    }
  });
});
