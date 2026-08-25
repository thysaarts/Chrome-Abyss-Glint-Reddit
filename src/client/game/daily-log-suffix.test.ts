import { describe, it, expect } from "vitest";
import { newGame, place, isLegalTarget, describePlace, GameState } from "./engine";
import { dailyGame, dailySeed } from "./daily";

/**
 * THE DAILY RUNNING TOTAL — the in-run suffix on scoring log lines.
 *
 * A daily board tracks ONE metric, and until now the player had no way to see
 * where they stood on it mid-run (only `score` and `nebulite` reach the end
 * summary at all). `newGame({ runningTotal })` appends that total to the log
 * line of the event that moves it — a suffix, not a second line, so the
 * celebratory line is never displaced from the floating toast.
 *
 * The engine stays daily-AGNOSTIC: it knows "append this running total", never
 * what a daily is. `dailyGame()` is the only place that maps metric → total.
 */

const legal = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));

/** A plain player: bank when you can, else any non-busting move. */
function step(g: GameState): GameState | null {
  const ks = legal(g);
  if (!ks.length) return null;
  let bank: string | null = null, safe: string | null = null;
  for (const k of ks) {
    const d = describePlace(g, k);
    if (d.kind === "bank" && bank === null) bank = k;
    else if (d.kind !== "bust" && safe === null) safe = k;
  }
  return place(g, bank ?? safe ?? ks[0]);
}

/** The engine caps `state.log` at 40 entries, so a finished run's log is NOT the
 *  whole run. Collect every line as it is emitted (newest-first per step) so the
 *  assertions below see the complete stream. */
function playOut(opts: Parameters<typeof newGame>[0], maxTurns = 400): { g: GameState; lines: LogLine[] } {
  let g = newGame(opts);
  const lines: LogLine[] = [...g.log];
  for (let i = 0; i < maxTurns && g.phase === "playing"; i++) {
    const top = g.log[0];
    const next = step(g);
    if (!next) break;
    g = next;
    const at = top ? next.log.indexOf(top) : -1;
    const added = at === -1 ? next.log : next.log.slice(0, at);
    lines.unshift(...added); // keep newest-first, matching state.log
  }
  return { g, lines };
}
type LogLine = GameState["log"][number];

const dailyOpts = (day: string, extra: Record<string, unknown> = {}) => ({
  ...dailyGame(dailySeed(day), "score"),
  bonusGems: { resurrect: false, quadriant: false, zenith: false },
  ...extra,
});

/** log entries newest-first → oldest-first, bank lines only */
const bankLines = (lines: LogLine[]) => [...lines].reverse().filter((e) => e.kind === "bank" || e.kind === "core");
const amountOf = (text: string): number | null => {
  const m = /→ \+([\d,]+)/.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

const DAYS = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];

describe("daily running total — suffix on the scoring line", () => {
  it("adds NOTHING when no runningTotal is set (every other mode is untouched)", () => {
    for (const day of DAYS) {
      const { lines } = playOut(dailyOpts(day));
      for (const e of lines) expect(e.text).not.toMatch(/·/);
    }
  });

  it("banks: every bank line carries the running bank count, ending at the run's total", () => {
    for (const day of DAYS) {
      const { g, lines: all } = playOut(dailyOpts(day, { runningTotal: "banks" }));
      const lines = bankLines(all).filter((e) => amountOf(e.text) !== null);
      if (!lines.length) continue;
      const counts = lines.map((e) => {
        const m = /· (\d+) banks?/.exec(e.text);
        return m ? Number(m[1]) : null;
      });
      // every bank line is suffixed…
      expect(counts.every((c) => c !== null)).toBe(true);
      // …and the count only ever climbs, finishing at the run's bank total
      for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
      expect(counts[counts.length - 1]).toBe(g.banks);
    }
  });

  it("chains: suffixes ONLY the banks that formed a chain", () => {
    for (const day of DAYS) {
      const { g, lines } = playOut(dailyOpts(day, { runningTotal: "chains" }));
      const total = (g.chainCounts.Convergence ?? 0) + (g.chainCounts.Harmony ?? 0) + (g.chainCounts.Accord ?? 0) + (g.chainCounts.Sweep ?? 0);
      const suffixed = lines.filter((e) => /· \d+ chains?/.test(e.text));
      expect(suffixed.length).toBe(total);
    }
  });

  it("bankscore: shows on a new best, and on a bank within 1000 of it — never below that", () => {
    for (const day of DAYS) {
      const { lines: all } = playOut(dailyOpts(day, { runningTotal: "bankscore" }));
      const lines = bankLines(all).filter((e) => amountOf(e.text) !== null);
      let prevMax = 0;
      for (const e of lines) {
        const amt = amountOf(e.text)!;
        const wanted = amt > prevMax || amt >= prevMax - 1000;
        expect(/· best [\d,]+/.test(e.text), `${wanted ? "expected" : "did not expect"} a suffix on: ${e.text}`).toBe(wanted);
        prevMax = Math.max(prevMax, amt);
      }
    }
  });

  it("the suffix never displaces the line it reports on — same entry, same count", () => {
    for (const day of DAYS) {
      const plain = playOut(dailyOpts(day));
      const withTotal = playOut(dailyOpts(day, { runningTotal: "banks" }));
      // identical play, so identical number of log entries: a suffix, not a new line
      expect(withTotal.lines.length).toBe(plain.lines.length);
    }
  });
});
