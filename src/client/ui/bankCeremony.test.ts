/**
 * The BANK NOW ceremony's cell walk must agree with the engine's claim rule
 * (88d6ee2: the opponent's claim is a BOUNDARY). The ceremony once ran its own
 * un-walled BFS — a Broker bank adjacent to the player's claim visually
 * "banked" the claimed gems, which then reappeared at the commit. These tests
 * pin the wall so the visual layer can never disagree with the engine again.
 */
import { describe, expect, it } from "vitest";
import { GameState } from "../game/engine";
import { ceremonyCluster } from "./bankCeremony";

/** minimal walkable state: a straight line of cells a-b-c-d-e-f. */
function lineState(overrides: Partial<{
  activated: string[];
  claims: [{ cells: string[]; graceUsed: boolean } | null, { cells: string[]; graceUsed: boolean } | null];
  turn: 0 | 1;
}> = {}): GameState {
  const order = ["a", "b", "c", "d", "e", "f"];
  const adj = new Map<string, string[]>();
  order.forEach((k, i) => {
    const nbs: string[] = [];
    if (order[i - 1]) nbs.push(order[i - 1]);
    if (order[i + 1]) nbs.push(order[i + 1]);
    adj.set(k, nbs);
  });
  return {
    order,
    adj,
    activatedCells: overrides.activated ?? ["a", "b", "c", "d", "e"],
    versus: {
      turn: overrides.turn ?? 0,
      claims: overrides.claims ?? [null, null],
    },
  } as unknown as GameState;
}

describe("ceremonyCluster — the BANK NOW ceremony walks what the engine banks", () => {
  it("walks the whole connected activated cluster when nothing is claimed", () => {
    expect(ceremonyCluster(lineState(), "a").sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("STOPS at the opponent's claim — the wall that keeps her bank off my combo", () => {
    // seat 0 banks from `a`; seat 1 (the opponent) has claimed d+e
    const st = lineState({ claims: [null, { cells: ["d", "e"], graceUsed: false }], turn: 0 });
    expect(ceremonyCluster(st, "a").sort()).toEqual(["a", "b", "c"]);
  });

  it("never bridges THROUGH a claim to activated cells on the far side", () => {
    // claim in the middle: c is claimed; e is activated beyond it — unreachable
    const st = lineState({ activated: ["a", "b", "c", "d", "e"], claims: [null, { cells: ["c"], graceUsed: false }], turn: 0 });
    expect(ceremonyCluster(st, "a").sort()).toEqual(["a", "b"]);
  });

  it("a claimed start banks nothing (the engine refuses it; the ceremony must too)", () => {
    const st = lineState({ claims: [null, { cells: ["a", "b", "c", "d", "e"], graceUsed: false }], turn: 0 });
    expect(ceremonyCluster(st, "a")).toEqual([]);
  });

  it("the banker's OWN claim stays in the walk — banking your claim is the point of claiming", () => {
    const st = lineState({ claims: [{ cells: ["d", "e"], graceUsed: false }, null], turn: 0 });
    expect(ceremonyCluster(st, "a").sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("the wall follows the TURN, not a literal seat (bug049 family)", () => {
    // same claim, but now ITS OWNER (seat 1) is the one banking — no wall
    const st = lineState({ claims: [null, { cells: ["d", "e"], graceUsed: false }], turn: 1 });
    expect(ceremonyCluster(st, "a").sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("solo games (no versus) walk unwalled, as before", () => {
    const st = lineState();
    (st as { versus?: unknown }).versus = undefined;
    expect(ceremonyCluster(st, "a").sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});
