# Glint — Developer Handover

**Project:** Chrome Abyss: Glint (mobile-first push-your-luck combo puzzle)
**Stack:** Vite + React 18 + TypeScript
**Status at handover:** engine complete & tested; UI functional but unstyled; ready for a
visual-design pass and continued feature work in VS Code + Claude Code.

This document is the single starting point for picking the project up. Read it top to bottom
once; then keep the README and the GDD nearby for the rules.

---

## 1. Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit, run this often
npm run build        # tsc -b && vite build  -> dist/
```

Recommended VS Code extensions: ESLint, Prettier, and the **Claude Code** extension. The
codebase is small enough that Claude Code can hold most of it in context; point it at
`src/game/engine.ts` first — that's the heart of the project.

There are **no external runtime dependencies** beyond React. No state library, no router, no
CSS framework — styling is the Squads CSS variables in `src/index.css` plus inline styles.

---

## 2. The mental model (read this first)

Glint is split cleanly into two halves:

**`src/game/` — the engine.** Pure TypeScript, no React, no timers, no DOM. Every rule lives
here. State transitions are pure functions: `place(state, cellKey)` returns a brand-new
`GameState`. The engine is deterministic given a seed.

**`src/ui/` — the presentation.** React components plus one big orchestration hook
(`useNebuliteGame.ts`) that owns all timing and animation. The UI never re-implements rules; it
asks the engine what would happen and animates the result.

The bridge between them is two functions and one field:

- `describePlace(state, cellKey)` → a read-only `PlaceOutcome` describing what a placement
  *would* do (bank / bust / activate, which tiles, what score). The UI uses this to drive the
  animation **before** committing.
- `place(state, cellKey)` → commits the move and returns the new state.
- `state.lastResolved` → after any commit, this holds everything the UI needs to animate
  (tiles that moved to the hand, isolated tiles, the board-shrink mapping, the nudge moves,
  the Nebulite respawn cell, etc.). It's reset at the start of each resolution.

If you keep that split intact, the project stays easy to reason about. **Put rules in the
engine; put timing and visuals in the UI.**

---

## 3. File-by-file

### Engine (`src/game/`)

- **`hex.ts`** — Pointy-top axial hex geometry. `keyOf({q,r})` makes the `"q,r"` cell keys,
  `hexCells(side)` builds a hexagon, `neighbours`, `ringOf`, `hexDistance`, `axialToPixel`.
- **`combos.ts`** — Combo and chain definitions and scoring. Exports `COMBO_POINTS`,
  `CHAIN_POINTS`, `CORE_BONUS` (500), `BANK_THRESHOLD` (6), `BOARD_CLEAR_BONUS` (5000),
  `classifyGroup`, `chainBonus`, `scoreBank`, `isBuildablePrefix`. All pure and unit-tested.
- **`activation.ts`** — Turns one placement into a whole combo. `detectActivations(cellKey,
  value, boardView)` finds the up-to-two combos a placement activates (a set + a straight, or
  two straights), handles the Nebulite-joker logic, and the 7+ same-value strand → Hex-from-nearest-6.
- **`shrink.ts`** — `shrinkBoard()` collapses a side-6 board to side-5, remapping occupied
  tiles inward, placing pre-banked combos first as rigid groups, and preserving tile count.
- **`engine.ts`** — The state machine and public API. This is the big one (~1450 lines). Key
  exports:
  - Constants: `SHRINK_TRIGGER` (30), `GLINT` (0), `CORE` (7), `MINERAL_QTY`.
  - Types: `GameState`, `Cell`, `Phase`, `TileVal`, `MovePlan`, `PlaceOutcome`, `PlaceKind`.
  - `newGame(opts)` — builds a fresh game (`{ side?, handSize?, seed? }`).
  - `visibleTile(state)` — the gem currently being placed (`hand[0]`).
  - `planMove(state, cellKey)` / `isLegalTarget` / `hasAnyLegalMove` — legality + planning.
  - `place(state, cellKey)` — **the** state transition (handles activate / bank / bust).
  - `bankClusterNow(state, cellKey)` — the "free/early bank" action.
  - `endStuck(state)` — ends the game when the last tile has no legal move.
  - `describePlace(state, cellKey)` — read-only outcome for the animation layer.
  - `logOnly(state, text)` — append a log line without changing state.

### UI (`src/ui/`)

- **`layout.ts`** — `computeLayout(state)` → pixel positions for each cell; `HEX_RADIUS` (30).
- **`TileGem.tsx`** — The six mineral shapes + Dross/Nebulite as inline SVG. `jokerValue` recolours
  a Nebulite to mirror a mineral while keeping the Nebulite shape + glow ring.
- **`Board.tsx`** — The pointy-top board renderer. Props for animation state: `litCells`,
  `redCells`, `hiddenCells`, plus `interactive` and an `onMapper` callback that hands the
  parent a cell-key → screen-coords function (used by the flying overlay).
- **`Panels.tsx`** — `HUD` (the SCORE / BANKS-pips / BUSTS-pips bar via a `PipStat`
  component), `HandBar`, `TileLegend`, `ComboLegend`, `LogPanel`.
- **`useNebuliteGame.ts`** — The orchestration hook. Owns the `AnimState`, drives every
  multi-phase animation (bank, early bank, bust, shrink, stuck-bust), and is where all timing
  lives (the `T` constants near the top). Exposes `{ state, anim, onPlace, start, setMapper,
  at, earlyBankOffer, bankNow }`.
- **`FlyingOverlay.tsx`** — Renders tiles in flight in screen space (to score / hand / gap /
  multiplier-park), driven by the `flying` array in `AnimState`. `FLY_MS` controls durations.
- **`EarlyBankButton.tsx`** — The timed BANK overlay: 1s grace, then a 3-2-1 countdown with a
  draining bar (4s total).

### Composition

- **`App.tsx`** — Wires it together: header, HUD, board (with the shrink scale transform and
  the "SHRINKING" overlay word), bottom row (hand + early-bank button + log), the side panel
  (legends), the flying overlay, and the end-game popup (with the score table).

---

## 4. How a turn flows (worked example)

1. User taps a cell. `App` → `onPlace(cellKey)` in the hook.
2. The hook calls `describePlace(state, cellKey)` to classify the outcome
   (`activate` / `bank` / `bust`).
3. **Bank:** the hook freezes the pre-commit board, lights up the cluster one tile at a time,
   flies them to the score, then calls `place()` to get `committed` + `committed.lastResolved`,
   and animates the rest (strand overflow → hand, isolated → score, buried → hand, clear bonus,
   shrink if any), then commits the new state and reveals the next tile.
4. **Bust:** the hook clears the activated group visually, flies recovered/buried tiles to the
   hand, drops the next tile inert into the gap, then plays the RESHUFFLE banner + shake while
   the board nudges.
5. **Activate (no bank):** the hook shows the placed tile and animates the covered tile to
   where it goes (hand or score), then commits.

The crucial invariant: **the engine has already decided the outcome**; the UI is only
choreographing it. `state.lastResolved` is the contract.

---

## 5. Determinism, testing, and debugging

- **Seeded RNG.** `newGame({ seed })` makes a run fully reproducible. The seed advances through
  `state.rngState`. This is how the test scripts and bug repros work.
- **Engine tests.** During development the engine was validated with standalone `tsx` scripts
  (combo coverage, phase tests, joker lock, shrink, early-bank, the bug-fix repros, a 100-game
  invariant check, and a 200-game stability simulation). If you continue with a test runner,
  **Vitest** fits this codebase well — the engine is pure, so tests are just
  `expect(place(newGame({seed}), key))…`. Porting the existing ad-hoc scripts into `*.test.ts`
  under a `tests/` folder is a good first hardening task.
- **Visual/manual debugging.** The pattern used during development: temporarily add a
  `?debug=NAME` branch in `buildInitial()` (in `useNebuliteGame.ts`) that constructs a specific
  board, build, and drive it. **Always remove debug branches before committing** (grep for
  `debug=`).

---

## 6. What's done

- Full rules engine: activation, combos, chains, multipliers, the Nebulite joker, Nebulite respawn,
  buried-tile recovery, same-value overflow (incl. across a joker-Nebulite), board shrink, the
  3-free-banks economy, the 3-lives economy, reshuffle + board nudge, and the no-move end.
- All animations: bank, early bank, bust, the dramatic shrink, the stuck-bust, the end screen.
- The repurposed HUD (SCORE / BANKS pips / BUSTS pips) and the end-game summary table.
- Squads-aligned theming via CSS variables with automatic light/dark.

## 7. What's open / next

In rough priority order:

1. **Visual design.** The current UI is functional but plain. A proper design is briefed in
   `CLAUDE_DESIGN_BRIEF.md` (hand it to Claude Design). After that: implement the design,
   replacing the inline styles in `App.tsx`/`Panels.tsx` and the SVG gems in `TileGem.tsx`.
2. **Mobile layout.** It's built mobile-first conceptually but the layout hasn't been tuned for
   small screens (the right-hand legends/log should probably move or collapse on mobile).
3. **Persistence.** No save/resume; no high-score storage. Browser storage was off-limits in the
   prototype environment — in a normal app you can add `localStorage` (or a backend) freely.
4. **Sound.** None yet. Banks, busts, the shrink, and the early-bank countdown all want audio.
5. **Test runner.** Port the ad-hoc `tsx` scripts to Vitest (see §5).
6. **Tuning.** Difficulty (hand size vs. board size), the early-bank count, lives count, and
   the shrink trigger are all easy knobs — see the constants in `engine.ts` / `combos.ts`.
7. **Onboarding/tutorial.** New players need to learn activation, banking, and the bust risk;
   there's no tutorial yet.

## 8. Gotchas & conventions

- **Don't put rules in the UI.** If you find yourself computing scores or legality in a
  component, it belongs in the engine. The UI reads `lastResolved` and calls `describePlace`.
- **`lastResolved` is reset per resolution.** If you add a new animated effect, record it in
  `lastResolved` inside the engine and consume it in the hook — don't infer it in the UI.
- **Pointy-top hexes, `"q,r"` keys.** Don't assume offset coordinates.
- **No browser storage in the current build.** If you add it, do it deliberately; it was
  intentionally absent.
- **Dross only appears at setup.** Two Dross tiles + one Nebulite are placed at game start, each on top
  of a mineral. Dross never respawns; the Nebulite respawns until the board shrinks, then never.
- **Animation timing is centralised.** Tune the `T` object (hook) and `FLY_MS` (overlay) rather
  than sprinkling `setTimeout`s.

## 9. Where the docs live

- `README.md` — run it, rules summary, structure, status.
- `HANDOVER.md` — this document.
- `Glint_GDD` — the full Game Design Document (design rationale + the complete ruleset).
- `CLAUDE_DESIGN_BRIEF.md` — the brief to hand to Claude Design for the visual design.
- The `*.md` change logs written during development (FIXES_AND_TWEAKS, BUGFIXES_2/3,
  TWEAKS_BATCH, SHRINK_DRAMA) document the history of what changed and why — keep them for
  context but the README + GDD are the current source of truth.
