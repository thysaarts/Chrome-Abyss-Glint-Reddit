/**
 * VERSUS clear-bonus shares (Thys ruling 2026-08-22):
 * — online versus keeps the classic SPLIT: 50/50 with the odd point and a
 *   +1,000 finisher's premium to the clearer (bigger board, bigger payout);
 * — the HOUSE duel is winner-take-all: the clearer takes the whole bonus.
 * The Broker only HUNTS that ending at tier 3 (clearIQ) — tiers 1–2 value a
 * clearing move like any other placement (gate lives in brokerAI.evaluate).
 */
import { describe, expect, it } from "vitest";
import { newGame, versusClearShares } from "./engine";

describe("versusClearShares", () => {
  it("classic split: 50/50 with the odd point, +1,000 premium to the clearer", () => {
    expect(versusClearShares(5000, false)).toEqual([3500, 2500]);
    expect(versusClearShares(10000, false)).toEqual([6000, 5000]);
    expect(versusClearShares(7501, false)).toEqual([4750, 3751]); // odd point to the other half (ceil)
  });

  it("house rule: the clearer takes the WHOLE bonus", () => {
    expect(versusClearShares(5000, true)).toEqual([5000, 0]);
    expect(versusClearShares(10000, true)).toEqual([10000, 0]);
  });

  it("the flag rides in via newGame's versus opts and defaults OFF", () => {
    const duel = newGame({ side: 6, seed: 7, versus: { names: ["P", "B"], clearWinnerTakesAll: true } });
    expect(duel.versus?.clearWinnerTakesAll).toBe(true);
    const online = newGame({ side: 6, seed: 7, versus: { names: ["A", "B"] } });
    expect(online.versus?.clearWinnerTakesAll).toBe(false);
  });
});
