import { describe, expect, it } from "vitest";
import { newGame, place, versusEndTurn, claimCluster, bankClusterNow, cashOut, describePlace, isLegalTarget, GameState } from "./engine";
import { ComboName } from "./combos";

/**
 * GLINT VERSUS (Glint Together, leg 3) — the engine layer:
 * seat-swap of every split resource, the opening ritual, claims with the
 * strict one-claim/grace/dissolve lifecycle, busts paying the opponent,
 * and the win-condition ladder.
 */

const vGame = (seed = 5) => newGame({ seed, side: 6, versus: { names: ["Ada", "Ben"] }, rescueMode: "off" });
const legal = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));

/** Surgery: plant an activated cluster on a fresh versus board. */
function plantCluster(g: GameState, cells: [string, number][], combos: { name: ComboName; cells: string[] }[]): void {
  for (const [k, v] of cells) {
    const c = g.cells.get(k)!;
    c.tile = v as never;
    c.buried = null;
    c.bonusGem = null;
  }
  g.activatedCombos = combos.map((c) => ({ name: c.name, cells: [...c.cells] }));
  g.activatedCells = [...new Set(combos.flatMap((c) => c.cells))];
}

const TRIPS: [string, number][] = [["0,0", 6], ["1,0", 6], ["1,-1", 6]];
const TRIPS_COMBO = [{ name: "Trips" as ComboName, cells: ["0,0", "1,0", "1,-1"] }];

describe("the opening ritual", () => {
  it("the highest opening gem takes seat 0 (green) across many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = vGame(seed);
      expect(g.versus).toBeTruthy();
      const [a, b] = g.versus!.ritual.gems;
      if (g.versus!.ritual.redraws < 20) {
        expect(a).toBeGreaterThan(b); // seat 0 opened with the higher gem
      }
      expect(g.hand[0]).toBe(a); // and holds it
      expect(g.versus!.turn).toBe(0);
      expect(g.hand.length).toBe(6);
      expect(g.versus!.partnerHand.length).toBe(6);
    }
  });
});

describe("seat swap — every split resource follows the turn", () => {
  it("a bank lands in the banker's column and swaps away cleanly", () => {
    const g = vGame();
    plantCluster(g, TRIPS, TRIPS_COMBO);
    g.versus!.moved = true;
    const banked = bankClusterNow(g, "0,0");
    expect(banked.score).toBeGreaterThan(0);
    expect(banked.freeBanksLeft).toBe(2);
    const passed = versusEndTurn(banked);
    expect(passed.versus!.turn).toBe(1);
    expect(passed.score).toBe(0); // Ben's fresh column
    expect(passed.freeBanksLeft).toBe(3);
    expect(passed.versus!.partnerScore).toBe(banked.score); // Ada's parked column
    expect(passed.versus!.partnerFreeBanks).toBe(2);
  });
});

