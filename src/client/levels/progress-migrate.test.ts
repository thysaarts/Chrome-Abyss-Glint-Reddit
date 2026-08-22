import { describe, it, expect } from "vitest";
import { migrateProgress, migrateResults } from "./progress";

/** The readVersioned migrate callbacks — pure, so they're testable without
 *  localStorage (vitest runs in plain node).
 *
 *  REDDIT ADAPTATION: the web build's v1→v2 migrate REMAPS (its v1 saves hold
 *  pre-renumbering level numbers). This build was born after the renumbering —
 *  every v1 payload already holds new numbers — so the migrate must be a pure
 *  identity: only the envelope version rises. A remap here would gift every
 *  existing Reddit player a +1 frontier shift. */
describe("progress save migration (envelope v1 → v2, identity)", () => {
  it("passes a v0/v1 frontier through UNCHANGED", () => {
    expect(migrateProgress(5, 1)).toBe(5);
    expect(migrateProgress(10, 0)).toBe(10);
    expect(migrateProgress(6, 2)).toBe(6);
    expect(migrateProgress("junk", 1)).toBe("junk");
  });
  it("passes v1 results through UNCHANGED — level 10 is a real level here", () => {
    const v1 = { "1": { best: 9, cleared: false }, "10": { best: 1, cleared: true } };
    expect(migrateResults(v1, 1)).toBe(v1);
    const v2 = { "2": { best: 9, cleared: false } };
    expect(migrateResults(v2, 2)).toBe(v2);
  });
});
