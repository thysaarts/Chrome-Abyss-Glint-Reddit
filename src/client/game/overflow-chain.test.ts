import { describe, it, expect } from "vitest";
import { newGame, place, GameState } from "./engine";

/**
 * OVERFLOW CONDUCTS THE CHAIN (bug034).
 *
 * A chain forms when an activated combo touches another activated combo — of ANY
 * value; the mineral values need no relationship. The bug: the tiles that a bank
 * marks as OVERFLOW (Rule 1 / Mother Lode) were excluded from the connectivity that
 * decides chaining, so a combo connected to the banked blob ONLY through an overflow
 * tile was silently dropped from the chain. A player can't predict which tiles the
 * engine tags as overflow, so that's arbitrary and unfair — the connected combo must
 * still chain in.
 *
 * Layout — a value-6 strand along r=0, plus a DIFFERENT-value (value-1) Quad hanging
 * off the strand's overflow tile:
 *   q:  -4    -3 -2 -1  0  1     2        3,0 4,0 3,1 3,-1
 *      [place][------Hex------][overflow] [--- value-1 Quad ---]
 * Placing the 6 at q=-4 banks a Hex (q=-4..1); q=2 (value 6) overflows to the hand.
 * The value-1 Quad touches the blob ONLY through that overflow tile at 2,0 — so with
 * the bug it stays glowing on the board; with the fix it chains in and banks.
 */
const clearBoard = (g: GameState) => {
  for (const k of g.order) {
    const c = g.cells.get(k)!;
    c.tile = null;
    c.inert = false;
    c.buried = null;
  }
};

describe("overflow conducts the chain (bug034)", () => {
  it("chains a different-value combo joined to the banked blob only through an overflow tile", () => {
    const g = newGame({ seed: 1, side: 6 });
    clearBoard(g);
    // value-6 strand: q=-3..2 on r=0 (q=-4 is the empty finishing cell). Placing at
    // -4 forms a Hex of the 6 nearest (q=-4..1); q=2 overflows.
    for (const q of [-3, -2, -1, 0, 1, 2]) g.cells.get(`${q},0`)!.tile = 6;
    // a value-1 Quad hanging off the overflow tile at 2,0 (via 3,0). None of its cells
    // touch a Hex cell (q=-4..1, r=0) — the ONLY bridge is the value-6 overflow at 2,0.
    const quad = ["3,0", "4,0", "3,1", "3,-1"];
    for (const k of quad) g.cells.get(k)!.tile = 1;
    g.activatedCombos = [{ name: "Quad", cells: [...quad] }];
    g.activatedCells = [...quad];
    // a disconnected value-2 blob so clearing everything above doesn't WIN the board
    for (const k of ["0,3", "1,3", "0,4"]) g.cells.get(k)!.tile = 2;
    g.hand = [6, 6, 6];
    expect(g.cells.get("-4,0")!.tile).toBe(null);

    const after = place(g, "-4,0");

    // it banks (the Hex clears the threshold)
    expect(after.banks).toBe(1);
    // THE FIX: the value-1 Quad chained in — it is no longer glowing, and its cells no
    // longer hold their value-1 tiles (they banked). With the bug it would still be
    // activated on the board.
    for (const k of quad) {
      expect(after.activatedCells).not.toContain(k);
    }
    const onesLeft = after.order.filter((k) => after.cells.get(k)!.tile === 1);
    expect(onesLeft).toEqual([]);
  });

  it("does NOT chain a different-value combo that the strand never reaches", () => {
    // control: an identical value-1 Quad placed OFF the strand (touching nothing that
    // banks or overflows) must be left untouched — the fix only conducts along the blob.
    const g = newGame({ seed: 1, side: 6 });
    clearBoard(g);
    for (const q of [-3, -2, -1, 0, 1, 2]) g.cells.get(`${q},0`)!.tile = 6;
    // value-1 Quad well away from the value-6 strand, disconnected from it entirely
    const quad = ["0,3", "1,3", "0,4", "1,4"];
    for (const k of quad) g.cells.get(k)!.tile = 1;
    g.activatedCombos = [{ name: "Quad", cells: [...quad] }];
    g.activatedCells = [...quad];
    g.hand = [6, 6, 6];

    const after = place(g, "-4,0");

    expect(after.banks).toBe(1);
    // untouched: the four value-1 tiles survive (NOT banked into the chain) and stay
    // glowing. Assert by count, not coordinate — banking the Hex can collapse the sparse
    // board and remap the Quad's cells, but the Quad itself must be intact.
    const onesLeft = after.order.filter((k) => after.cells.get(k)!.tile === 1);
    expect(onesLeft.length).toBe(4);
    const onesGlowing = after.activatedCells.filter((k) => after.cells.get(k)!.tile === 1);
    expect(onesGlowing.length).toBe(4);
  });
});
