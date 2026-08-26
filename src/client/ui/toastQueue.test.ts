import { describe, it, expect } from "vitest";
import { newEntries } from "./useToastQueue";
import type { GameState } from "../game/engine";

type LogEntry = GameState["log"][number];
const e = (text: string): LogEntry => ({ text, kind: "info" });

/**
 * The queue's diff. `state.log` is newest-first and capped at 40; a placement
 * can push several entries at once, and the band must play them in the order
 * they happened — not just the last one, which is all it used to show.
 */
describe("newEntries — what the band has not shown yet", () => {
  it("returns a burst OLDEST-first (the order the engine pushed them)", () => {
    const banked = e("Banked Hex ×6 → +3600");
    const iso = e("Isolated Nuracite banked for face value - +600");
    const before = [e("older")];
    // pushLog prepends, so the newest is at the head
    const after = [iso, banked, ...before];
    expect(newEntries(before[0], after).map((x) => x.text)).toEqual([banked.text, iso.text]);
  });

  it("returns nothing when the head has not moved", () => {
    const log = [e("a"), e("b")];
    expect(newEntries(log[0], log)).toEqual([]);
  });

  it("takes only the newest few when the previous head is gone (new run / cap overflow)", () => {
    const log = [e("d"), e("c"), e("b"), e("a")];
    // the entry it last saw is not in this log at all
    expect(newEntries(e("vanished"), log, 2).map((x) => x.text)).toEqual(["c", "d"]);
  });

  it("treats a first-ever log as a single opening line, not a replay of history", () => {
    const log = [e("opening")];
    expect(newEntries(null, log).map((x) => x.text)).toEqual(["opening"]);
  });

  it("handles an empty log", () => {
    expect(newEntries(null, [])).toEqual([]);
  });

  it("keeps a four-line burst in choreography order", () => {
    const bank = e("Banked Trips + Trips (Convergence) → +700");
    const iso = e("Isolated Vigilite banked for face value - +200");
    const collapse = e("THE ABYSS COLLAPSES — the board contracts to 61 tiles.");
    const reveal = e("Your whole hand is revealed…");
    const prev = e("previous");
    const after = [reveal, collapse, iso, bank, prev];
    expect(newEntries(prev, after, 10).map((x) => x.text)).toEqual([bank.text, iso.text, collapse.text, reveal.text]);
  });
});
