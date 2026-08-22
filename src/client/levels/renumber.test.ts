import { describe, it, expect } from "vitest";
import { remapLevelNum, remapLevelKeys, SAVE_NUMBERING_V } from "./renumber";

describe("2026-07 campaign renumbering", () => {
  it("bumps the save numbering version", () => {
    expect(SAVE_NUMBERING_V).toBe(2);
  });

  it("remaps old level numbers to the new list", () => {
    const table: [number, number][] = [
      [0, 0],   // tutorial stays
      [1, 2],   // old Academy → Sector 01 Outpost
      [2, 3],   // old The Outpost → The Fortress
      [9, 10],  // old Tower of Truth → 10
      [10, 11], // old The Fortress (deleted) → its successor
      [11, 11], // old 11+ unchanged
      [40, 40],
      [100, 100],
      [-3, 0],  // garbage clamps to 0
    ];
    for (const [from, to] of table) expect(remapLevelNum(from)).toBe(to);
  });

  it("remaps level-keyed records, dropping old level 10", () => {
    expect(remapLevelKeys({ "0": "a", "2": "b", "10": "dead", "15": "c" }))
      .toEqual({ "0": "a", "3": "b", "15": "c" });
    expect(remapLevelKeys({ junk: "x", "-1": "y" })).toEqual({});
  });
});
