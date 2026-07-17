import { describe, expect, it } from "vitest";
import { newGame, place, describePlace, isLegalTarget, GameState, CORE, ZENITH } from "./engine";

/**
 * THE BUST CONSISTENCY BATCH (decision record):
 *  1. One bust, one rule — a tile is forced down in EVERY phase, Glint Rush
 *     included. Blind hand → the invisible mercy (skip Nebulites). Revealed
 *     wheel → strict next tile, no skips, Nebulite/Zenith included.
 *  2. Inert is a purely VISUAL marker — the forced tile discards, pairs and
 *     banks like any other tile.
 *  3. Cause-based resolution: the bust's own wake resolves FIRST and is
 *     DISCARDED (a bust never pays), THEN an owed collapse fires, and what the
 *     collapse strands resolves by the STANDARD isolation rules (banks/hand).
 */

const legal = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));
const bustKeys = (g: GameState) =>
  g.order.filter((k) => !g.activatedCells.includes(k) && describePlace(g, k).kind === "bust");
const occupied = (g: GameState) => g.order.filter((k) => (g.cells.get(k)?.tile ?? null) !== null);

/** Any deliberate bust target. On the opening board (full) and on most boards the
 *  forced tile lands inside a large occupied component, so it survives the wake
 *  and can be inspected sitting on the board. */
function anchoredBustKey(g: GameState): string | null {
  return bustKeys(g)[0] ?? null;
}

/** A bust target in empty space — no occupied neighbours, so the forced tile
 *  lands fully isolated and the wake must discard it (inert is visual only). */
function lonelyBustKey(g: GameState): string | null {
  for (const k of bustKeys(g)) {
    if ((g.cells.get(k)?.tile ?? null) !== null) continue;
    if ((g.adj.get(k) ?? []).every((n) => (g.cells.get(n)?.tile ?? null) === null)) return k;
  }
  return null;
}

