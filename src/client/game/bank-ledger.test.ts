import { describe, expect, it } from "vitest";
import { newGame, bankClusterNow, clusterCombosFor, GameState } from "./engine";
import { ComboName } from "./combos";

/**
 * THE LEDGER IS HISTORY, NOT A BILL — regression for the live BANK NOW bug:
 * a Pentad built incrementally (Trips → Quad → Pentad, three overlapping
 * ledger entries) banked as Trips+Quad+Pentad for 1,200 base PLUS a phantom
 * Harmony chain (+300) the log never showed: +1,500 for a 500-point Pentad.
 */

/** A real game state with the cluster and ledger surgically arranged. */
function withCluster(
  cells: [string, number][],
  combos: { name: ComboName; cells: string[] }[]
): GameState {
  const g = newGame({ seed: 11, side: 6 });
  for (const [k, v] of cells) {
    const c = g.cells.get(k)!;
    c.tile = v as never;
    c.buried = null;
    c.bonusGem = null;
  }
  g.activatedCombos = combos.map((c) => ({ name: c.name, cells: [...c.cells] }));
  g.activatedCells = [...new Set(combos.flatMap((c) => c.cells))];
  g.freeBanksLeft = 3;
  return g;
}

describe("BANK NOW scores the build, not its history", () => {
  const blob: [string, number][] = [["0,0", 6], ["1,0", 6], ["1,-1", 6], ["2,-1", 6], ["2,-2", 6]];
  const pentadLedger: { name: ComboName; cells: string[] }[] = [
    { name: "Trips", cells: ["0,0", "1,0", "1,-1"] },
    { name: "Quad", cells: ["0,0", "1,0", "1,-1", "2,-1"] },
    { name: "Pentad", cells: ["0,0", "1,0", "1,-1", "2,-1", "2,-2"] },
  ];

  it("an incrementally built Pentad banks as ONE Pentad: +500, no phantom Harmony", () => {
    const g = withCluster(blob, pentadLedger);
    const before = g.score;
    const banked = bankClusterNow(g, "0,0");
    expect(banked.score - before).toBe(500); // Pentad base, nothing else
    expect(banked.comboCounts.Pentad ?? 0).toBe(1);
    expect(banked.comboCounts.Trips ?? 0).toBe(0);
    expect(banked.comboCounts.Quad ?? 0).toBe(0);
    expect(Object.keys(banked.chainCounts ?? {}).filter((k) => (banked.chainCounts as Record<string, number>)[k] > 0)).toEqual([]);
    const early = banked.log.find((l) => l.text.includes("Banked early"))?.text ?? "";
    expect(early).toContain("Pentad");
    expect(early).not.toContain("Trips");
  });

  it("the UI helper shows exactly what will be scored", () => {
    const g = withCluster(blob, pentadLedger);
    const shown = clusterCombosFor(g, "0,0");
    expect(shown.map((c) => c.name)).toEqual(["Pentad"]);
  });

  it("DISTINCT adjacent combos both stay and earn their chain — like a placement bank", () => {
    // a Trips of 3s and a Drift, touching but sharing NO cells: 7 tiles, 7 named
    const cells: [string, number][] = [
      ["0,0", 3], ["0,-1", 3], ["1,-1", 3], // the set
      ["-1,1", 1], ["-1,2", 2], ["-2,3", 3], ["-2,4", 4], // the run, touching 0,0 via -1,1
    ];
    const combos: { name: ComboName; cells: string[] }[] = [
      { name: "Trips", cells: ["0,0", "0,-1", "1,-1"] },
      { name: "Drift", cells: ["-1,1", "-1,2", "-2,3", "-2,4"] },
    ];
    const g = withCluster(cells, combos);
    const shown = clusterCombosFor(g, "0,0");
    expect(shown.map((c) => c.name).sort()).toEqual(["Drift", "Trips"]);
    const before = g.score;
    const banked = bankClusterNow(g, "0,0");
    // Trips 300 + Drift 400 + the earned Accord chain
    expect(banked.score - before).toBeGreaterThanOrEqual(700);
    expect(banked.comboCounts.Trips ?? 0).toBe(1);
    expect(banked.comboCounts.Drift ?? 0).toBe(1);
  });

  it("a shared-gem overlap falls to the same over-count failsafe as a placement bank", () => {
    // set and run CROSSING at one gem: 6 tiles but 7 named — the failsafe
    // re-derives, so BANK NOW can never score one gem twice
    const cells: [string, number][] = [
      ["0,0", 3], ["0,-1", 3], ["1,-1", 3],
      ["-1,1", 2], ["-1,2", 1], ["0,1", 4],
    ];
    const combos: { name: ComboName; cells: string[] }[] = [
      { name: "Trips", cells: ["0,0", "0,-1", "1,-1"] },
      { name: "Drift", cells: ["0,0", "-1,1", "-1,2", "0,1"] },
    ];
    const g = withCluster(cells, combos);
    const before = g.score;
    const banked = bankClusterNow(g, "0,0");
    // never more than the un-deduped 700+chain, and never a gem counted twice
    expect(banked.score - before).toBeLessThanOrEqual(700);
    expect(banked.score - before).toBeGreaterThan(0);
  });
});
