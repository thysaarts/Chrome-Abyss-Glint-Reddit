import { describe, it, expect } from "vitest";
import { mergeSave, hasMeaningfulProgress, buildReplaceOps, SYNC_KEYS, SaveSnapshot } from "./importSave";

// helper: build a versioned-envelope localStorage value. Defaults to v2 (the
// current envelope version) — these tests exercise ordinary merging with
// new-numbering values, not the v<2 remap-on-merge migration (that's the
// "2026-07 renumbering" describe block below, which sets v explicitly).
const env = (d: unknown, v = 2) => JSON.stringify({ v, d });
const dOf = (s: string) => JSON.parse(s).d;

const LEVELS = 20; // pretend this build has 20 levels

describe("mergeSave — never lose ground", () => {
  it("progress: takes the higher frontier, clamped to this build's level count", () => {
    expect(dOf(mergeSave({ "glint.progress.v1": env(3) }, { "glint.progress.v1": env(9) }, LEVELS)["glint.progress.v1"])).toBe(9);
    expect(dOf(mergeSave({ "glint.progress.v1": env(9) }, { "glint.progress.v1": env(3) }, LEVELS)["glint.progress.v1"])).toBe(9);
    // a Reddit frontier past this build's last level is clamped
    expect(dOf(mergeSave({ "glint.progress.v1": env(2) }, { "glint.progress.v1": env(999) }, LEVELS)["glint.progress.v1"])).toBe(LEVELS - 1);
  });

  it("wallet: LEGACY unstamped sides still take the max (no double-count / not farmable)", () => {
    const out = mergeSave({ "glint.wallet.v1": env({ nebulite: 120 }) }, { "glint.wallet.v1": env({ nebulite: 340 }) }, LEVELS);
    expect(dOf(out["glint.wallet.v1"]).nebulite).toBe(340);
  });

  it("wallet: NEWEST stamp wins even when lower — spending must survive a sync", () => {
    // the bug046-adjacent field case: spent down to 40 at t=2000 on device A;
    // the account save still holds the pre-spend 900 stamped t=1000 — the SPEND
    // is newer and must win (the old max() rule un-spent the wallet)
    const out = mergeSave(
      { "glint.wallet.v1": env({ nebulite: 40, at: 2000 }) },
      { "glint.wallet.v1": env({ nebulite: 900, at: 1000 }) },
      LEVELS,
    );
    expect(dOf(out["glint.wallet.v1"])).toEqual({ nebulite: 40, at: 2000 });
    // and symmetrically when the newer side is the incoming one
    const out2 = mergeSave(
      { "glint.wallet.v1": env({ nebulite: 900, at: 1000 }) },
      { "glint.wallet.v1": env({ nebulite: 40, at: 2000 }) },
      LEVELS,
    );
    expect(dOf(out2["glint.wallet.v1"])).toEqual({ nebulite: 40, at: 2000 });
  });

  it("achievements: latched keys union across devices (earned is forever)", () => {
    const out = mergeSave(
      { "glint.achievements.v1": env(["invincible"]) },
      { "glint.achievements.v1": env(["superluminal", "invincible"]) },
      LEVELS,
    );
    expect((dOf(out["glint.achievements.v1"]) as string[]).sort()).toEqual(["invincible", "superluminal"]);
  });

  it("wallet: a stamped side beats a legacy unstamped one", () => {
    const out = mergeSave(
      { "glint.wallet.v1": env({ nebulite: 40, at: 2000 }) },
      { "glint.wallet.v1": env({ nebulite: 900 }) }, // legacy: at undefined -> 0
      LEVELS,
    );
    expect(dOf(out["glint.wallet.v1"])).toEqual({ nebulite: 40, at: 2000 });
  });

  it("collection: unions owned ids per kind, deduped", () => {
    const cur = env({ themes: ["a"], music: [], stickers: ["s1", "s2"], decor: [] });
    const inc = env({ themes: ["a", "b"], music: ["m1"], stickers: ["s2", "s3"], decor: [] });
    const out = dOf(mergeSave({ "glint.collection.v1": cur }, { "glint.collection.v1": inc }, LEVELS)["glint.collection.v1"]);
    expect(out.themes.sort()).toEqual(["a", "b"]);
    expect(out.music).toEqual(["m1"]);
    expect(out.stickers.sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("results: best score per level, cleared OR'd, out-of-range levels dropped", () => {
    const cur = env({ 0: { best: 500, cleared: false }, 1: { best: 900, cleared: false } });
    const inc = env({ 0: { best: 300, cleared: true }, 2: { best: 700, cleared: true }, 999: { best: 1, cleared: true } });
    const out = dOf(mergeSave({ "glint.results.v1": cur }, { "glint.results.v1": inc }, LEVELS)["glint.results.v1"]);
    expect(out["0"]).toEqual({ best: 500, cleared: true }); // max score, cleared OR
    expect(out["1"]).toEqual({ best: 900, cleared: false });
    expect(out["2"]).toEqual({ best: 700, cleared: true });
    expect(out["999"]).toBeUndefined(); // beyond level count → dropped
  });

  it("scores: best 10 across both, deduped", () => {
    const cur = env([{ score: 100, level: "A" }, { score: 50, level: "B" }]);
    const inc = env([
      { score: 200, level: "C" }, { score: 100, level: "A" }, { score: 75, level: "D" }, { score: 60, level: "E" },
      { score: 40, level: "F" }, { score: 30, level: "G" }, { score: 25, level: "H" }, { score: 20, level: "I" },
      { score: 15, level: "J" }, { score: 12, level: "K" }, { score: 10, level: "L" },
    ]);
    const out = dOf(mergeSave({ "glint.scores.v1": cur }, { "glint.scores.v1": inc }, LEVELS)["glint.scores.v1"]);
    // 12 unique across both (the dup 100/A collapsed) → the top 10 survive
    expect(out.map((s: { score: number }) => s.score)).toEqual([200, 100, 75, 60, 50, 40, 30, 25, 20, 15]);
  });

  it("stats: numbers max, booleans OR", () => {
    const cur = env({ gamesPlayed: 50, maxBankScore: 9000, reachedRush: false, cashedOut: true });
    const inc = env({ gamesPlayed: 80, maxBankScore: 4000, reachedRush: true, cashedOut: false });
    const out = dOf(mergeSave({ "glint.stats.v1": cur }, { "glint.stats.v1": inc }, LEVELS)["glint.stats.v1"]);
    expect(out.gamesPlayed).toBe(80);
    expect(out.maxBankScore).toBe(9000);
    expect(out.reachedRush).toBe(true);
    expect(out.cashedOut).toBe(true);
  });

  it("tutorial: done if done on either side", () => {
    expect(dOf(mergeSave({ "glint.tutorial.v1": env(false) }, { "glint.tutorial.v1": env(true) }, LEVELS)["glint.tutorial.v1"])).toBe(true);
  });

  it("adopts an incoming key wholesale when the device has none", () => {
    const out = mergeSave({}, { "glint.wallet.v1": env({ nebulite: 500 }) }, LEVELS);
    expect(dOf(out["glint.wallet.v1"])).toEqual({ nebulite: 500 });
  });

  it("never imports non-progress keys (settings, cms, debug, daily…)", () => {
    const cur: SaveSnapshot = { "glint.settings.v1": env({ music: "off" }) };
    const inc: SaveSnapshot = { "glint.settings.v1": env({ music: "loud" }), "glint.cms.draft.content.v2": "x", "glint.debug": "1", "glint.daily.v1": env({ day: "2020" }) };
    const out = mergeSave(cur, inc, LEVELS);
    expect(dOf(out["glint.settings.v1"])).toEqual({ music: "off" }); // device's setting kept
    expect(out["glint.cms.draft.content.v2"]).toBeUndefined();
    expect(out["glint.debug"]).toBeUndefined();
    expect(out["glint.daily.v1"]).toBeUndefined();
  });

  it("leaves the device's own untouched keys intact", () => {
    const cur: SaveSnapshot = { "glint.settings.v1": env({ x: 1 }), "glint.progress.v1": env(2) };
    const out = mergeSave(cur, { "glint.progress.v1": env(5) }, LEVELS);
    expect(out["glint.settings.v1"]).toBe(cur["glint.settings.v1"]);
    expect(dOf(out["glint.progress.v1"])).toBe(5);
  });
});

describe("cloud-save helpers", () => {
  const env2 = (d: unknown, v = 1) => JSON.stringify({ v, d });

  it("hasMeaningfulProgress: fresh device is not meaningful", () => {
    expect(hasMeaningfulProgress({})).toBe(false);
    expect(hasMeaningfulProgress({ "glint.settings.v1": env2({ music: "off" }) })).toBe(false);
    expect(hasMeaningfulProgress({ "glint.progress.v1": env2(0) })).toBe(false);
  });

  it("hasMeaningfulProgress: any real progress counts", () => {
    expect(hasMeaningfulProgress({ "glint.progress.v1": env2(3) })).toBe(true);
    expect(hasMeaningfulProgress({ "glint.wallet.v1": env2({ nebulite: 5 }) })).toBe(true);
    expect(hasMeaningfulProgress({ "glint.stats.v1": env2({ gamesPlayed: 1 }) })).toBe(true);
    expect(hasMeaningfulProgress({ "glint.scores.v1": env2([{ score: 100, level: "A" }]) })).toBe(true);
  });

  it("buildReplaceOps: sets cloud keys, removes local-only sync keys, ignores non-sync keys", () => {
    const cloud: SaveSnapshot = {
      "glint.progress.v1": env2(7),
      "glint.wallet.v1": env2({ nebulite: 40 }),
      "glint.settings.v1": env2({ music: "loud" }), // NOT a sync key — must not be set
    };
    const ops = buildReplaceOps(cloud);
    expect(ops.set["glint.progress.v1"]).toBe(cloud["glint.progress.v1"]);
    expect(ops.set["glint.wallet.v1"]).toBe(cloud["glint.wallet.v1"]);
    expect(ops.set["glint.settings.v1"]).toBeUndefined();
    // every sync key the cloud lacks is removed (local progress discarded on purpose)
    for (const k of SYNC_KEYS) {
      if (cloud[k] === undefined) expect(ops.remove).toContain(k);
      else expect(ops.remove).not.toContain(k);
    }
  });
});

describe("mergeSave is a FIXED POINT — the cloud-save reload cannot loop", () => {
  // cloudSave.ts reloads the page whenever mergeSave changed a synced key. If
  // merging an ALREADY-merged snapshot against the same cloud produced yet
  // another change, every boot would reload forever. These prove it converges
  // in one step, for every synced key.
  const L = 20;
  const full = (): SaveSnapshot => ({
    "glint.progress.v1": env(7),
    "glint.results.v1": env({ 0: { best: 500, cleared: true }, 2: { best: 700, cleared: false } }),
    "glint.scores.v1": env([{ score: 200, level: "C" }, { score: 100, level: "A" }]),
    "glint.wallet.v1": env({ nebulite: 340 }),
    "glint.stats.v1": env({ gamesPlayed: 80, maxBankScore: 9000, reachedRush: true }),
    "glint.collection.v1": env({ themes: ["a", "b"], music: ["m1"], stickers: ["s1"], decor: [] }),
    "glint.tutorial.v1": env(true),
    "glint.academytips.v1": env({ seen: ["intro"] }),
  });

  it("re-merging the merged result against the cloud yields NO further change", () => {
    const local: SaveSnapshot = { "glint.progress.v1": env(3), "glint.wallet.v1": env({ nebulite: 120 }) };
    const cloud = full();
    const merged = mergeSave(local, cloud, L);
    // this is exactly what the NEXT boot does: mergeSave(mergedLocal, cloud)
    const again = mergeSave(merged, cloud, L);
    for (const k of SYNC_KEYS) expect(again[k]).toEqual(merged[k]); // byte-identical → no reload
  });

  it("merge is idempotent against itself (A vs A = A) for every synced key", () => {
    const a = full();
    const out = mergeSave(a, a, L);
    for (const k of SYNC_KEYS) expect(out[k]).toEqual(a[k]);
  });

  it("merge is symmetric on the merged fields (A∪B == B∪A) so either device converges", () => {
    const A: SaveSnapshot = { "glint.progress.v1": env(3), "glint.wallet.v1": env({ nebulite: 500 }), "glint.stats.v1": env({ gamesPlayed: 10, maxBankScore: 8000 }) };
    const B: SaveSnapshot = { "glint.progress.v1": env(9), "glint.wallet.v1": env({ nebulite: 120 }), "glint.stats.v1": env({ gamesPlayed: 4, maxBankScore: 9500 }) };
    const ab = mergeSave(A, B, L), ba = mergeSave(B, A, L);
    for (const k of ["glint.progress.v1", "glint.wallet.v1", "glint.stats.v1"]) {
      expect(dOf(ab[k])).toEqual(dOf(ba[k]));
    }
  });
});

describe("envelope stamp-up — this build's v1 saves are already new-numbered", () => {
  // REDDIT ADAPTATION: the web build remaps v1 payloads here; this build was
  // born after the 2026-07 renumbering, so v1 payloads keep their numbers and
  // only the envelope version rises (which tells the WEB importer not to remap
  // an exported Reddit save either).
  it("takes the max of a v1 and a v2 frontier without remapping, restamped v2", () => {
    const current = { "glint.progress.v1": JSON.stringify({ v: 2, d: 3 }) };
    const incoming = { "glint.progress.v1": JSON.stringify({ v: 1, d: 5 }) };
    const out = mergeSave(current, incoming, 101);
    expect(JSON.parse(out["glint.progress.v1"])).toEqual({ v: 2, d: 5 });
  });

  it("adopts a lone v1 frontier unchanged, restamped v2", () => {
    const incoming = { "glint.progress.v1": JSON.stringify({ v: 1, d: 9 }) };
    const out = mergeSave({}, incoming, 101);
    expect(JSON.parse(out["glint.progress.v1"])).toEqual({ v: 2, d: 9 });
  });

  it("keeps v1 results keys as they are — level 10 is a real level here", () => {
    const incoming = { "glint.results.v1": JSON.stringify({ v: 1, d: {
      "2": { best: 100, cleared: true }, "10": { best: 5, cleared: false }, "15": { best: 7, cleared: false },
    } }) };
    const out = mergeSave({}, incoming, 101);
    expect(JSON.parse(out["glint.results.v1"]).d).toEqual({
      "2": { best: 100, cleared: true }, "10": { best: 5, cleared: false }, "15": { best: 7, cleared: false },
    });
  });

  it("leaves v2 payloads alone", () => {
    const a = { "glint.progress.v1": JSON.stringify({ v: 2, d: 4 }) };
    const b = { "glint.progress.v1": JSON.stringify({ v: 2, d: 7 }) };
    expect(JSON.parse(mergeSave(a, b, 101)["glint.progress.v1"])).toEqual({ v: 2, d: 7 });
  });
});
