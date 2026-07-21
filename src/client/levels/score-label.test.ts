import { describe, it, expect } from "vitest";
import { LEVELS, displayScoreLabel, levelScoreLabel } from "./levels";

/**
 * Score-board rows freeze their label at the moment a run ends, so rows written
 * before `levelScoreLabel` existed hold a bare "The Academy". `displayScoreLabel`
 * re-prefixes those at render time — and must leave everything else alone.
 */
describe("displayScoreLabel back-fills the level number on old rows", () => {
  const academy = LEVELS.find((l) => l.title === "The Academy")!;

  it("prefixes a bare campaign title", () => {
    expect(displayScoreLabel("The Academy")).toBe(`Lv${academy.num}: The Academy`);
  });

  it("matches what a fresh run would have written", () => {
    for (const level of LEVELS) {
      expect(displayScoreLabel(level.title)).toBe(levelScoreLabel(level));
    }
  });

  it("is idempotent — an already-numbered label passes through", () => {
    const numbered = levelScoreLabel(academy);
    expect(displayScoreLabel(numbered)).toBe(numbered);
  });

  it("leaves non-campaign labels alone", () => {
    expect(displayScoreLabel("Quick Start")).toBe("Quick Start");
    expect(displayScoreLabel("Daily Challenge")).toBe("Daily Challenge");
  });
});
