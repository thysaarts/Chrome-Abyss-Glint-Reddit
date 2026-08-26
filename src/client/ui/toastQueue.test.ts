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

import { ToastQueueCore } from "./useToastQueue";

const sticky = (text: string): LogEntry => ({ text, kind: "info", sticky: true });

/** Drive the core the way the hook does: collect a log, and whenever a line is
 *  shown, ask needsTimer — ticking immediately stands in for the stagger. */
function harness() {
  const shown: string[] = [];
  const core = new ToastQueueCore((t) => shown.push(t.text));
  return { shown, core };
}

describe("ToastQueueCore — the sticky hold ends at the next entry", () => {
  it("REGRESSION: a finished run's sticky final line must not survive into the next game", () => {
    const { shown, core } = harness();
    // game 1 ends: BOARD CLEARED is the burst's last line, sticky, nothing queued
    const cleared = sticky("BOARD CLEARED — final score 12,400");
    core.collect([cleared, e("Banked Hex ×6 → +3600")]);
    core.tick(); // the banked line's beat expires → the sticky shows
    expect(shown[shown.length - 1]).toBe(cleared.text);
    expect(core.needsTimer(cleared)).toBe(false); // holds with NO timer
    // game 2: a fresh log whose head the queue has never seen (new run)
    const opening = sticky("A fresh seam. Place your first tile.");
    core.collect([opening]);
    // the new entry DISPLACES the hold — before the fix this deadlocked and
    // the previous game's final line sat on the band for the whole run
    expect(shown[shown.length - 1]).toBe(opening.text);
  });

  it("a sticky mid-run is displaced by the next placement's burst", () => {
    const { shown, core } = harness();
    const armed = sticky("GLINT RUSH ARMED");
    core.collect([armed]);
    expect(shown).toEqual([armed.text]);
    expect(core.needsTimer(armed)).toBe(false); // holding, no timer
    core.collect([e("Banked Trips → +700"), armed]);
    expect(shown[shown.length - 1]).toBe("Banked Trips → +700");
  });

  it("a NON-sticky line keeps its full beat — a new burst waits for the timer", () => {
    const { shown, core } = harness();
    const first = e("Banked Trips → +700");
    core.collect([first]);
    expect(core.needsTimer(first)).toBe(true); // timer armed, not a hold
    core.collect([e("Banked Hex ×6 → +3600"), first]);
    // still showing the first line: the running timer owns the advance
    expect(shown[shown.length - 1]).toBe(first.text);
    core.tick();
    expect(shown[shown.length - 1]).toBe("Banked Hex ×6 → +3600");
  });

  it("a sticky with lines queued behind it does not hold (its burst plays on)", () => {
    const { shown, core } = harness();
    core.collect([e("Your whole hand is revealed…"), sticky("GLINT RUSH ARMED")]);
    // shown: RUSH ARMED first (oldest-first) with the reveal pending behind it
    expect(core.needsTimer(sticky("GLINT RUSH ARMED"))).toBe(true);
    core.tick();
    expect(shown).toEqual(["GLINT RUSH ARMED", "Your whole hand is revealed…"]);
  });
});