describe("one bust, one rule — the forced tile", () => {
  it("blind hand: the mercy skips Nebulites; the next ordinary tile is forced", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const g = newGame({ seed, side: 6, rescueMode: "off" });
      if (g.hand[0] === CORE) continue;
      const k = anchoredBustKey(g);
      if (!k) continue;
      expect(g.handRevealed).toBe(false); // 9 tiles > reveal threshold
      g.hand = [g.hand[0], CORE, 4, 5, 2, 3, 6, 1, 4];
      const g2 = place(g, k);
      const at = g2.lastResolved.inertAt;
      expect(at, `seed ${seed}: a tile must be forced down`).toBeTruthy();
      expect(g2.cells.get(at!)?.tile, `seed ${seed}: mercy skips the Nebulite`).toBe(4);
      expect(g2.hand).toContain(CORE); // the Nebulite stayed in the hand
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("revealed wheel: strictly the next tile — a Nebulite is NOT skipped", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const g = newGame({ seed, side: 6, rescueMode: "off" });
      if (g.hand[0] === CORE) continue;
      const k = anchoredBustKey(g);
      if (!k) continue;
      g.handRevealed = true; // the wheel is visible — busting into it is on you
      g.hand = [g.hand[0], CORE, 4, 5, 2, 3, 6, 1, 4];
      const g2 = place(g, k);
      const at = g2.lastResolved.inertAt;
      expect(at, `seed ${seed}: a tile must be forced down`).toBeTruthy();
      expect(g2.cells.get(at!)?.tile, `seed ${seed}: no mercy once revealed`).toBe(CORE);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("GLINT RUSH: a bust forces a tile too — Zenith included, no skips", () => {
    let checked = 0;
    for (let seed = 1; seed <= 120 && checked < 3; seed++) {
      let g = newGame({ seed, side: 5, collapseAt2: 15, rescueMode: "off" });
      for (let m = 0; m < 300 && g.phase === "playing" && !g.deathMatch; m++) {
        const t = legal(g);
        if (t.length === 0) break;
        g = place(g, t[(seed * 31 + m * 17) % t.length]);
      }
      if (!g.deathMatch || g.phase !== "playing") continue;
      const k = anchoredBustKey(g);
      if (!k || g.hand.length < 2 || g.hand[0] === CORE) continue;
      g.hand = [g.hand[0], ZENITH, ...g.hand.slice(2)];
      const handBefore = g.hand.length;
      const g2 = place(g, k);
      if (g2.phase !== "playing") continue; // third bust ends the run — no forced tile there
      const at = g2.lastResolved.inertAt;
      expect(at, `seed ${seed}: rush bust must force a tile now`).toBeTruthy();
      // the Zenith came down — either it sits on the board, or it landed isolated
      // and the wake discarded it (both prove the strict no-skip forced drop)
      const onBoard = g2.cells.get(at!)?.tile === ZENITH;
      const discarded = g2.lastResolved.lateDiscarded.some((t) => t.value === ZENITH);
      expect(onBoard || discarded, `seed ${seed}: the Zenith comes down — the wheel was visible`).toBe(true);
      // busted tile + forced tile left the hand; recoveries (pair/buried) may return
      const returned = g2.lastResolved.pairToHand.length + g2.lastResolved.buriedToHand.length +
        g2.lastResolved.lateIsolated.toHand.length + g2.lastResolved.lateIsolated.buried.length;
      expect(g2.hand.length).toBe(handBefore - 2 + returned);
      expect(g2.hand).not.toContain(ZENITH);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("inert is a visual marker only", () => {
  it("a forced tile landing in empty space is DISCARDED by the bust's own wake", () => {
    // empty pockets only exist mid-game (the opening board is full) — play until
    // a fully-lonely bust cell appears, bust there, and the forced tile must be
    // gone: discarded by the wake (inert is a visual marker, not a shield). A
    // nudge can drift it back into contact — those instances are skipped.
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 4; seed++) {
      let g = newGame({ seed, side: 6, rescueMode: "off" });
      for (let m = 0; m < 200 && g.phase === "playing"; m++) {
        const k = lonelyBustKey(g);
        if (k) {
          const scoreBefore = g.score;
          const g2 = place(g, k);
          const res = g2.lastResolved;
          const at = res.inertAt;
          if (at && (g2.cells.get(at)?.tile ?? null) !== null) {
            // it survived — legal ONLY because the wake reconnected it (a nudge or
            // Core respawn moved a neighbour in); truly isolated must be discarded
            const nbrOcc = (g2.adj.get(at) ?? []).some((n) => (g2.cells.get(n)?.tile ?? null) !== null);
            expect(nbrOcc, `seed ${seed} move ${m}: a surviving forced tile must have a neighbour`).toBe(true);
          } else if (at) {
            expect(res.lateDiscarded.some((t) => t.key === at), `seed ${seed} move ${m}: the isolated forced tile must be in the discards`).toBe(true);
            if (!res.shrunk) expect(g2.score, `seed ${seed} move ${m}: a bust never pays`).toBe(scoreBefore);
            checked++;
          }
          g = g2;
          if (g.phase !== "playing") break;
          continue;
        }
        const t = legal(g);
        if (t.length === 0) break;
        g = place(g, t[(seed * 31 + m * 17) % t.length]);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("cause-based resolution — the bust never pays, the collapse does", () => {
  it("any bust WITHOUT a collapse leaves the score untouched (rush included)", () => {
    let busts = 0, rushBusts = 0;
    for (let seed = 1; seed <= 80 && (busts < 12 || rushBusts < 3); seed++) {
      let g = newGame({ seed, side: 5, collapseAt2: 15, rescueMode: "off" });
      for (let m = 0; m < 300 && g.phase === "playing"; m++) {
        // every few moves, try a deliberate bust
        if (m % 7 === 3) {
          const k = bustKeys(g).find((kk) => !g.activatedCells.includes(kk));
          if (k) {
            const before = g.score;
            const g2 = place(g, k);
            if (!g2.lastResolved.shrunk) {
              expect(g2.score, `seed ${seed} move ${m}: bust w/o collapse must not pay`).toBe(before);
              expect(g2.lastResolved.lateIsolated.banked.length, `seed ${seed} move ${m}: nothing banks in a collapse-less bust`).toBe(0);
              busts++;
              if (g.deathMatch) rushBusts++;
            }
            g = g2;
            if (g.phase !== "playing") break;
            continue;
          }
        }
        const t = legal(g);
        if (t.length === 0) break;
        g = place(g, t[(seed * 31 + m * 17) % t.length]);
      }
    }
    expect(busts).toBeGreaterThan(5);
    expect(rushBusts).toBeGreaterThan(0);
  });

  it("a bust-triggered collapse pays EXACTLY its strays — the wake pays nothing", () => {
    // Bankable strays after a bust-collapse are naturally rare (the wake discard
    // sweeps the singles first, and the remap is built to reconnect) — so the
    // invariant is the guard: across every bust that collapses, the score moves
    // by exactly the collapse-strays' points (usually zero), never by the wake's.
    let shrunkBusts = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let g = newGame({ seed, side: 6, rescueMode: "off" });
      for (let m = 0; m < 300 && g.phase === "playing"; m++) {
        // near the trigger with an activated cluster? deliberately bust to collapse
        if (g.activatedCells.length >= 2 && occupied(g).length - g.activatedCells.length <= g.collapseAt1 + 3) {
          const k = bustKeys(g).find((kk) => !!place(g, kk).lastResolved.shrunk);
          if (k) {
            const before = g.score;
            const g2 = place(g, k);
            const r = g2.lastResolved;
            const strayPoints = r.lateIsolated.banked.reduce((n, t) => n + t.points, 0);
            expect(g2.score, `seed ${seed} move ${m}: only the collapse pays, exactly its strays`).toBe(before + strayPoints);
            // nothing is both discarded (wake) and banked (collapse)
            for (const d of r.lateDiscarded) {
              expect(r.lateIsolated.banked.find((b) => b.key === d.key)).toBeUndefined();
            }
            shrunkBusts++;
            g = g2;
            if (g.phase !== "playing") break;
            continue;
          }
        }
        const t = legal(g);
        if (t.length === 0) break;
        g = place(g, t[(seed * 31 + m * 17) % t.length]);
      }
    }
    expect(shrunkBusts, "search must find bust-collapses").toBeGreaterThan(3);
  });
});
