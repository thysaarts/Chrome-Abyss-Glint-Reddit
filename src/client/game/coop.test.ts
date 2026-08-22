import { describe, expect, it } from "vitest";
import { newGame, place, coopEndTurn, describePlace, isLegalTarget, GameState } from "./engine";
import { shapeCells, hexCells, keyOf, neighbours } from "./hex";
import { boardClearBonus, BOARD_CLEAR_BONUS_SQUARE } from "./combos";

/**
 * GLINT CO-OP (Glint Together, leg 2) — the engine layer:
 * `hand` is always the ACTIVE player's; coopEndTurn swaps at the PASS beat;
 * the run only exhausts when the TEAM is dry; one placement per turn.
 */

const coopGame = (seed = 5) =>
  newGame({ seed, side: 6, shape: "squareTall", coop: { names: ["Ada", "Ben"] }, rescueMode: "off" });

const legal = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));

describe("the squareTall multiplayer board", () => {
  it("is the square plus one bottom row: 126 unique cells, all connected", () => {
    const square = shapeCells(6, "square");
    const tall = shapeCells(6, "squareTall");
    expect(square.length).toBe(115);
    expect(tall.length).toBe(126);
    expect(new Set(tall.map(keyOf)).size).toBe(126);
    // the 11 new cells form a row BELOW the square's bottom edge (screen
    // y = r + q/2), each connected to the board above it
    const squareSet = new Set(square.map(keyOf));
    const tallSet = new Set(tall.map(keyOf));
    const fresh = tall.filter((c) => !squareSet.has(keyOf(c)));
    expect(fresh.length).toBe(11);
    for (const c of fresh) {
      expect(c.r + c.q / 2).toBeGreaterThan(5); // below the old edge
      expect(neighbours(c, tallSet).some((n) => squareSet.has(keyOf(n)))).toBe(true);
    }
    // the singularity drops everything outside the hexagon: wedges + the row
    const hexSet = new Set(hexCells(6).map(keyOf));
    expect(tall.filter((c) => !hexSet.has(keyOf(c))).length).toBe(35);
  });

  it("versus starts on it too, and it pays the full-square clear bonus", () => {
    const g = newGame({ seed: 5, side: 6, shape: "squareTall", versus: { names: ["Ada", "Ben"] }, rescueMode: "off" });
    expect(g.order.length).toBe(126);
    expect(g.versus).toBeTruthy();
    expect(boardClearBonus("squareTall")).toBe(BOARD_CLEAR_BONUS_SQUARE);
  });
});

describe("glint co-op engine layer", () => {
  it("deals two hands of six from one bag, green (player 0) starts on the tall square", () => {
    const g = coopGame();
    expect(g.coop).toBeTruthy();
    expect(g.hand.length).toBe(6);
    expect(g.coop!.partnerHand.length).toBe(6);
    expect(g.coop!.turn).toBe(0);
    expect(g.coop!.names).toEqual(["Ada", "Ben"]);
    expect(g.coop!.moved).toBe(false);
    expect(g.shape).toBe("squareTall");
    // the multiplayer board: the 115-cell square plus one bottom row of 11
    expect(g.order.length).toBe(126);
  });

  it("a placement latches moved; coopEndTurn swaps hands and flips the turn", () => {
    let g = coopGame();
    const theirHand = [...g.coop!.partnerHand];
    const k = legal(g)[0];
    g = place(g, k);
    expect(g.coop!.moved).toBe(true);
    const myHandAfter = [...g.hand]; // whatever the move left Ada holding
    const swapped = coopEndTurn(g);
    expect(swapped.coop!.moved).toBe(false);
    expect(swapped.coop!.turn).toBe(1);
    expect(swapped.hand).toEqual(theirHand); // Ben now holds his own six
    expect(swapped.coop!.partnerHand).toEqual(myHandAfter); // Ada's rest is parked
  });

  it("previews never latch moved", () => {
    const g = coopGame();
    const k = legal(g)[0];
    place(g, k, 0, { preview: true });
    expect(g.coop!.moved).toBe(false);
  });

  it("an emptied active hand forces the pass; only a dry TEAM ends the run", () => {
    // a full board means every placement covers a tile — pick one that covers a
    // MINERAL via a plain activation, so nothing flows back into the hand
    // on a full board an activation that covers a mineral RETURNS it to the
    // hand — the natural way a hand empties is a bust spending the last tile
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const g = coopGame(seed);
      g.hand = [g.hand[0]];
      const partnerBefore = [...g.coop!.partnerHand];
      const k = g.order.find((kk) => !g.activatedCells.includes(kk) && describePlace(g, kk).kind === "bust");
      if (!k) continue;
      const g2 = place(g, k);
      if (g2.phase !== "playing") continue;
      found = true;
      // the bust spent the last tile (no forced drop from an empty hand) ->
      // the partner took over immediately (forced pass)
      expect(g2.coop!.turn).toBe(1);
      expect(g2.coop!.partnerHand.length).toBe(0);
      expect(g2.hand).toEqual(partnerBefore);
      expect(g2.coop!.moved).toBe(false); // the new player may act
    }
    expect(found).toBe(true);
  });

  it("a dry team ends the game", () => {
    let g = coopGame();
    g.hand = [g.hand[0]];
    g.coop!.partnerHand = [];
    const k = legal(g)[0];
    const g2 = place(g, k);
    // the single tile is spent (or forced down on a bust) — nothing left anywhere
    if (g2.hand.length === 0) expect(g2.phase).not.toBe("playing");
  });

  it("coopEndTurn with a dry partner clears the latch but keeps the same player", () => {
    let g = coopGame();
    g.coop!.partnerHand = [];
    const k = legal(g)[0];
    g = place(g, k);
    const handAfterMove = [...g.hand];
    const after = coopEndTurn(g);
    expect(after.coop!.moved).toBe(false);
    expect(after.coop!.turn).toBe(0);
    expect(after.hand).toEqual(handAfterMove); // no swap — same player carries on
  });

  it("solo games are untouched: no coop field, nine tiles", () => {
    const g = newGame({ seed: 5, side: 6 });
    expect(g.coop).toBeUndefined();
    expect(g.hand.length).toBe(9);
  });
});
