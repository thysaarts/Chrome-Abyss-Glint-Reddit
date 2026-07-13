# Chrome-Abyss-Glint

Glint is a single-player push-your-luck puzzle set in the Chrome Abyss universe. Clear a
hexagonal board of mineral gems by building combos that bank once six connect. Every move
gambles banking points against a bigger multiplier — overreach and you bust. Dodge the Dross
trap, refine overflow into shape-shifting Nebulite wilds, and survive two board collapses down
to the frantic **GLINT RUSH** final round.

Built in **Vite + React + TypeScript**. The game engine is complete and unit-tested; the UI is
the hi-fi **Chrome Abyss: Glint** visual design (dark-mode hero, faceted Foundry-cut gems,
Chakra Petch / Saira / Share Tech Mono type) — see `design_handoff_glint/` for the source spec.

---

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` — type-check only, no output |

Node 18+ recommended.

---

## Levels — "The Ascent" (campaign)

From the Start screen, **START** opens the **Levels** map (a vertical campaign of hex tiles
on a glowing conduit) and **Quick start** drops you straight into a standard game. On the
Levels map: **Continue** resumes the current level, tapping an unlocked tile plays it,
**Quick start** launches a standard game outside the campaign, **Scores** shows your top-6
leaderboard, and **Exit** returns to the menu. In-game, **Exit** returns to the Levels map.

A level is **not** a bespoke game — it's a set of parameters fed to the standard generator
(`newGame`): board size (collapse count follows: side-6 → 2, side-5 → 1, side-4 → 0), the
number of Dross and Nebulites seeded on the board, and the two collapse thresholds. Beating a
level's requirement (bank N times, clear the board, earn a score, …) unlocks the next; progress
and scores persist in `localStorage`. See `src/levels/`.

## How to play

You are clearing a hexagonal board of mineral tiles by **activating** and **banking** combos.

- The board always starts as a **side-6 hexagon (91 cells)**, collapses to a **side-5
  hexagon (61 cells)** once tiles drop to 30, then collapses again to a **side-4 hexagon
  (37 cells)** at 15 tiles — the **GLINT RUSH** final round (see "The Abyss Collapses").
- **NOW PLACING** shows your current gem. **UP NEXT** shows how many tiles remain in your
  stack; their values are hidden — that hidden order is the luck.
- **Tap a board cell** to place your gem. The placement **activates a whole combo** by
  pulling in the connected matching tiles already on the board (one Chromite placed next to
  two Chromites = a Trips of three). Activated combos glow and persist across turns.
- A **bank** fires automatically when a **connected cluster** of activated tiles reaches
  **6 or more**. Only that cluster banks and clears; disconnected activated combos stay lit.
- If a placement **can't form a combo, you bust** — the whole activated group is lost.

### The six minerals (shape = value)

| Value | Mineral | Shape | Count in deck |
|---|---|---|---|
| 1 | Duneglass | circle | 25 |
| 2 | Vigilite | vertical almond | 20 |
| 3 | Chromite | triangle | 15 |
| 4 | Verdite | diamond | 15 |
| 5 | Umbrite | pentagon | 15 |
| 6 | Nuracite | hexagon | 10 |

### Special tiles

- **Dross** (value 0, gold): worthless. It can never form a combo, so placing one always
  busts. Two Dross tiles are on the board at game start, each covering a mineral.
- **Nebulite** (value 7, violet): a shape-shifting **wild**. As a board tile it mirrors an
  adjacent placement to complete a set, and covering/banking/clearing it pays **+500**. You can
  also **hold and place** a Nebulite yourself — it becomes whichever mineral makes the best
  legal combo from its neighbours, then banks as a Nebulite. One Nebulite is on the board at
  start (covering a mineral); you earn more via **Mother Lode** overflow (see below).

---

## Scoring (quick reference)

**Combos** (base points):

| Combo | What | Base |
|---|---|---|
| Echo | a pair of 2s **or** 6s only | 300 |
| Trips | three of a kind | 300 |
| Quad | four of a kind | 400 |
| Pentad | five of a kind | 500 |
| Hex | six of a kind (banks on its own) | 600 |
| Drift | four consecutive values in a connected straight | 400 |
| Full Drift | six consecutive values in a connected straight (banks on its own) | 800 |

**Chains** (added *after* the multiplier, when one bank contains multiple combos):

| Chain | Condition | Bonus |
|---|---|---|
| Convergence | two sets | +100 |
| Harmony | three sets | +300 |
| Accord | a Drift + a set | +200 |
| Long Drift | two Drifts | +200 |

**Scoring order:** `base sum × multiplier + chain bonus (+ Nebulite bonus if a Nebulite was covered)`.
The **multiplier** is the value of the tile covered by the *finishing* placement of a bank.

**Board-clear bonus:** clearing the whole board awards a flat **+5,000**.

**Mother Lode (overflow bonus):** every same-value tile that overflows to your hand when a long
chain banks is worth **+50**. Every full **6** overflow tiles are **refined into a Nebulite** in
your hand (any remainder still comes to hand as normal minerals) — e.g. a 12-Duneglass chain
banks a Hex, overflows 6, and refines them into **1 Nebulite (+300)**.

---

## Key rules and mechanics

These are the rules the engine implements. The Game Design Document (`Glint_GDD`) has the
full design rationale; this is the implemented behaviour.

1. **Activation model.** One placement activates an entire combo by absorbing the connected
   matching board tiles. Activated combos glow and accumulate across turns until a connected
   cluster reaches 6+ and banks (only that cluster clears).
2. **Drifts are true straights.** A Drift/Full Drift is a connected run where each tile is
   adjacent to the next in value order (1–2–3–4). A loose group that merely *contains* the
   right values is **not** a Drift.
3. **Same-value overflow → Mother Lode.** When a connected same-value group of 7+ banks a Hex,
   the Hex is taken from the 6 tiles nearest the placement; the remaining same-value tiles
   overflow to your **hand**. The overflow walk crosses a joker-Nebulite that is part of the
   cluster, so no same-value tile is ever left stranded across the Nebulite. Each overflow tile
   scores **+50**, and every full **6** are **refined into a Nebulite** (the rest still go to
   the hand) — presented as a "Mother Lode" fusion animation.
4. **Buried tiles always return to the hand.** Every Dross tile and the Nebulite sits on top of a
   mineral (set at game start; the Nebulite also re-buries when it respawns). Whenever a Dross tile or
   the Nebulite leaves the board — covered, busted onto, cleared in a bank, or isolated — the mineral
   buried beneath it returns to your hand (and animates there).
5. **The Nebulite joker (and wild).** A Nebulite adjacent to a placement can mirror the placed
   value to complete a matching set, banks for +500, returns its buried tile, and arms its
   respawn. A Nebulite you **hold and place yourself** is a wildcard: it simulates becoming each
   mineral and commits the one with the best legal outcome (a bank beats a non-bank; banks are
   ranked by actual score), then behaves as a joker-Core (+500 when its cluster banks). Once a
   joker-Core is inside an activated combo it **locks** onto the value it mirrored, so later
   same-value tiles can extend the combo through it. A Nebulite is never wasted as the
   forced inert tile of a bust — the bust drops an ordinary tile instead.
6. **Nebulite respawn.** A cleared Nebulite respawns one placement later, always landing on a mineral
   (burying it, so you get that tile back later). **It does not respawn after the board has
   shrunk** — the shrink performs the Nebulite's final respawn, then it is gone for good.
7. **The Abyss Collapses (board shrink), twice.** When tiles on the board drop to **30**, the
   side-6 board collapses to side-5 (91 → 61 cells), remapping tiles inward (pre-banked combos
   first) and performing the Nebulite's final respawn. When tiles then drop to **15**, it
   collapses again to side-4 (61 → 37 cells) — the **GLINT RUSH** final round. Both are dramatic
   multi-phase animations; the second is followed by a "GLINT RUSH / FINAL ROUND" title.
8. **GLINT RUSH (final round).** After the 37-cell collapse, banks are **infinite** and the bank
   threshold drops to 2 — **any combo banks immediately**. The BANKS HUD shows **∞** and the
   timed BANK button no longer appears.
9. **Three free banks.** You may "bank early" up to **3 times** per game via a timed BANK
   button that appears after you make a combo (a 1-second grace, then a 3-2-1 countdown — 4s
   total). An early bank scores the cluster at **base value** (no multiplier, no chain). Once
   all 3 free banks are used, the button no longer appears. (In GLINT RUSH, banks are infinite.)
10. **Three lives.** You can bust **3 times**; the third bust ends the game. The top bar shows
    3 heart pips that grey out per bust.
11. **Reshuffle on Dross clear and on every bust.** Clearing a Dross tile, and every bust,
    reshuffles your hidden stack **and** nudges the board (a random 1–6 tiles each drift one
    cell into an empty neighbour, excluding glowing combos). Tiles with no empty neighbour
    stay put.
12. **No-move final turn.** If you are on your last tile and have no legal move anywhere, the
    game shows "BUST" briefly and ends.

---

## Top bar (HUD)

The HUD shows only three things:

- **SCORE** — current score.
- **BANKS** — 3 gold diamond pips = your remaining **free** banks (grey out as used); shows **∞**
  once GLINT RUSH begins.
- **BUSTS** — 3 heart pips = your remaining **lives** (grey out as used).

The end-of-game summary shows the final score, the +5,000 board-clear bonus (if cleared), and
your run totals: **times banked** (automatic + free) and **times busted**.

---

## Animations

The engine is **pure and synchronous**; all timing lives in the UI layer (`useNebuliteGame.ts`
plus `FlyingOverlay.tsx`). The next tile is only revealed once an animation finishes, so you
can't act mid-animation. Timing constants live in the `T` object in `useNebuliteGame.ts` and
`FLY_MS` in `FlyingOverlay.tsx`.

- **Bank:** hold the glow (~0.5s) → light up the cluster one-by-one outward from the placed
  tile (~0.25s/tile) → tiles fly to the SCORE box (~1s). The covered multiplier tile parks
  beside the score and flies in last. Strand overflow flies to the hand; isolated tiles fly
  to the score.
- **Early bank (BANK button):** the same light-up-then-fly sequence, at base value.
- **Bust:** the activated group clears, the recovered/buried tile flies to the hand, the next
  tile drops inert into the gap, then a RESHUFFLE banner + board shake while the board nudges.
- **Mother Lode:** on a 6+ overflow refine, the overflowed tiles gather to screen centre, show
  "\<gem\> ×6", morph into the Nebulite under a **MOTHER LODE** banner, then the Nebulite flies
  into the hand (with its own synthesized "refine" sound).
- **The Abyss Collapses:** a phased shrink — the board shakes and a huge "COLLAPSE" word slams
  across it, the board scales down in beats while **all tiles stay on it** (nothing blips out),
  then the new smaller board (61, then 37) is revealed at full size with the tiles remapped.
- **GLINT RUSH:** after the second (61 → 37) collapse, a "GLINT RUSH / FINAL ROUND" title
  **sweeps in from the side** with a whoosh + stinger, announcing the infinite-banks final round.

---

## Project structure

```
src/
  theme/theme.ts        COLOURS + FONTS (references Squads CSS vars in index.css)
  index.css             the Squads light/dark CSS variables + keyframes (shake, banner pop)
  main.tsx              React entry point
  game/                 ENGINE (pure, framework-free, unit-tested)
    hex.ts              pointy-top axial hex geometry (ring, distance, neighbours)
    combos.ts           combo + chain detection and scoring (COMBO_POINTS, scoreBank, …)
    activation.ts       one placement -> a whole combo; 7+ strand -> Hex from nearest 6
    shrink.ts           board collapse 91 -> 61, remapping tiles inward (combos first)
    engine.ts           the state machine: GameState, place(), bankClusterNow(),
                        describePlace() (read-only outcome for the animation layer), etc.
  ui/                   PRESENTATION (React)
    layout.ts           board layout (px positions), HEX_RADIUS
    TileGem.tsx         the six mineral shapes + Dross/Nebulite as SVG gems
    Board.tsx           hex board renderer (pointy-top) + lit/hidden/red animation states
    Panels.tsx          HUD (pip stats), HandBar, TileLegend, ComboLegend, LogPanel
    useNebuliteGame.ts  animation orchestration hook (phases, timing, all side effects)
    FlyingOverlay.tsx   tiles in flight to score/hand/gap (screen space)
    EarlyBankButton.tsx the timed BANK overlay (1s grace + 3-2-1 countdown)
  App.tsx               composition + flying-tile anchors + end-game popup
