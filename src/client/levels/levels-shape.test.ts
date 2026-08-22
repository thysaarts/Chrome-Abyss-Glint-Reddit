import { describe, it, expect } from "vitest";
import { LEVELS } from "./levels";

/** The 2026-07 renumbered campaign: Tutorial + exactly 100 levels. A failure
 *  here means levels.json drifted from the split design (see the 2026-07-26
 *  tutorial-split spec). */
describe("campaign level list (tutorial split)", () => {
  it("has the tutorial + 100 levels", () => expect(LEVELS.length).toBe(101));
  it("keeps the fixed openers", () => {
    expect(LEVELS[0].title).toBe("Tutorial");
    expect(LEVELS[1].title).toBe("The Academy");
    expect(LEVELS[1].params).toMatchObject({ side: 5, dross: 2, nebulites: 0 });
    expect(LEVELS[1].countdown).toBe(false);
    expect(LEVELS[1].unlockedBy({ score: 0, banks: 0, busts: 3, coreBanked: false, nebulitesAcquired: 0, drossCleared: 0, boardCleared: false })).toBe(true);
    expect(LEVELS[2].title).toBe("Sector 01 Outpost");
    expect(LEVELS[2].countdown).toBe(false);
    expect(LEVELS[3].title).toBe("The Fortress");
  });
  it("renumbered the story shift and kept 11+ in place", () => {
    expect(LEVELS[10].title).toBe("The Tower of Truth");
    expect(LEVELS[11].title).toBe("Prime Helix");
    expect(LEVELS.filter((l) => l.title === "The Fortress")).toHaveLength(1);
    expect(LEVELS[100].boss).toBe(true);
  });
});
