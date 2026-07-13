import { describe, it, expect } from "vitest";
import { newGame, planMove, place, lockedCoreValues, GameState, CORE } from "./engine";

const clear = (g: GameState) => { for (const k of g.order){const c=g.cells.get(k)!;c.tile=null;c.inert=false;c.buried=null;} };

/**
 * A Nebulite that takes shape this turn is a fresh tile of the placed value — so, like any
 * freshly placed tile, it activates every combo it sits in: the set AND a Drift running
 * through it. The placed tile is NOT adjacent to the rest of the drift, so ONLY the Nebulite
 * can carry it.
 */
describe("a shaped Nebulite activates the Drift it sits in", () => {
  it("scores both the set and the Drift", () => {
    // Trips of 3s (legal set) + the Nebulite(3) sits in 3-4-5-6
    const g = newGame({ seed: 1, side: 6 });
    clear(g);
    g.cells.get("0,0")!.tile = CORE; // Nebulite → mirrors 3
    g.cells.get("1,0")!.tile = 4;    // 4-5-6 tail, adjacent to the Nebulite
    g.cells.get("2,0")!.tile = 5;
    g.cells.get("3,0")!.tile = 6;
    g.cells.get("-1,0")!.tile = 3;   // a real 3 for the Trips
    g.hand = [3, 3, 3];
    const p = planMove(g, "-1,1"); // Trips with 0,0 + -1,0; not adjacent to the 4
    const names = (p?.newCombos ?? []).map((c) => c.name).sort();
    expect(names).toContain("Trips");
    expect(names).toContain("Drift");
  });

  it("locks the Nebulite as the value it took (6), not the drift's leading mineral", () => {
    // Echo(6) + Drift 3-4-5-6 = 5 tiles (no bank), so the activation persists to inspect.
    const g = newGame({ seed: 1, side: 6 });
    clear(g);
    g.cells.get("0,0")!.tile = CORE; // Nebulite → mirrors 6, sits at the 6-end of the drift
    g.cells.get("1,0")!.tile = 5;    // 6(Neb)-5-4-3 runs off through here
    g.cells.get("2,0")!.tile = 4;
    g.cells.get("3,0")!.tile = 3;
    g.hand = [6, 6, 6];
    const after = place(g, "-1,0"); // a 6 beside the Nebulite → Echo(6); Nebulite also carries the drift
    const names = after.activatedCombos.map((c) => c.name).sort();
    expect(names).toContain("Echo");
    expect(names).toContain("Drift");
    // and it locked to 6 (what it took), NOT the drift's leading mineral (3)
    expect(lockedCoreValues(after).get("0,0")).toBe(6);
  });
});
