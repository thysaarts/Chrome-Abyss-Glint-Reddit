import { describe, it, expect } from "vitest";
import { newGame, place, GameState } from "./engine";
import { traceMove, formatMoveTrace } from "./trace";

const clearBoard = (g: GameState) => { for (const k of g.order){const c=g.cells.get(k)!;c.tile=null;c.inert=false;c.buried=null;} };

describe("move tracer", () => {
  it("captures a bank: combo, banked cells, overflow-to-hand, score", () => {
    const before = newGame({ seed: 1, side: 6 });
    clearBoard(before);
    const V = 6;
    for (const q of [-3,-2,-1,0,1,2,3,4]) before.cells.get(`${q},0`)!.tile = V;
    for (const k of ["0,3","1,3","0,4","1,4"]) before.cells.get(k)!.tile = 1;
    before.activatedCombos = [{ name: "Echo", cells: ["3,0","4,0"] }];
    before.activatedCells = ["3,0","4,0"];
    before.hand = [V, V, V];

    const after = place(before, "-4,0");
    const t = traceMove(before, after, "-4,0");

    expect(t.outcome).toBe("bank");
    expect(t.placed).toBe("6");
    expect(t.at).toBe("-4,0");
    expect(t.banked?.combos).toContain("Hex");
    expect(t.banked?.cells.length).toBe(6);
    expect(t.overflow?.toHand).toBe(3);       // q=2,3,4 overflow
    expect(t.score.delta).toBeGreaterThan(0);
    // the formatted block is a non-empty multi-line play-by-play
    expect(formatMoveTrace(t).split("\n").length).toBeGreaterThan(3);
  });
});
