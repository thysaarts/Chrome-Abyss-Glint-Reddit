import { describe, it, expect } from "vitest";
import { newGame, place, isLegalTarget, GameState } from "./engine";

/**
 * Regression for the "ignored tiles" bug: a same-value strand banks a Hex; the tiles
 * beyond the 6 banked ones overflow to the hand (Rule 1). But the overflow only
 * happened for NON-activated leftover tiles — a same-value tile that belonged to a
 * separate activated combo (e.g. an Echo) sitting further down the SAME strand was
 * neither banked (not in the connected cluster) nor overflowed (excluded because it
 * was "activated"), so it was left orphaned on the board.
 *
 * Layout — one straight line of value-6 minerals along r = 0:
 *   q:  -4   -3 -2 -1  0  1   2    3   4
 *       [place] [------Hex-----] [red] [--Echo--]
 * Placing the 6 at q=-4 forms a Hex from the 6 NEAREST (q=-4..1). q=2 overflows to the
 * hand. q=3,4 are a pre-activated Echo, connected to the Hex ONLY through the
 * non-activated q=2 — so the cluster (activated-adjacency) stops before them and the
 * old overflow filter skipped them. They must overflow to the hand too, not be orphaned.
 */
const clearBoard = (g: GameState) => {
  for (const k of g.order) {
    const c = g.cells.get(k)!;
    c.tile = null;
    c.inert = false;
    c.buried = null;
  }
};

describe("Rule 1 overflow never orphans a same-value strand tile", () => {
  it("overflows an activated Echo further down the strand to the hand", () => {
    const g = newGame({ seed: 1, side: 6 });
    clearBoard(g);
    const V = 6;
    // value-6 minerals at q = -3..4 (q=-4 stays empty for the finishing placement)
    for (const q of [-3, -2, -1, 0, 1, 2, 3, 4]) g.cells.get(`${q},0`)!.tile = V;
    // a small disconnected blob of another mineral so clearing the strand doesn't empty
    // the whole board (a full clear would WIN the run and convert the hand away)
    for (const k of ["0,3", "1,3", "0,4", "1,4"]) g.cells.get(k)!.tile = 1;
    // pre-activate an Echo at the far end, with the non-activated q=2 between it and the Hex
    g.activatedCombos = [{ name: "Echo", cells: ["3,0", "4,0"] }];
    g.activatedCells = ["3,0", "4,0"];
    g.hand = [V, V, V];
    expect(g.cells.get("-4,0")!.tile).toBe(null);

    const after = place(g, "-4,0");

    // the placement must BANK (a Hex), not bust
    expect(after.banks).toBe(1);
    // NO value-6 tile may be left on the board — all nine went to the bank or the hand
    const sixesLeft = after.order.filter((k) => after.cells.get(k)!.tile === V);
    expect(sixesLeft).toEqual([]);
    // the three non-banked strand tiles (q=2,3,4) overflowed to the hand
    const sixesInHand = after.hand.filter((t) => t === V).length;
    expect(sixesInHand).toBeGreaterThanOrEqual(3);
  });

  it("never leaves the glow pointing at an empty cell (real games)", () => {
    // the overflow cleanup rebuilds activatedCells from the surviving combos; across many
    // real runs the glow must stay consistent — no activated cell may be empty (a ghost
    // glow), which is how the orphaned-tile bug would resurface.
    const bad: string[] = [];
    for (let seed = 1; seed <= 120 && bad.length < 3; seed++) {
      let g = newGame({ seed, side: 6 });
      for (let m = 0; m < 400 && g.phase === "playing"; m++) {
        const t = g.order.find((k) => isLegalTarget(g, k));
        if (!t) break;
        g = place(g, t);
        const ghost = g.activatedCells.filter((k) => g.cells.get(k)!.tile === null);
        if (ghost.length) { bad.push(`seed ${seed} move ${m}: glow on empty ${ghost.join(",")}`); break; }
      }
    }
    expect(bad).toEqual([]);
  });
});
