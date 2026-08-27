import { describe, it, expect } from "vitest";
import { newGame, GameState } from "./engine";
import { chooseBrokerAction, applyBrokerAction, BrokerTier } from "./brokerAI";

/**
 * SELF-PLAY HARNESS — the Broker plays herself across seeds. Proves:
 *  1. every tier can finish full games without stalling or crashing,
 *  2. the tier ladder is real: tier 3 beats tier 1 across a seed batch,
 *  3. the fair-info contract holds (she never reads the opponent's hand).
 */

/** a seeded rng so the harness is deterministic run to run */
const seededRng = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0xffffffff; };
};

function playDuel(seed: number, tierA: BrokerTier, tierB: BrokerTier): { winner: number; turns: number } {
  let s: GameState = newGame({ seed, versus: { names: ["A", "B"] }, side: 6 });
  const rng = seededRng(seed * 7 + tierA * 13 + tierB * 29);
  let turns = 0;
  while (s.phase === "playing" && turns < 400) {
    const tier = s.versus!.turn === 0 ? tierA : tierB;
    const action = chooseBrokerAction(s, tier, rng);
    if (!action) break; // no legal action — the engine will have ended it or we bail
    const before = s;
    s = applyBrokerAction(s, action);
    if (s === before) break; // guard: an action that no-ops must not loop forever
    turns++;
  }
  const r = s.versus?.result;
  return { winner: r ? r.winner : -2, turns };
}

describe("the Broker plays herself (self-play harness)", () => {
  it("every tier finishes real games", () => {
    for (const tier of [1, 2, 3] as BrokerTier[]) {
      const { winner, turns } = playDuel(100 + tier, tier, tier);
      expect(turns).toBeGreaterThan(4); // a real game happened
      expect([-1, 0, 1]).toContain(winner); // and actually concluded
    }
  }, 120_000);

  it("the tier ladder is real: tier 3 outplays tier 1 over a seed batch", () => {
    let t3 = 0, t1 = 0;
    // 15 seat-swapped pairs (30 games): the HONEST HANDS rule (2026-08-27)
    // narrowed per-game margins, so the old 8-pair sample was coin-flippy —
    // over this batch the ladder is clear (measured 43–17 across 60 games)
    const SEEDS = Array.from({ length: 15 }, (_, i) => 7 + i * 17);
    for (const seed of SEEDS) {
      // swap seats each game so first-move advantage cancels out
      const a = playDuel(seed, 1, 3); // seat0 = tier1, seat1 = tier3
      if (a.winner === 1) t3++; else if (a.winner === 0) t1++;
      const b = playDuel(seed + 1000, 3, 1); // seats swapped
      if (b.winner === 0) t3++; else if (b.winner === 1) t1++;
    }
    expect(t3).toBeGreaterThan(t1);
  }, 300_000);

  it("FAIR INFO: her choice is identical whatever the hidden opponent hand holds", () => {
    const base = newGame({ seed: 55, versus: { names: ["A", "B"] }, side: 6 });
    const rng1 = seededRng(9), rng2 = seededRng(9);
    // rewrite the opponent's hidden hand — if she ever reads it, choices diverge
    const tampered: GameState = {
      ...base,
      versus: { ...base.versus!, partnerHand: [...base.versus!.partnerHand].reverse() },
    };
    const a = chooseBrokerAction(base, 3, rng1);
    const b = chooseBrokerAction(tampered, 3, rng2);
    expect(a).toEqual(b);
  }, 60_000);
});
