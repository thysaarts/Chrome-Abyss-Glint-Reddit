/**
 * THE ZENITH BELONGS TO WHO EARNED IT (Thys ruling, 2026-08-22): in versus the
 * Superluminal unlock is the DEVICE OWNER's (entry 0) — the Broker or a
 * hot-seat guest never receives it, no matter whose turn arms GLINT RUSH.
 * The original deal pushed into the ACTIVE hand, so a rush arming on the
 * Broker's turn handed HER the player's earned gem (reported in a duel).
 * Online games force bonus gems off entirely, so this rule is hot-seat-only.
 */
import { describe, expect, it } from "vitest";
import { ZENITH, dealZenith, newGame, versusEndTurn } from "./engine";

const mk = () =>
  newGame({
    side: 6,
    seed: 424242,
    versus: { names: ["Player", "Broker"] },
    bonusGems: { resurrect: false, quadriant: false, zenith: true },
  });

describe("dealZenith in versus — entitlement follows ENTRY 0, not the active seat", () => {
  it("deals into the live hand when the entitled player is ACTIVE", () => {
    let g = mk();
    // make sure the entitled player (entry 0) holds the turn
    if (g.versus!.turn !== g.versus!.seatByEntry[0]) g = versusEndTurn(g);
    dealZenith(g);
    expect(g.hand[0]).toBe(ZENITH);
    expect(g.versus!.partnerHand).not.toContain(ZENITH);
  });

  it("deals into the PARKED hand when the rush arms on the opponent's turn", () => {
    let g = mk();
    // give the OPPONENT (entry 1) the turn
    if (g.versus!.turn === g.versus!.seatByEntry[0]) g = versusEndTurn(g);
    dealZenith(g);
    // the opponent's live hand must NOT gain the gem…
    expect(g.hand).not.toContain(ZENITH);
    // …the entitled player's parked hand holds it…
    expect(g.versus!.partnerHand[0]).toBe(ZENITH);
    // …and the turn flip delivers it to their live hand
    const back = versusEndTurn(g);
    expect(back.hand[0]).toBe(ZENITH);
  });

  it("still deals only once per run", () => {
    let g = mk();
    if (g.versus!.turn !== g.versus!.seatByEntry[0]) g = versusEndTurn(g);
    dealZenith(g);
    dealZenith(g);
    expect(g.hand.filter((t) => t === ZENITH)).toHaveLength(1);
  });

  it("never deals when the unlock is off (online parity — gems forced off)", () => {
    const g = newGame({
      side: 6,
      seed: 424242,
      versus: { names: ["A", "B"] },
      bonusGems: { resurrect: false, quadriant: false, zenith: false },
    });
    dealZenith(g);
    expect(g.hand).not.toContain(ZENITH);
    expect(g.versus!.partnerHand).not.toContain(ZENITH);
  });
});