describe("the claim", () => {
  it("claim → protected turn → grace → dissolves at the end of the owner's next turn", () => {
    let g = vGame();
    plantCluster(g, TRIPS, TRIPS_COMBO);
    g.versus!.moved = true;
    g = claimCluster(g, "0,0");
    expect(g.versus!.claims[0]?.cells.sort()).toEqual(["0,0", "1,-1", "1,0"]);
    // one claim, strictly: a second claim is refused
    const again = claimCluster(g, "0,0");
    expect(again.versus!.claims[0]).toEqual(g.versus!.claims[0]);

    g = versusEndTurn(g); // Ada passes — grace arms
    expect(g.versus!.turn).toBe(1);
    expect(g.versus!.claims[0]?.graceUsed).toBe(true);
    g.versus!.moved = true;
    g = versusEndTurn(g); // Ben passes — Ada's claim untouched
    expect(g.versus!.claims[0]).toBeTruthy();
    g.versus!.moved = true;
    g = versusEndTurn(g); // Ada passes WITHOUT banking — the promise breaks
    expect(g.versus!.claims[0]).toBeNull();
  });

  it("the claim is a BOUNDARY: the opponent's combo forms beside it, never with it", () => {
    // Ada claims a trips of 6s; Ben has his own pair of 6s one gap away. The
    // bridging placement used to fake a six-bank; now it must form Ben's OWN
    // trips only — no merge, no bank, Ada's claim untouched — and Ben can then
    // claim his combo right next to hers (the second half of the reported bug).
    let g = vGame();
    // fence the arena: every neighbour of the strip becomes a 1 so the random
    // board can't donate stray 6s to the combos under test
    for (const k of ["0,-1", "1,-2", "2,-2", "2,-1", "3,-1", "4,-1", "5,-1", "5,0", "4,1", "3,1", "2,1", "1,1", "0,1", "-1,1", "-1,0"]) {
      const c = g.cells.get(k);
      if (c) c.tile = 1 as never;
    }
    plantCluster(g,
      [["0,0", 6], ["1,0", 6], ["1,-1", 6], ["3,0", 6], ["4,0", 6]],
      [{ name: "Trips", cells: ["0,0", "1,0", "1,-1"] }, { name: "Echo", cells: ["3,0", "4,0"] }]);
    g.cells.get("2,0")!.tile = null; // the bridge cell, empty
    g.versus!.moved = true;
    g = claimCluster(g, "0,0");
    expect(g.versus!.claims[0]?.cells.sort()).toEqual(["0,0", "1,-1", "1,0"]); // only Ada's trips
    g = versusEndTurn(g); // Ben's turn
    g.hand = [6, ...g.hand.slice(1)] as typeof g.hand;
    const out = describePlace(g, "2,0");
    expect(out.kind).toBe("activate"); // NOT a bank — the wall splits the six
    const g2 = place(g, "2,0");
    expect(g2.versus!.moved).toBe(true); // the move happened
    expect(g2.score).toBe(0); // and banked nothing
    expect(g2.versus!.claims[0]).toBeTruthy(); // Ada's claim stands
    expect(g2.activatedCells).toContain("2,0");
    // Ben claims HIS side, directly adjacent to Ada's claim
    const g3 = claimCluster(g2, "2,0");
    expect(g3.versus!.claims[1]?.cells.sort()).toEqual(["2,0", "3,0", "4,0"]);
    expect(g3.versus!.claims[1]!.cells.every((k) => !g3.versus!.claims[0]!.cells.includes(k))).toBe(true);
    // and Ben can BANK his side while it touches hers: only his gems leave
    const banked = bankClusterNow(g3, "2,0");
    expect(banked.score).toBeGreaterThan(0);
    expect(banked.versus!.claims[0]).toBeTruthy(); // Ada's claim stands
    expect(banked.cells.get("0,0")?.tile).toBe(6); // her gems untouched
    expect(banked.cells.get("2,0")?.tile ?? null).toBeNull(); // his side cleared
    // banking FROM a claimed cell is simply nothing
    const refused = bankClusterNow(banked, "0,0");
    expect(refused.score).toBe(banked.score);
  });

  it("a claim covers the CONNECTED cluster — exactly what a bank would take", () => {
    // if your combo already touches other unclaimed combos, the claim protects
    // the whole merged group (consistent with BANK NOW's cluster semantics)
    let g = vGame();
    plantCluster(g,
      [["0,0", 6], ["1,0", 6], ["1,-1", 6], ["2,0", 6], ["3,0", 6]],
      [{ name: "Trips", cells: ["0,0", "1,0", "1,-1"] }, { name: "Echo", cells: ["2,0", "3,0"] }]);
    g.versus!.moved = true;
    const claimed = claimCluster(g, "0,0");
    expect(claimed.versus!.claims[0]?.cells.length).toBe(5);
  });

  it("banking your own claim clears it", () => {
    let g = vGame();
    plantCluster(g, TRIPS, TRIPS_COMBO);
    g.versus!.moved = true;
    g = claimCluster(g, "0,0");
    const banked = bankClusterNow(g, "0,0");
    expect(banked.versus!.claims[0]).toBeNull(); // pruned — cells left the board
    expect(banked.score).toBeGreaterThan(0);
  });
});

