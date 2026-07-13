import { describe, it, expect } from "vitest";
import { newGame, lockedCoreValues, GameState, CORE } from "./engine";

/**
 * Once a Nebulite (joker-Core) is used — it joins a combo and takes that combo's mineral
 * appearance — it must NEVER change again. A later placement that pulls it into a new combo
 * (e.g. a straight running through it) must not re-mirror it.
 *
 * A Core only ever mirrors for a same-value SET on its first activation, so its original set
 * (which precedes any later combo in the appended list) is its permanent value. Regression:
 * lockedCoreValues used to take each combo's first mineral with the LAST combo winning, so a
 * straight added afterward (first mineral = the newly placed tile) overwrote the locked value.
 */
describe("a Nebulite keeps its first mirrored value", () => {
  it("does not re-mirror when a later straight pulls it in", () => {
    const g: GameState = newGame({ seed: 1, side: 6 });
    // clear a few cells and stage the shapes lockedCoreValues reads (it only looks at
    // s.cells + s.activatedCombos, so exact geometry doesn't matter here).
    g.cells.get("0,0")!.tile = CORE; // the Nebulite
    g.cells.get("1,0")!.tile = 4; // its set is Duneglass (4s)
    g.cells.get("0,1")!.tile = 4;
    g.cells.get("2,0")!.tile = 3; // a later straight 3-4-5-6 runs THROUGH the Core as a 4
    g.cells.get("3,0")!.tile = 5;
    g.cells.get("4,0")!.tile = 6;

    // the Core's ORIGINAL set (locked it as a 4) is added first; the straight is appended
    g.activatedCombos = [
      { name: "Trips", cells: ["0,0", "1,0", "0,1"] }, // set of 4s — Core mirrored 4 here
      { name: "Drift", cells: ["2,0", "0,0", "3,0", "4,0"] }, // straight whose first mineral is 3
    ];

    const locked = lockedCoreValues(g);
    // it must stay 4 (its first set), NOT flip to 3 (the straight's leading mineral)
    expect(locked.get("0,0")).toBe(4);
  });
});
