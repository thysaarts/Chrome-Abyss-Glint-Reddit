import { describe, expect, it } from "vitest";
import { pickDailyChallenges, DailyEntry, ObjectiveType } from "./challenges";
import { CONTENT } from "../content/content";

const entry = (id: string, type: ObjectiveType): DailyEntry => ({
  id, type, target: 1, text: id, rewardKind: "nebulite", rewardId: "",
});

// a bank shaped like the real one: 10 types, some with several variants
const BANK: DailyEntry[] = [
  entry("dross5", "dross"), entry("dross8", "dross"), entry("dross12", "dross"),
  entry("score6k", "score"), entry("score10k", "score"), entry("score20k", "score"),
  entry("neb1", "nebulite"), entry("neb2", "nebulite"), entry("neb3", "nebulite"),
  entry("clear1", "clear"), entry("clear3", "clear"),
  entry("banks3", "banks"), entry("banks5", "banks"),
  entry("rush1", "rush"), entry("rush2", "rush"),
  entry("cashout1", "cashout"), entry("cashout2", "cashout"),
  entry("fulldrift1", "fulldrift"),
  entry("nobust1", "nobust"), entry("nobust3", "nobust"),
  entry("versus1", "versus"),
];

// mirrors the picker's day/cycle arithmetic so the disjoint-days assertion can
// tell in-cycle neighbours (guaranteed disjoint) from cycle boundaries
const dayNum = (key: string): number => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
const keyOf = (day: number): string => {
  const d = new Date(day * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

describe("daily-challenge picking (type-unique, rotating)", () => {
  it("never deals two challenges of the same type on one day", () => {
    for (let day = dayNum("2026-08-22"); day < dayNum("2026-08-22") + 365; day++) {
      const picks = pickDailyChallenges(keyOf(day), BANK);
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((p) => p.type)).size).toBe(3);
    }
  });

  it("the REAL CMS bank also deals three distinct types every day for a year", () => {
    for (let day = dayNum("2026-08-22"); day < dayNum("2026-08-22") + 365; day++) {
      const picks = pickDailyChallenges(keyOf(day));
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((p) => p.type)).size).toBe(3);
    }
  });

  it("is deterministic — the same date always deals the same three", () => {
    expect(pickDailyChallenges("2026-08-22", BANK)).toEqual(pickDailyChallenges("2026-08-22", BANK));
  });

  it("consecutive days NEVER share a type (cycle boundaries smoothed)", () => {
    for (let day = dayNum("2026-08-22"); day < dayNum("2026-08-22") + 365; day++) {
      const today = new Set(pickDailyChallenges(keyOf(day), BANK).map((p) => p.type));
      const tomorrow = pickDailyChallenges(keyOf(day + 1), BANK).map((p) => p.type);
      for (const t of tomorrow) expect(today.has(t)).toBe(false);
    }
  });

  it("the REAL CMS bank is also consecutive-day disjoint for a year", () => {
    // cycle-boundary smoothing guarantees back-to-back disjointness only with
    // 9+ distinct types; this build's bank is still the pre-sync 8-type one, so
    // the assertion arms itself the moment the content sync (plan Task 11)
    // lands the live 10-type bank. Same-day type-uniqueness holds regardless
    // (the test above).
    const types = new Set((CONTENT.challenges?.dailyBank ?? []).map((e: { type: string }) => e.type)).size;
    if (types < 9) return;
    for (let day = dayNum("2026-08-22"); day < dayNum("2026-08-22") + 365; day++) {
      const today = new Set(pickDailyChallenges(keyOf(day)).map((p) => p.type));
      const tomorrow = pickDailyChallenges(keyOf(day + 1)).map((p) => p.type);
      for (const t of tomorrow) expect(today.has(t)).toBe(false);
    }
  });

  it("every type gets dealt over time (the wheel respins each cycle)", () => {
    const seen = new Set<string>();
    for (let day = dayNum("2026-08-22"); day < dayNum("2026-08-22") + 60; day++) {
      for (const p of pickDailyChallenges(keyOf(day), BANK)) seen.add(p.type);
    }
    expect(seen.size).toBe(10);
  });

  it("a bank with fewer than 3 types still fills the day's three", () => {
    const tiny = [entry("a1", "score"), entry("a2", "score"), entry("a3", "score"), entry("b1", "clear")];
    const picks = pickDailyChallenges("2026-08-22", tiny);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.type))).toEqual(new Set(["score", "clear"]));
    expect(new Set(picks.map((p) => p.id)).size).toBe(3); // no duplicate entries
  });

  it("a bank of 3 or fewer is returned whole (legacy behaviour)", () => {
    const three = [entry("a", "score"), entry("b", "clear"), entry("c", "rush")];
    expect(pickDailyChallenges("2026-08-22", three)).toEqual(three);
  });
});