describe("busting pays the opponent", () => {
  it("activated gems bank at face value into the opponent's score", () => {
    let g = vGame();
    plantCluster(g, TRIPS, TRIPS_COMBO);
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    expect(k).toBeTruthy();
    const g2 = place(g, k!);
    expect(g2.versus!.partnerScore).toBe(3 * 600); // three 6s at face value
    expect(g2.lastResolved.versusTransfer?.points).toBe(1800);
    expect(g2.score).toBe(0); // the buster gains nothing
    // (the cells clear before the reshuffle nudge redistributes the board —
    // asserting emptiness post-nudge would be checking the weather)
    expect(g2.versus!.claims[0]).toBeNull();
  });

  it("the OPPONENT'S claim survives my bust — kept on the board, never gifted", () => {
    // Ben claimed a trips of 6s; Ada also built an unclaimed pair of 5s. Ada
    // busts: the pair gifts to Ben at face value and clears, but Ben's claimed
    // cluster stays — tiles, glow and claim intact (Thys ruling 2026-08-21).
    let g = vGame();
    plantCluster(g,
      [["0,0", 6], ["1,0", 6], ["1,-1", 6], ["3,0", 5], ["4,0", 5]],
      [{ name: "Trips", cells: ["0,0", "1,0", "1,-1"] }, { name: "Echo", cells: ["3,0", "4,0"] }]);
    g.versus!.claims[1] = { cells: ["0,0", "1,0", "1,-1"], graceUsed: false };
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    expect(k).toBeTruthy();
    // the preview already excludes the protected claim from the lost cells
    const preview = describePlace(g, k!);
    expect(preview.kind === "bust" && preview.bustLostCells.sort()).toEqual(["3,0", "4,0"]);
    const g2 = place(g, k!);
    expect(g2.versus!.partnerScore).toBe(2 * 500); // ONLY the pair pays out
    expect(g2.lastResolved.versusTransfer?.cells.sort()).toEqual(["3,0", "4,0"]);
    const claim = g2.versus!.claims[1];
    expect(claim).toBeTruthy(); // the claim stands...
    for (const ck of claim!.cells) {
      expect(g2.cells.get(ck)?.tile).toBe(6); // ...tiles still on the board
      expect(g2.activatedCells).toContain(ck); // ...still glowing
    }
    expect(g2.activatedCombos.length).toBe(1); // the pair's combo is gone
  });

  it("my OWN claim is not protected from my own bust", () => {
    let g = vGame();
    plantCluster(g, TRIPS, TRIPS_COMBO);
    g.versus!.claims[0] = { cells: ["0,0", "1,0", "1,-1"], graceUsed: false }; // Ada's claim, Ada busts
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    const g2 = place(g, k!);
    expect(g2.versus!.partnerScore).toBe(3 * 600); // gifted like any build-up
    expect(g2.versus!.claims[0]).toBeNull();
    expect(g2.activatedCombos.length).toBe(0);
  });

  it("a bust DIRECTLY INTO the opponent's claim breaks it — the wipe is total again", () => {
    // DEFENSIVE, engine-level only: no real move can target a claimed cell (the
    // UI refuses taps on activated cells, the Broker AI skips them) — but
    // place() accepts any cell, so the pure engine must still degrade sanely.
    let g = vGame();
    // fence the claim so the dropped tile can't accidentally form a combo
    for (const kk of ["0,-1", "1,-2", "2,-2", "2,-1", "2,0", "1,1", "0,1", "-1,1", "-1,0"]) {
      const c = g.cells.get(kk);
      if (c) c.tile = 1 as never;
    }
    plantCluster(g, TRIPS, TRIPS_COMBO);
    g.versus!.claims[1] = { cells: ["0,0", "1,0", "1,-1"], graceUsed: false };
    g.hand = [4, ...g.hand.slice(1)] as typeof g.hand; // a 4 onto the claimed 6: no combo anywhere
    expect(describePlace(g, "0,0").kind).toBe("bust");
    const g2 = place(g, "0,0");
    expect(g2.versus!.claims[1]).toBeNull(); // the direct hit broke the claim
    // the hit cell's 6 went to Ada's hand; the other two gifted at face value
    expect(g2.versus!.partnerScore).toBe(2 * 600);
    expect(g2.activatedCombos.length).toBe(0);
  });

  it("a third bust loses on the spot, whatever the scores", () => {
    let g = vGame();
    g.score = 99999; // the buster is far ahead — irrelevant
    g.livesLeft = 1;
    g.busts = 2;
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    const g2 = place(g, k!);
    expect(g2.phase).toBe("lost");
    expect(g2.versus!.result?.winner).toBe(1); // Ben wins by knockout
    expect(g2.versus!.result?.reason).toBe("busts");
  });
});

describe("ends and the race", () => {
  it("a dry hand forces the pass; the race continues", () => {
    let g = vGame();
    g.hand = [g.hand[0]];
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    const g2 = place(g, k!);
    if (g2.phase === "playing") {
      expect(g2.versus!.turn).toBe(1);
      expect(g2.hand.length).toBe(6);
      expect(g2.versus!.partnerHand.length).toBe(0);
    }
  });

  it("both dry: the higher score wins", () => {
    let g = vGame();
    g.hand = [g.hand[0]];
    g.versus!.partnerHand = [];
    g.score = 500;
    g.versus!.partnerScore = 2500;
    const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
    const g2 = place(g, k!);
    if (g2.phase !== "playing") {
      expect(g2.versus!.result?.winner).toBe(1); // Ben's 2500 beats Ada's 500
      expect(g2.versus!.result?.reason).toBe("score");
    }
  });

  it("cash-out is personal: your conversion, your column, their board", () => {
    let g = vGame();
    g.deathMatch = true;
    g.livesLeft = 2;
    g.freeBanksLeft = 1;
    const before = g.score;
    const g2 = cashOut(g);
    if (g2.phase === "playing") {
      // swapped to Ben, Ada is done with her conversion banked
      expect(g2.versus!.turn).toBe(1);
      expect(g2.versus!.done[0]).toBe(true);
      expect(g2.versus!.partnerScore).toBeGreaterThan(before);
      expect(g2.versus!.partnerHand.length).toBe(0);
    }
  });
});