```

---

## Architecture notes (for developers)

- **Engine ↔ UI split.** `src/game/*` has no React and no timing. State transitions are pure
  functions of `(GameState, cellKey) → GameState`. The UI calls `describePlace()` to learn
  what *would* happen (so it can animate), then calls `place()` to commit. The engine records
  everything the UI needs to animate in `state.lastResolved` each turn.
- **Determinism.** Randomness uses a seeded RNG (mulberry32) carried in `state.rngState`, so a
  given seed replays identically — useful for tests and reproducing bugs (`newGame({ seed })`).
- **Hex layout.** Pointy-top axial coordinates; cell keys are `"q,r"` strings. `order` is the
  stable iteration order; `adj` is precomputed neighbours.
- **No browser storage.** The prototype keeps all state in memory (per the artifact
  constraints it was built under). There is no save/resume yet.

---

## Status & next steps

- The **engine is complete and stable**: full regression of combo/chain/activation/shrink/
  bank/bust tests passes, plus a 200-game stability simulation with zero crashes.
- The **UI is functional but unstyled** — it uses inline styles and the Squads tokens, with no
  real layout/identity work. The next major step is a proper visual design (see
  `CLAUDE_DESIGN_BRIEF.md`) and then implementing it.
- See `HANDOVER.md` for the full developer handover (what's done, what's open, where things
  live, how to continue in VS Code + Claude Code).

## Balance

The game is intended to be **hard but clearable** by a skilled human. Blunt bots clear only
~1–3% of games; the Nebulite-always-buries-a-mineral rule keeps the hand topped up, and the shrink
re-concentrates stranded tiles to make a late clear reachable. Hand size vs. board size is the
main tuning knob; `newGame({ handSize })` is the lever.
